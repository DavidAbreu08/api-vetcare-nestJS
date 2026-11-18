import { MigrationInterface, QueryRunner } from "typeorm";

const SCHEDULES = "N'dbo.vc_employee_schedules'";
const BLOCKS = "N'dbo.vc_blocked_times'";
const NEW_BLOCK_COLUMNS = ["employee_id", "start_at", "end_at", "created_by", "created_at"];
/** Legacy single-day columns of vc_blocked_times (deprecated: no longer written or read; kept, never dropped here). */
const LEGACY_BLOCK_COLUMNS: Array<[column: string, type: string]> = [
  ["date", "datetime"], ["time_start", "nvarchar(255)"], ["time_end", "nvarchar(255)"], ["start", "datetime"], ["end", "datetime"],
];

/**
 * Employee schedules and multi-day / per-employee blocked times:
 * - vc_employee_schedules: weekly periods of an employee profile (day_of_week 0 = Sunday .. 6, start_time/end_time
 *   time(0) in clinic local time with end_time > start_time, valid_from date NOT NULL, valid_until date NULL >= valid_from).
 *   Several rows per day = several periods; non-overlap is an application rule (under the employee schedule applock).
 *   FK to vc_employees without cascade; ix_vc_employee_schedules_employee_day.
 * - vc_blocked_times (additive): employee_id NULL (NULL = clinic-wide closure, FK vc_employees), start_at/end_at
 *   datetime2(3) UTC backfilled from the legacy [start]/[end] (UTC instants written by clinicDateTime), then NOT NULL with
 *   ck_vc_blocked_times_interval; created_by NULL (FK vc_users; the API always writes the actor); created_at DEFAULT
 *   SYSUTCDATETIME(). The legacy date/time_start/time_end/start/end columns become NULL-able (non-destructive) and are no
 *   longer written; dropping them needs a future, approved migration.
 * THROW codes 51090-51099.
 */
