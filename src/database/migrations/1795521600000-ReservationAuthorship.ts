import { MigrationInterface, QueryRunner } from "typeorm";

const RESERVATIONS = "N'dbo.vc_reservations'";
const HISTORY = "N'dbo.vc_reservation_history'";

/**
 * Reservation authorship:
 * - vc_reservations.created_by (uniqueidentifier NULL, FK fk_vc_reservations_created_by -> vc_users, no cascade,
 *   ix_vc_reservations_created_by): the account that created the reservation. The application always writes the
 *   authenticated actor on POST /reservations and never updates it. NULL = system/unknown.
 * - Backfill from the CREATED history event (changed_by); never from client_id (staff may book for a client).
 *   Reservations without a CREATED event, or whose CREATED event has no author, stay NULL (their count is reported).
 * - uq_vc_reservation_history_created: at most one CREATED event per reservation (filtered unique index), so the
 *   invariant created_by = CREATED.changed_by is well defined. The history is append-only (trigger), so duplicates
 *   cannot be cleaned here: they abort the migration.
 * THROW codes 51070-51079.
 */
export class ReservationAuthorship1795521600000 implements MigrationInterface {
  name = "ReservationAuthorship1795521600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    // Each required table and the migration that creates it.
    const origins: Record<string, string> = {
      vc_users: "UserRolesAndEmployees", vc_reservations: "ReservationsAndClinicalVisits", vc_reservation_history: "ReservationsAndClinicalVisits",
    };
    for (const [table, migration] of Object.entries(origins)) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) {
        throw new Error(`Missing dbo.${table} (created by ${migration}); apply the earlier migrations up to AnimalOwners first.`);
      }
    }
    if (await queryRunner.hasColumn("dbo.vc_reservations", "created_by")) {
      throw new Error("vc_reservations.created_by already exists; review migration state.");
    }

    // 1. Filtered indexes need ANSI_NULLS and QUOTED_IDENTIFIER ON in the creating session.
    await queryRunner.query(`SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`);
    await queryRunner.query(`
      IF SESSIONPROPERTY('ANSI_NULLS') <> 1 OR SESSIONPROPERTY('QUOTED_IDENTIFIER') <> 1
        THROW 51070, 'ANSI_NULLS and QUOTED_IDENTIFIER must be ON to create the filtered unique index.', 1;
    `);

    // 2. Preconditions, holding exclusive table locks until commit: no reservation or history row changes meanwhile.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[vc_reservations] WITH (TABLOCKX, HOLDLOCK);
      SELECT @locked = COUNT(*) FROM [dbo].[vc_reservation_history] WITH (TABLOCKX, HOLDLOCK);
      IF COL_LENGTH(${RESERVATIONS}, N'created_by') IS NOT NULL
        OR OBJECT_ID(N'dbo.fk_vc_reservations_created_by', N'F') IS NOT NULL
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${RESERVATIONS}) AND [name] = N'ix_vc_reservations_created_by')
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${HISTORY}) AND [name] = N'uq_vc_reservation_history_created')
        THROW 51071, 'Reservation authorship objects already exist; review migration state.', 1;
      IF OBJECT_ID(N'dbo.fk_vc_reservation_history_changed_by', N'F') IS NULL
        OR OBJECT_ID(N'dbo.tr_vc_reservation_history_append_only', N'TR') IS NULL
        THROW 51072, 'fk_vc_reservation_history_changed_by or tr_vc_reservation_history_append_only is missing; review migration state.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_reservation_history] WHERE [action] = N'CREATED'
        GROUP BY [reservation_id] HAVING COUNT(*) > 1)
        THROW 51073, 'Some reservations have more than one CREATED history event; the history is append-only, review them before migrating.', 1;
    `);

    // 3. Author of the reservation (NULL = system/unknown).
    await queryRunner.query(`ALTER TABLE [dbo].[vc_reservations] ADD [created_by] uniqueidentifier NULL;`);

    // 4. Backfill (later batch: references the new column) from the single CREATED event, never from client_id.
    //    No trigger maintains updated_at, so the backfill leaves it unchanged.
    await queryRunner.query(`
      UPDATE r SET r.[created_by] = h.[changed_by]
      FROM [dbo].[vc_reservations] r
      INNER JOIN [dbo].[vc_reservation_history] h ON h.[reservation_id] = r.[id] AND h.[action] = N'CREATED'
      WHERE h.[changed_by] IS NOT NULL;
    `);

    // 5. Backfill verification (depends on step 4): created_by equals the CREATED author wherever one exists, and is
    //    NULL for reservations without an authored CREATED event.
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[vc_reservations] r
          LEFT JOIN [dbo].[vc_reservation_history] h ON h.[reservation_id] = r.[id] AND h.[action] = N'CREATED'
          WHERE (h.[changed_by] IS NULL AND r.[created_by] IS NOT NULL)
            OR (h.[changed_by] IS NOT NULL AND (r.[created_by] IS NULL OR r.[created_by] <> h.[changed_by])))
        THROW 51074, 'The backfilled vc_reservations.created_by does not match the CREATED history events.', 1;
    `);

    // 6. Trusted FK (WITH CHECK), no cascade; indexes.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_reservations] WITH CHECK ADD
        CONSTRAINT [fk_vc_reservations_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[vc_users] ([id]);
      CREATE INDEX [ix_vc_reservations_created_by] ON [dbo].[vc_reservations] ([created_by]);
      CREATE UNIQUE INDEX [uq_vc_reservation_history_created] ON [dbo].[vc_reservation_history] ([reservation_id])
        WHERE [action] = N'CREATED';
    `);

    // 7. Final verification.
    await queryRunner.query(`
      IF COL_LENGTH(${RESERVATIONS}, N'created_by') IS NULL
        OR COLUMNPROPERTY(OBJECT_ID(${RESERVATIONS}), N'created_by', 'AllowsNull') <> 1
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'fk_vc_reservations_created_by'
          AND [parent_object_id] = OBJECT_ID(${RESERVATIONS}) AND [is_not_trusted] = 0 AND [delete_referential_action] = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${RESERVATIONS}) AND [name] = N'ix_vc_reservations_created_by')
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${HISTORY})
          AND [name] = N'uq_vc_reservation_history_created' AND [is_unique] = 1 AND [has_filter] = 1)
        THROW 51079, 'vc_reservations or vc_reservation_history is not in the expected final state.', 1;
    `);

    // 8. Report the reservations left without a known author (no CREATED event, or one without changed_by).
    const [report] = (await queryRunner.query(`SELECT COUNT(*) AS [withoutAuthor] FROM [dbo].[vc_reservations] WHERE [created_by] IS NULL;`)) ?? [];
    if (report?.withoutAuthor > 0) {
      queryRunner.connection?.logger?.log("warn", `ReservationAuthorship: ${report.withoutAuthor} reservation(s) have no known author (created_by NULL).`);
    }
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard the authorship (created_by) of reservations and the uniqueness of their CREATED history events. Restore a backup taken before this migration.");
  }
}
