import { MigrationInterface, QueryRunner } from "typeorm";

const OWNERS = "N'dbo.vc_animal_owners'";
const ANIMALS = "N'dbo.vc_animals'";
const HISTORY = "N'dbo.vc_reservation_history'";

/** Reservation history actions after this migration (the previous list plus CLIENT_CHANGED). */
export const RESERVATION_HISTORY_ACTIONS = [
  "CREATED", "CONFIRMED", "RESCHEDULED", "EMPLOYEE_ASSIGNED", "EMPLOYEE_CHANGED", "CANCELLED", "COMPLETED", "NO_SHOW", "CLIENT_CHANGED",
];
const actionList = RESERVATION_HISTORY_ACTIONS.map(action => `N'${action}'`).join(", ");

/**
 * Multiple tutors per animal:
 * - vc_animal_owners: one row per tutorship period (animal_id, user_id, is_primary, assigned_at, ended_at, assigned_by,
 *   ended_by, end_reason). Rows are immutable periods: closed by the application (ended_at/ended_by/end_reason), never
 *   deleted or rewritten. Filtered unique indexes: one active row per (animal, user) and at most one active primary per
 *   animal. "At least one primary while there are active tutors" is an application rule (transaction + animal lock).
 * - Copy: one active primary row per animal with owner_id (soft-deleted animals included), assigned_at = the animal's
 *   created_at, assigned_by NULL. vc_animals.owner_id is KEPT as a synchronized copy of the active primary tutor.
 * - ix_vc_animals_owner_id on vc_animals(owner_id) (the FK had no index).
 * - ck_vc_reservation_history_action gains CLIENT_CHANGED (dropped and recreated WITH CHECK after validating the rows;
 *   the append-only trigger only blocks UPDATE/DELETE of rows, not DDL).
 * THROW codes 51060-51069.
 */