export class SchedulesAndBlocks1795694400000 implements MigrationInterface {
  name = "SchedulesAndBlocks1795694400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    // Each required table and the migration that creates it.
    const origins: Record<string, string> = {
      vc_blocked_times: "UniformSchemaAndAnimalCatalog", vc_employees: "UserRolesAndEmployees", vc_users: "UserRolesAndEmployees",
      vc_reservations: "ReservationsAndClinicalVisits", vc_services: "ClinicServices",
    };
    for (const [table, migration] of Object.entries(origins)) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) {
        throw new Error(`Missing dbo.${table} (created by ${migration}); apply the earlier migrations up to ClinicServices first.`);
      }
    }
    if (await queryRunner.hasTable("dbo.vc_employee_schedules")) throw new Error("dbo.vc_employee_schedules already exists; review migration state.");
    for (const column of NEW_BLOCK_COLUMNS) {
      if (await queryRunner.hasColumn("dbo.vc_blocked_times", column)) throw new Error(`vc_blocked_times.${column} already exists; review migration state.`);
    }

    // 1. Preconditions, holding exclusive table locks until commit: no block or employee profile changes meanwhile.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[vc_blocked_times] WITH (TABLOCKX, HOLDLOCK);
      SELECT @locked = COUNT(*) FROM [dbo].[vc_employees] WITH (TABLOCKX, HOLDLOCK);
      IF OBJECT_ID(${SCHEDULES}, N'U') IS NOT NULL
        OR ${NEW_BLOCK_COLUMNS.map(column => `COL_LENGTH(${BLOCKS}, N'${column}') IS NOT NULL`).join("\n        OR ")}
        OR EXISTS (SELECT 1 FROM sys.objects WHERE [name] LIKE N'%vc[_]employee[_]schedules%'
          OR [name] IN (N'ck_vc_blocked_times_interval', N'fk_vc_blocked_times_employee', N'fk_vc_blocked_times_created_by', N'df_vc_blocked_times_created_at'))
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${BLOCKS})
          AND [name] IN (N'ix_vc_blocked_times_start_end', N'ix_vc_blocked_times_employee_start'))
        THROW 51090, 'Schedule or blocked-time objects already exist; review migration state.', 1;
      IF OBJECT_ID(N'dbo.pk_vc_employees', N'PK') IS NULL OR OBJECT_ID(N'dbo.pk_vc_users', N'PK') IS NULL
        THROW 51091, 'pk_vc_employees or pk_vc_users is missing; review migration state.', 1;
      IF ${LEGACY_BLOCK_COLUMNS.map(([column]) => `COL_LENGTH(${BLOCKS}, N'${column}') IS NULL`).join(" OR ")}
        THROW 51092, 'vc_blocked_times is missing a legacy column (date, time_start, time_end, start, end); review migration state.', 1;
    `);

    // 2. Weekly schedule periods. Trusted CHECKs and FK, no ON DELETE CASCADE.
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_employee_schedules] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_employee_schedules_id] DEFAULT NEWSEQUENTIALID(),
        [employee_id] uniqueidentifier NOT NULL,
        [day_of_week] tinyint NOT NULL,
        [start_time] time(0) NOT NULL,
        [end_time] time(0) NOT NULL,
        [valid_from] date NOT NULL,
        [valid_until] date NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_employee_schedules_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_employee_schedules_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_employee_schedules] PRIMARY KEY ([id]),
        CONSTRAINT [fk_vc_employee_schedules_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id]),
        CONSTRAINT [ck_vc_employee_schedules_day_of_week] CHECK ([day_of_week] BETWEEN 0 AND 6),
        CONSTRAINT [ck_vc_employee_schedules_time] CHECK ([end_time] > [start_time]),
        CONSTRAINT [ck_vc_employee_schedules_validity] CHECK ([valid_until] IS NULL OR [valid_until] >= [valid_from])
      );
    `);

    // 3. Index (later batch: the table exists).
    await queryRunner.query(`
      CREATE INDEX [ix_vc_employee_schedules_employee_day] ON [dbo].[vc_employee_schedules] ([employee_id], [day_of_week], [valid_from])
        INCLUDE ([start_time], [end_time], [valid_until]);
    `);

    // 4. New block columns, alone in their batch (created_at is filled for existing rows by its default).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_blocked_times] ADD
        [employee_id] uniqueidentifier NULL,
        [start_at] datetime2(3) NULL,
        [end_at] datetime2(3) NULL,
        [created_by] uniqueidentifier NULL,
        [created_at] datetime2(3) NOT NULL CONSTRAINT [df_vc_blocked_times_created_at] DEFAULT SYSUTCDATETIME();
    `);

    // 5. Backfill (later batch: references the new columns). Legacy [start]/[end] hold the UTC instants of each block.
    await queryRunner.query(`
      UPDATE [dbo].[vc_blocked_times] SET [start_at] = CAST([start] AS datetime2(3)), [end_at] = CAST([end] AS datetime2(3));
    `);

    // 6. Precondition on the backfilled data, before NOT NULL and the CHECK.
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[vc_blocked_times] WHERE [start_at] IS NULL OR [end_at] IS NULL OR [end_at] <= [start_at])
        THROW 51093, 'vc_blocked_times has rows whose end is not after their start (or without start/end); fix them before this migration.', 1;
    `);

    // 7. NOT NULL instants; legacy columns become NULL-able (deprecated, no longer written).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_blocked_times] ALTER COLUMN [start_at] datetime2(3) NOT NULL;
      ALTER TABLE [dbo].[vc_blocked_times] ALTER COLUMN [end_at] datetime2(3) NOT NULL;
      ${LEGACY_BLOCK_COLUMNS.map(([column, type]) => `ALTER TABLE [dbo].[vc_blocked_times] ALTER COLUMN [${column}] ${type} NULL;`).join("\n      ")}
    `);

    // 8. Trusted CHECK and FKs (WITH CHECK), no cascade, and the indexes.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_blocked_times] WITH CHECK ADD
        CONSTRAINT [ck_vc_blocked_times_interval] CHECK ([end_at] > [start_at]),
        CONSTRAINT [fk_vc_blocked_times_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id]),
        CONSTRAINT [fk_vc_blocked_times_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[vc_users] ([id]);
      CREATE INDEX [ix_vc_blocked_times_start_end] ON [dbo].[vc_blocked_times] ([start_at], [end_at]) INCLUDE ([employee_id]);
      CREATE INDEX [ix_vc_blocked_times_employee_start] ON [dbo].[vc_blocked_times] ([employee_id], [start_at]) INCLUDE ([end_at]);
    `);

    // 9. Final verification.
    await queryRunner.query(`
      IF (SELECT COUNT(*) FROM sys.check_constraints WHERE [parent_object_id] = OBJECT_ID(${SCHEDULES}) AND [is_not_trusted] = 0
          AND [name] IN (N'ck_vc_employee_schedules_day_of_week', N'ck_vc_employee_schedules_time', N'ck_vc_employee_schedules_validity')) <> 3
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'fk_vc_employee_schedules_employee'
          AND [parent_object_id] = OBJECT_ID(${SCHEDULES}) AND [is_not_trusted] = 0 AND [delete_referential_action] = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${SCHEDULES}) AND [name] = N'ix_vc_employee_schedules_employee_day')
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE [parent_object_id] = OBJECT_ID(${BLOCKS}) AND [is_not_trusted] = 0
          AND [name] = N'ck_vc_blocked_times_interval')
        OR (SELECT COUNT(*) FROM sys.foreign_keys WHERE [parent_object_id] = OBJECT_ID(${BLOCKS}) AND [is_not_trusted] = 0
          AND [delete_referential_action] = 0 AND [name] IN (N'fk_vc_blocked_times_employee', N'fk_vc_blocked_times_created_by')) <> 2
        OR (SELECT COUNT(*) FROM sys.indexes WHERE [object_id] = OBJECT_ID(${BLOCKS})
          AND [name] IN (N'ix_vc_blocked_times_start_end', N'ix_vc_blocked_times_employee_start')) <> 2
        OR COLUMNPROPERTY(OBJECT_ID(${BLOCKS}), N'start_at', 'AllowsNull') <> 0
        OR COLUMNPROPERTY(OBJECT_ID(${BLOCKS}), N'end_at', 'AllowsNull') <> 0
        OR COLUMNPROPERTY(OBJECT_ID(${BLOCKS}), N'employee_id', 'AllowsNull') <> 1
        OR COLUMNPROPERTY(OBJECT_ID(${BLOCKS}), N'created_by', 'AllowsNull') <> 1
        OR ${LEGACY_BLOCK_COLUMNS.map(([column]) => `COLUMNPROPERTY(OBJECT_ID(${BLOCKS}), N'${column}', 'AllowsNull') <> 1`).join("\n        OR ")}
        THROW 51099, 'vc_employee_schedules or vc_blocked_times is not in the expected final state.', 1;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard every employee schedule, every per-employee and multi-day blocked time and the block authorship. Restore a backup taken before this migration.");
  }
}
