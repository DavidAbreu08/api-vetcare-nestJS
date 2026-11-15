import { MigrationInterface, QueryRunner } from "typeorm";

/** Split historical observations without inventing a measurement time or author. */
export class ConfigurableMeasurementTypes1794916800000 implements MigrationInterface {
  name = "ConfigurableMeasurementTypes1794916800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    if (!(await queryRunner.hasTable("dbo.vc_animal_measurements"))) throw new Error("Apply AnimalMeasurementsAndMetadata first.");
    if (await queryRunner.hasTable("dbo.vc_measurement_types")) throw new Error("Measurement types already exist; review migration state.");
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_measurement_types] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_measurement_types_id] DEFAULT NEWSEQUENTIALID(),
        [code] varchar(64) NOT NULL,
        [name] nvarchar(255) NOT NULL,
        [unit] nvarchar(32) NOT NULL,
        [is_active] bit NOT NULL CONSTRAINT [df_vc_measurement_types_is_active] DEFAULT 1,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_measurement_types_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_measurement_types_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_measurement_types] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_measurement_types_code] UNIQUE ([code])
      );
      INSERT INTO [dbo].[vc_measurement_types] ([id], [code], [name], [unit]) VALUES
        ('10000000-0000-4000-8000-000000000001', 'WEIGHT', N'Peso', N'kg'),
        ('10000000-0000-4000-8000-000000000002', 'HEIGHT', N'Altura', N'cm'),
        ('10000000-0000-4000-8000-000000000003', 'TEMPERATURE', N'Temperatura', N'°C'),
        ('10000000-0000-4000-8000-000000000004', 'HEART_RATE', N'Frequência cardíaca', N'bpm'),
        ('10000000-0000-4000-8000-000000000005', 'RESPIRATORY_RATE', N'Frequência respiratória', N'rpm');

      ALTER TABLE [dbo].[vc_animal_measurements] ADD [measurement_type_id] uniqueidentifier NULL, [value] decimal(18,6) NULL;
    `);
    // Compile references after ADD, and keep each local temp table in the request
    // that creates it: mssql executes query() through sp_executesql's local scope.
    await queryRunner.query(`
      SELECT [id], [animal_id], [name], [weight], [height], [measured_at], [description], [notes],
        [user_id], [created_at], [updated_at],
        CASE WHEN [weight] IS NOT NULL AND [height] IS NOT NULL THEN NEWID() END AS [height_id]
      INTO #legacy_measurements
      FROM [dbo].[vc_animal_measurements] WITH (TABLOCKX, HOLDLOCK);
      IF EXISTS (SELECT 1 FROM #legacy_measurements WHERE [weight] IS NULL AND [height] IS NULL)
        THROW 51010, 'Observation without weight or height cannot be converted safely.', 1;

      UPDATE m SET [measurement_type_id] = CASE WHEN l.[weight] IS NOT NULL
          THEN '10000000-0000-4000-8000-000000000001' ELSE '10000000-0000-4000-8000-000000000002' END,
        [value] = COALESCE(l.[weight], l.[height])
      FROM [dbo].[vc_animal_measurements] m INNER JOIN #legacy_measurements l ON l.[id] = m.[id];
      INSERT INTO [dbo].[vc_animal_measurements]
        ([id], [animal_id], [name], [height], [measurement_type_id], [value], [measured_at], [description], [notes], [user_id], [created_at], [updated_at])
      SELECT [height_id], [animal_id], [name], [height], '10000000-0000-4000-8000-000000000002', [height],
        [measured_at], [description], [notes], [user_id], [created_at], [updated_at]
      FROM #legacy_measurements WHERE [height_id] IS NOT NULL;

      SELECT [id], [animal_id], [name],
        CAST(CASE WHEN [weight] IS NOT NULL THEN '10000000-0000-4000-8000-000000000001'
          ELSE '10000000-0000-4000-8000-000000000002' END AS uniqueidentifier) AS [measurement_type_id],
        CAST(COALESCE([weight], [height]) AS decimal(18,6)) AS [value], [measured_at], [description], [notes], [user_id], [created_at], [updated_at]
      INTO #expected_measurements FROM #legacy_measurements
      UNION ALL
      SELECT [height_id], [animal_id], [name], CAST('10000000-0000-4000-8000-000000000002' AS uniqueidentifier),
        CAST([height] AS decimal(18,6)), [measured_at], [description], [notes], [user_id], [created_at], [updated_at]
      FROM #legacy_measurements WHERE [height_id] IS NOT NULL;
      IF (SELECT COUNT_BIG(*) FROM #expected_measurements) <> (SELECT COUNT_BIG(*) FROM [dbo].[vc_animal_measurements])
        THROW 51011, 'Converted measurement count does not match legacy observations.', 1;
      IF EXISTS (
        SELECT * FROM #expected_measurements EXCEPT
        SELECT [id], [animal_id], [name], [measurement_type_id], [value], [measured_at], [description], [notes], [user_id], [created_at], [updated_at]
        FROM [dbo].[vc_animal_measurements]
      ) THROW 51012, 'Converted measurement values or metadata differ from legacy observations.', 1;

      ALTER TABLE [dbo].[vc_animal_measurements] DROP CONSTRAINT [ck_vc_animal_measurements_value], [ck_vc_animal_measurements_weight], [ck_vc_animal_measurements_height];
      ALTER TABLE [dbo].[vc_animal_measurements] ALTER COLUMN [measurement_type_id] uniqueidentifier NOT NULL;
      ALTER TABLE [dbo].[vc_animal_measurements] ALTER COLUMN [value] decimal(18,6) NOT NULL;
      ALTER TABLE [dbo].[vc_animal_measurements] ADD CONSTRAINT [fk_vc_animal_measurements_type]
        FOREIGN KEY ([measurement_type_id]) REFERENCES [dbo].[vc_measurement_types] ([id]);
      ALTER TABLE [dbo].[vc_animal_measurements] DROP COLUMN [weight], [height];
      EXEC sys.sp_rename N'dbo.vc_animal_measurements.user_id', N'recorded_by', N'COLUMN';
      EXEC sys.sp_rename N'dbo.fk_vc_animal_measurements_user', N'fk_vc_animal_measurements_recorder', N'OBJECT';
      DROP TABLE #expected_measurements;
      DROP TABLE #legacy_measurements;
    `);
    await queryRunner.query(`
      CREATE INDEX [ix_vc_animal_measurements_recorded_by] ON [dbo].[vc_animal_measurements] ([recorded_by]);
      CREATE INDEX [ix_vc_animal_measurements_animal_type_date] ON [dbo].[vc_animal_measurements]
        ([animal_id], [measurement_type_id], [measured_at] DESC, [created_at] DESC, [id] DESC);
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would lose configurable types, precision or observation identity. Use a reviewed data-preserving reverse migration or restore a backup accounting for subsequent writes.");
  }
}