export class AnimalOwners1795435200000 implements MigrationInterface {
  name = "AnimalOwners1795435200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    // Each required table and the migration that creates it.
    const origins: Record<string, string> = {
      vc_users: "UserRolesAndEmployees", vc_animals: "InitialSqlServer",
      vc_reservations: "ReservationsAndClinicalVisits", vc_reservation_history: "ReservationsAndClinicalVisits",
    };
    for (const [table, migration] of Object.entries(origins)) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) {
        throw new Error(`Missing dbo.${table} (created by ${migration}); apply the earlier migrations up to IntegrityAndLifecycle first.`);
      }
    }
    if (await queryRunner.hasTable("dbo.vc_animal_owners")) throw new Error("dbo.vc_animal_owners already exists; review migration state.");

    // 1. Filtered indexes need ANSI_NULLS and QUOTED_IDENTIFIER ON in the creating session.
    await queryRunner.query(`SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`);
    await queryRunner.query(`
      IF SESSIONPROPERTY('ANSI_NULLS') <> 1 OR SESSIONPROPERTY('QUOTED_IDENTIFIER') <> 1
        THROW 51060, 'ANSI_NULLS and QUOTED_IDENTIFIER must be ON to create the filtered unique indexes.', 1;
    `);

    // 2. Preconditions, holding exclusive table locks until commit: no animal owner or history row changes meanwhile.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[vc_animals] WITH (TABLOCKX, HOLDLOCK);
      SELECT @locked = COUNT(*) FROM [dbo].[vc_reservation_history] WITH (TABLOCKX, HOLDLOCK);
      IF OBJECT_ID(N'dbo.vc_animal_owners', N'U') IS NOT NULL
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${ANIMALS}) AND [name] = N'ix_vc_animals_owner_id')
        OR EXISTS (SELECT 1 FROM sys.objects WHERE [name] LIKE N'%vc[_]animal[_]owners%')
        THROW 51061, 'Animal tutorship objects already exist; review migration state.', 1;
      IF OBJECT_ID(N'dbo.fk_vc_animals_owner', N'F') IS NULL
        OR OBJECT_ID(N'dbo.ck_vc_reservation_history_action', N'C') IS NULL
        OR OBJECT_ID(N'dbo.tr_vc_reservation_history_append_only', N'TR') IS NULL
        THROW 51062, 'fk_vc_animals_owner, ck_vc_reservation_history_action or tr_vc_reservation_history_append_only is missing; review migration state.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_animals] a WHERE a.[owner_id] IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM [dbo].[vc_users] u WHERE u.[id] = a.[owner_id]))
        THROW 51063, 'vc_animals has owner_id values without a vc_users row; correct them before migrating.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_reservation_history]
        WHERE [action] COLLATE Latin1_General_100_BIN2 NOT IN (${actionList}))
        THROW 51064, 'vc_reservation_history has actions outside the expected list; review them before migrating.', 1;
    `);

    // 3. Tutorship periods. No ON DELETE CASCADE; trusted constraints.
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_animal_owners] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_animal_owners_id] DEFAULT NEWSEQUENTIALID(),
        [animal_id] uniqueidentifier NOT NULL,
        [user_id] uniqueidentifier NOT NULL,
        [is_primary] bit NOT NULL CONSTRAINT [df_vc_animal_owners_is_primary] DEFAULT 0,
        [assigned_at] datetime2(3) NOT NULL,
        [ended_at] datetime2(3) NULL,
        [assigned_by] uniqueidentifier NULL,
        [ended_by] uniqueidentifier NULL,
        [end_reason] nvarchar(30) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_animal_owners_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_animal_owners_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_animal_owners] PRIMARY KEY ([id]),
        CONSTRAINT [fk_vc_animal_owners_animal] FOREIGN KEY ([animal_id]) REFERENCES [dbo].[vc_animals] ([id]),
        CONSTRAINT [fk_vc_animal_owners_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [fk_vc_animal_owners_assigned_by] FOREIGN KEY ([assigned_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [fk_vc_animal_owners_ended_by] FOREIGN KEY ([ended_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_animal_owners_dates] CHECK ([ended_at] IS NULL OR [ended_at] >= [assigned_at]),
        CONSTRAINT [ck_vc_animal_owners_ended] CHECK ([ended_at] IS NOT NULL OR ([ended_by] IS NULL AND [end_reason] IS NULL)),
        CONSTRAINT [ck_vc_animal_owners_end_reason] CHECK ([end_reason] IS NULL OR [end_reason] COLLATE Latin1_General_100_BIN2 IN
          (N'TRANSFERRED', N'REMOVED', N'ROLE_CHANGED', N'ACCOUNT_DELETED', N'MIGRATED'))
      );
    `);

    // 4. Indexes (later batch: the table exists). Filtered uniques enforce the tutorship invariants.
    await queryRunner.query(`
      CREATE UNIQUE INDEX [uq_vc_animal_owners_active] ON [dbo].[vc_animal_owners] ([animal_id], [user_id])
        WHERE [ended_at] IS NULL;
      CREATE UNIQUE INDEX [uq_vc_animal_owners_primary] ON [dbo].[vc_animal_owners] ([animal_id])
        WHERE [ended_at] IS NULL AND [is_primary] = 1;
      CREATE INDEX [ix_vc_animal_owners_user_active] ON [dbo].[vc_animal_owners] ([user_id], [animal_id])
        INCLUDE ([is_primary]) WHERE [ended_at] IS NULL;
      CREATE INDEX [ix_vc_animal_owners_animal_assigned] ON [dbo].[vc_animal_owners] ([animal_id], [assigned_at]);
      CREATE INDEX [ix_vc_animal_owners_assigned_by] ON [dbo].[vc_animal_owners] ([assigned_by]);
      CREATE INDEX [ix_vc_animal_owners_ended_by] ON [dbo].[vc_animal_owners] ([ended_by]);
      CREATE INDEX [ix_vc_animals_owner_id] ON [dbo].[vc_animals] ([owner_id]);
    `);

    // 5. Copy: one active primary period per animal with an owner (soft-deleted animals included, so their history
    //    keeps a tutor). assigned_at = the animal's created_at (the process and the server run in UTC).
    await queryRunner.query(`
      INSERT INTO [dbo].[vc_animal_owners] ([animal_id], [user_id], [is_primary], [assigned_at], [ended_at], [assigned_by], [ended_by], [end_reason])
      SELECT a.[id], a.[owner_id], 1, CONVERT(datetime2(3), a.[created_at]), NULL, NULL, NULL, NULL
      FROM [dbo].[vc_animals] a
      WHERE a.[owner_id] IS NOT NULL;
    `);

    // 6. Copy verification (depends on step 5): one active primary per animal with owner_id, equal to owner_id, and
    //    no active row for animals without owner_id.
    await queryRunner.query(`
      IF (SELECT COUNT(*) FROM [dbo].[vc_animal_owners] WHERE [is_primary] = 1 AND [ended_at] IS NULL)
        <> (SELECT COUNT(*) FROM [dbo].[vc_animals] WHERE [owner_id] IS NOT NULL)
        OR EXISTS (SELECT 1 FROM [dbo].[vc_animals] a WHERE a.[owner_id] IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM [dbo].[vc_animal_owners] o WHERE o.[animal_id] = a.[id] AND o.[user_id] = a.[owner_id]
            AND o.[is_primary] = 1 AND o.[ended_at] IS NULL))
        OR EXISTS (SELECT 1 FROM [dbo].[vc_animal_owners] o INNER JOIN [dbo].[vc_animals] a ON a.[id] = o.[animal_id]
          WHERE o.[ended_at] IS NULL AND (a.[owner_id] IS NULL OR o.[is_primary] = 0))
        THROW 51065, 'The copied tutorships do not match vc_animals.owner_id.', 1;
    `);

    // 7. Reservation history: CLIENT_CHANGED (rows were validated against the new list in step 2).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_reservation_history] DROP CONSTRAINT [ck_vc_reservation_history_action];
      ALTER TABLE [dbo].[vc_reservation_history] WITH CHECK ADD CONSTRAINT [ck_vc_reservation_history_action]
        CHECK ([action] COLLATE Latin1_General_100_BIN2 IN (${actionList}));
    `);

    // 8. Final verification.
    await queryRunner.query(`
      IF (SELECT COUNT(*) FROM sys.foreign_keys WHERE [parent_object_id] = OBJECT_ID(${OWNERS})
          AND [is_not_trusted] = 0 AND [delete_referential_action] = 0
          AND [name] IN (N'fk_vc_animal_owners_animal', N'fk_vc_animal_owners_user', N'fk_vc_animal_owners_assigned_by', N'fk_vc_animal_owners_ended_by')) <> 4
        OR (SELECT COUNT(*) FROM sys.check_constraints WHERE [parent_object_id] = OBJECT_ID(${OWNERS}) AND [is_not_trusted] = 0
          AND [name] IN (N'ck_vc_animal_owners_dates', N'ck_vc_animal_owners_ended', N'ck_vc_animal_owners_end_reason')) <> 3
        OR (SELECT COUNT(*) FROM sys.indexes WHERE [object_id] = OBJECT_ID(${OWNERS}) AND [is_unique] = 1 AND [has_filter] = 1
          AND [name] IN (N'uq_vc_animal_owners_active', N'uq_vc_animal_owners_primary')) <> 2
        OR (SELECT COUNT(*) FROM sys.indexes WHERE [object_id] = OBJECT_ID(${OWNERS})
          AND [name] IN (N'ix_vc_animal_owners_user_active', N'ix_vc_animal_owners_animal_assigned', N'ix_vc_animal_owners_assigned_by', N'ix_vc_animal_owners_ended_by')) <> 4
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${ANIMALS}) AND [name] = N'ix_vc_animals_owner_id')
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE [parent_object_id] = OBJECT_ID(${HISTORY})
          AND [name] = N'ck_vc_reservation_history_action' AND [is_not_trusted] = 0 AND [definition] LIKE N'%CLIENT[_]CHANGED%')
        THROW 51069, 'vc_animal_owners, vc_animals or vc_reservation_history is not in the expected final state.', 1;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard the tutorship history (vc_animal_owners: secondary tutors, transfers, closed periods) and CLIENT_CHANGED reservation events. Restore a backup taken before this migration.");
  }
}
