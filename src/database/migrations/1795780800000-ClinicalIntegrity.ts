import { MigrationInterface, QueryRunner } from "typeorm";

const RESERVATIONS = "vc_reservations";
const VISITS = "vc_clinical_visits";
const VISIT_TRIGGER = "tr_vc_clinical_visits_reservation_integrity";
const RESERVATION_TRIGGER = "tr_vc_reservations_visit_integrity";

/**
 * Clinical integrity between reservations (vc_reservations) and clinical visits (vc_clinical_visits), enforced by two
 * set-based DML triggers, both AFTER INSERT, UPDATE:
 * - tr_vc_clinical_visits_reservation_integrity (on vc_clinical_visits):
 *   UPDATE: id, animal_id and reservation_id are immutable (null-safe comparison through INTERSECT);
 *   INSERT: a visit linked to a reservation requires that reservation to be CONFIRMED.
 * - tr_vc_reservations_visit_integrity (on vc_reservations):
 *   a reservation can only become COMPLETED with a COMPLETED visit; a reservation with an IN_PROGRESS or COMPLETED
 *   visit cannot become CANCELLED, NO_SHOW or PENDING.
 * Both triggers are set-based (multi-row safe), run SET NOCOUNT ON and read the other table WITH (READCOMMITTEDLOCK),
 * so the checks see the latest committed rows and stay correct under READ_COMMITTED_SNAPSHOT (RCSI).
 * The rules are TRANSITION rules: they only apply to inserted rows, or to rows whose relevant column changed (status on
 * vc_reservations; id, animal_id and reservation_id on vc_clinical_visits). Existing rows are validated once, in up(),
 * by batch 2 (51102, 51103).
 * Walk-in visits (reservation_id NULL) remain allowed: there is no reservation to check.
 * Application order (mandatory): clinical-visit complete() updates the visit to COMPLETED before it updates the
 * reservation to COMPLETED, because the reservation trigger reads the visit inside the same transaction.
 * Error mapping: a THROW inside a trigger aborts the transaction and may be followed by Msg 3616 (severity 16). The
 * error mapping (PersistenceService) must look for the code in error and in precedingErrors, at every level.
 * THROW codes 51100-51109 (51108 reserved, not used).
 * down() drops only the two triggers, each in its own batch. No data is lost: tables, columns, rows and the unique
 * index are untouched.
 */
