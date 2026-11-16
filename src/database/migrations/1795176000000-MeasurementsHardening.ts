import { MigrationInterface, QueryRunner } from "typeorm";

const CATALOG_CODE = "[code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%'";

/**
 * Hardens measurements: mandatory author (recorded_by NOT NULL), last editor (updated_by), audited
 * soft-delete (deleted_at, deleted_by, delete_reason) that never applies to clinical measurements,
 * and the catalog code check on vc_measurement_types. Additive except for the nullability of recorded_by.
 * From this release the application reads and writes measured_at as a UTC instant (utcDateTimeTransformer);
 * the column type is unchanged and existing values are not converted (identical when the server runs in UTC).
 */
export class MeasurementsHardening1795176000000 implements MigrationInterface {
  name = "MeasurementsHardening1795176000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    for (const table of ["vc_animal_measurements", "vc_measurement_types", "vc_users", "vc_clinical_visits"]) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) throw new Error(`Missing dbo.${table}; apply ReservationsAndClinicalVisits first.`);
    }
    for (const column of ["updated_by", "deleted_at", "deleted_by", "delete_reason"]) {
      if (await queryRunner.hasColumn("dbo.vc_animal_measurements", column)) {
        throw new Error(`vc_animal_measurements.${column} already exists; review migration state.`);
      }
    }

    // 1. Preconditions, holding exclusive table locks until commit so no offending row appears meanwhile.
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[vc_animal_measurements] WITH (TABLOCKX, HOLDLOCK) WHERE [recorded_by] IS NULL)
        THROW 51030, 'vc_animal_measurements has rows without recorded_by; assign their author before migrating.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_measurement_types] WITH (TABLOCKX, HOLDLOCK) WHERE NOT (${CATALOG_CODE}))
        THROW 51031, 'vc_measurement_types has codes outside [A-Z][A-Z0-9_]*; normalize them before migrating.', 1;
      IF OBJECT_ID(N'dbo.fk_vc_animal_measurements_recorder', N'F') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(N'dbo.vc_animal_measurements')
          AND [name] = N'ix_vc_animal_measurements_recorded_by')
        THROW 51032, 'fk_vc_animal_measurements_recorder or ix_vc_animal_measurements_recorded_by is missing; review migration state.', 1;
      IF EXISTS (
        SELECT 1 FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON i.[object_id] = ic.[object_id] AND i.[index_id] = ic.[index_id]
        WHERE ic.[object_id] = OBJECT_ID(N'dbo.vc_animal_measurements')
          AND ic.[column_id] = COLUMNPROPERTY(OBJECT_ID(N'dbo.vc_animal_measurements'), N'recorded_by', 'ColumnId')
          AND i.[name] <> N'ix_vc_animal_measurements_recorded_by')
        OR EXISTS (
        SELECT 1 FROM sys.stats_columns sc
        INNER JOIN sys.stats s ON s.[object_id] = sc.[object_id] AND s.[stats_id] = sc.[stats_id]
        WHERE sc.[object_id] = OBJECT_ID(N'dbo.vc_animal_measurements') AND s.[user_created] = 1
          AND sc.[column_id] = COLUMNPROPERTY(OBJECT_ID(N'dbo.vc_animal_measurements'), N'recorded_by', 'ColumnId'))
        THROW 51033, 'Unexpected indexes or statistics depend on vc_animal_measurements.recorded_by; review them before migrating.', 1;
      IF OBJECT_ID(N'dbo.ck_vc_measurement_types_code', N'C') IS NOT NULL
        OR OBJECT_ID(N'dbo.ck_vc_animal_measurements_deleted', N'C') IS NOT NULL
        OR OBJECT_ID(N'dbo.ck_vc_animal_measurements_clinical_not_deleted', N'C') IS NOT NULL
        THROW 51034, 'Measurement hardening constraints already exist; review migration state.', 1;
    `);

    // 2. recorded_by NOT NULL: the FK and the index depend on the column, so they are dropped and recreated (trusted).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_animal_measurements] DROP CONSTRAINT [fk_vc_animal_measurements_recorder];
      DROP INDEX [ix_vc_animal_measurements_recorded_by] ON [dbo].[vc_animal_measurements];
      ALTER TABLE [dbo].[vc_animal_measurements] ALTER COLUMN [recorded_by] uniqueidentifier NOT NULL;
      ALTER TABLE [dbo].[vc_animal_measurements] WITH CHECK ADD CONSTRAINT [fk_vc_animal_measurements_recorder]
        FOREIGN KEY ([recorded_by]) REFERENCES [dbo].[vc_users] ([id]);
      CREATE INDEX [ix_vc_animal_measurements_recorded_by] ON [dbo].[vc_animal_measurements] ([recorded_by]);
    `);

    // 3. Last editor and audited soft-delete. deleted_at is a UTC instant written by the application.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_animal_measurements] ADD
        [updated_by] uniqueidentifier NULL,
        [deleted_at] datetime2(3) NULL,
        [deleted_by] uniqueidentifier NULL,
        [delete_reason] nvarchar(500) NULL;
    `);
    // Compile references to the new columns after ADD.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_animal_measurements] WITH CHECK ADD
        CONSTRAINT [fk_vc_animal_measurements_updated_by] FOREIGN KEY ([updated_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [fk_vc_animal_measurements_deleted_by] FOREIGN KEY ([deleted_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_animal_measurements_deleted] CHECK (
          ([deleted_at] IS NULL AND [deleted_by] IS NULL AND [delete_reason] IS NULL)
          OR ([deleted_at] IS NOT NULL AND [deleted_by] IS NOT NULL
            AND [delete_reason] IS NOT NULL AND LEN(LTRIM(RTRIM([delete_reason]))) > 0)),
        CONSTRAINT [ck_vc_animal_measurements_clinical_not_deleted] CHECK ([clinical_visit_id] IS NULL OR [deleted_at] IS NULL);
      CREATE INDEX [ix_vc_animal_measurements_updated_by] ON [dbo].[vc_animal_measurements] ([updated_by]);
      CREATE INDEX [ix_vc_animal_measurements_deleted_by] ON [dbo].[vc_animal_measurements] ([deleted_by]);
    `);

    // 4. Catalog code format, as in vc_roles, vc_job_titles and vc_system_settings.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_measurement_types] WITH CHECK ADD CONSTRAINT [ck_vc_measurement_types_code] CHECK (${CATALOG_CODE});
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard the soft-delete audit (deleted_at, deleted_by, delete_reason) and updated_by of measurements. Restore a backup taken before this migration.");
  }
}