export class ClinicalIntegrity1795780800000 implements MigrationInterface {
  name = "ClinicalIntegrity1795780800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    // Both tables come from ReservationsAndClinicalVisits (which also creates the status, animal_id and reservation_id
    // columns and uq_vc_clinical_visits_reservation_id).
    for (const table of [RESERVATIONS, VISITS]) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) {
        throw new Error(`Missing dbo.${table} (created by ReservationsAndClinicalVisits); apply the earlier migrations first.`);
      }
    }

    // 1. Preconditions, holding exclusive table locks until commit: no reservation or visit changes meanwhile.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[${RESERVATIONS}] WITH (TABLOCKX, HOLDLOCK);
      SELECT @locked = COUNT(*) FROM [dbo].[${VISITS}] WITH (TABLOCKX, HOLDLOCK);
      IF OBJECT_ID(N'dbo.${VISIT_TRIGGER}', N'TR') IS NOT NULL
        OR OBJECT_ID(N'dbo.${RESERVATION_TRIGGER}', N'TR') IS NOT NULL
        THROW 51100, 'Clinical integrity triggers already exist; review migration state.', 1;
      IF COL_LENGTH(N'dbo.${RESERVATIONS}', N'status') IS NULL OR COL_LENGTH(N'dbo.${VISITS}', N'status') IS NULL
        OR COL_LENGTH(N'dbo.${VISITS}', N'reservation_id') IS NULL OR COL_LENGTH(N'dbo.${VISITS}', N'animal_id') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(N'dbo.${VISITS}')
          AND [name] = N'uq_vc_clinical_visits_reservation_id' AND [is_unique] = 1)
        THROW 51101, 'vc_reservations or vc_clinical_visits is missing a required column or uq_vc_clinical_visits_reservation_id; review migration state.', 1;
    `);

    // 2. Existing data, in the same transaction (the TABLOCKX locks of batch 1 still hold).
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[${RESERVATIONS}] AS r WHERE r.[status] = N'COMPLETED'
        AND NOT EXISTS (SELECT 1 FROM [dbo].[${VISITS}] AS v WHERE v.[reservation_id] = r.[id] AND v.[status] = N'COMPLETED'))
        THROW 51102, 'vc_reservations has COMPLETED reservations without a COMPLETED clinical visit; fix them before this migration.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[${RESERVATIONS}] AS r WHERE r.[status] IN (N'CANCELLED', N'NO_SHOW', N'PENDING')
        AND EXISTS (SELECT 1 FROM [dbo].[${VISITS}] AS v WHERE v.[reservation_id] = r.[id] AND v.[status] IN (N'IN_PROGRESS', N'COMPLETED')))
        THROW 51103, 'vc_reservations has CANCELLED, NO_SHOW or PENDING reservations with an IN_PROGRESS or COMPLETED clinical visit; fix them before this migration.', 1;
    `);

    // 3. Visit trigger, alone in its batch (CREATE TRIGGER must be the first statement of a batch).
    await queryRunner.query(`
      CREATE TRIGGER [dbo].[${VISIT_TRIGGER}] ON [dbo].[${VISITS}]
      AFTER INSERT, UPDATE
      AS
      BEGIN
        SET NOCOUNT ON;
        IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
          -- UPDATE: id, animal_id and reservation_id are immutable (null-safe comparison through INTERSECT).
          IF (UPDATE([id]) OR UPDATE([animal_id]) OR UPDATE([reservation_id]))
            AND EXISTS (SELECT 1 FROM deleted AS d WHERE NOT EXISTS (
              SELECT 1 FROM inserted AS i WHERE i.[id] = d.[id] AND i.[animal_id] = d.[animal_id]
                AND EXISTS (SELECT i.[reservation_id] INTERSECT SELECT d.[reservation_id])))
            THROW 51104, 'vc_clinical_visits.animal_id and reservation_id cannot be changed.', 1;
          RETURN;
        END
        -- INSERT: a visit linked to a reservation requires that reservation to be CONFIRMED (walk-ins have no reservation).
        IF EXISTS (SELECT 1 FROM inserted AS i
          JOIN [dbo].[${RESERVATIONS}] AS r WITH (READCOMMITTEDLOCK) ON r.[id] = i.[reservation_id]
          WHERE r.[status] <> N'CONFIRMED')
          THROW 51105, 'A clinical visit can only be created for a CONFIRMED reservation.', 1;
      END
    `);

    // 4. Reservation trigger, alone in its batch.
    await queryRunner.query(`
      CREATE TRIGGER [dbo].[${RESERVATION_TRIGGER}] ON [dbo].[${RESERVATIONS}]
      AFTER INSERT, UPDATE
      AS
      BEGIN
        SET NOCOUNT ON;
        -- Only status transitions are checked; on INSERT UPDATE([status]) is true.
        IF NOT UPDATE([status]) RETURN;
        IF EXISTS (SELECT 1 FROM inserted AS i LEFT JOIN deleted AS d ON d.[id] = i.[id]
          WHERE i.[status] = N'COMPLETED' AND (d.[id] IS NULL OR d.[status] <> i.[status])
            AND NOT EXISTS (SELECT 1 FROM [dbo].[${VISITS}] AS v WITH (READCOMMITTEDLOCK)
              WHERE v.[reservation_id] = i.[id] AND v.[status] = N'COMPLETED'))
          THROW 51106, 'A reservation can only become COMPLETED with a COMPLETED clinical visit.', 1;
        IF EXISTS (SELECT 1 FROM inserted AS i LEFT JOIN deleted AS d ON d.[id] = i.[id]
          WHERE i.[status] IN (N'CANCELLED', N'NO_SHOW', N'PENDING') AND (d.[id] IS NULL OR d.[status] <> i.[status])
            AND EXISTS (SELECT 1 FROM [dbo].[${VISITS}] AS v WITH (READCOMMITTEDLOCK)
              WHERE v.[reservation_id] = i.[id] AND v.[status] IN (N'IN_PROGRESS', N'COMPLETED')))
          THROW 51107, 'A reservation with an IN_PROGRESS or COMPLETED clinical visit cannot become CANCELLED, NO_SHOW or PENDING.', 1;
      END
    `);

    // 5. Final verification: both triggers enabled, on the right tables, for INSERT and UPDATE only (no DELETE).
    await queryRunner.query(`
      IF (SELECT COUNT(*) FROM sys.triggers AS t
          WHERE t.[is_disabled] = 0 AND t.[is_instead_of_trigger] = 0
            AND ((t.[name] = N'${VISIT_TRIGGER}' AND t.[parent_id] = OBJECT_ID(N'dbo.${VISITS}'))
              OR (t.[name] = N'${RESERVATION_TRIGGER}' AND t.[parent_id] = OBJECT_ID(N'dbo.${RESERVATIONS}')))
            AND (SELECT COUNT(*) FROM sys.trigger_events AS e WHERE e.[object_id] = t.[object_id] AND e.[type_desc] IN (N'INSERT', N'UPDATE')) = 2
            AND NOT EXISTS (SELECT 1 FROM sys.trigger_events AS e WHERE e.[object_id] = t.[object_id] AND e.[type_desc] = N'DELETE')) <> 2
        THROW 51109, 'The clinical integrity triggers are not in the expected final state.', 1;
    `);
  }

  /** Removes only the two triggers, each in its own batch. No data is lost: tables, columns and rows are untouched. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`IF OBJECT_ID(N'dbo.${RESERVATION_TRIGGER}', N'TR') IS NOT NULL DROP TRIGGER [dbo].[${RESERVATION_TRIGGER}];`);
    await queryRunner.query(`IF OBJECT_ID(N'dbo.${VISIT_TRIGGER}', N'TR') IS NOT NULL DROP TRIGGER [dbo].[${VISIT_TRIGGER}];`);
  }
}
