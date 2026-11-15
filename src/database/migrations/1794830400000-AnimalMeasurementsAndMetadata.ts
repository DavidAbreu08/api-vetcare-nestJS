import { MigrationInterface, QueryRunner } from "typeorm";

/** Validate and copy legacy snapshots before dropping their original columns. */
export class AnimalMeasurementsAndMetadata1794830400000 implements MigrationInterface {
  name = "AnimalMeasurementsAndMetadata1794830400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ["vc_users", "vc_animals", "vc_species", "vc_breeds", "vc_reservations", "vc_blocked_times", "vc_reset_tokens"];
    for (const table of tables) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) throw new Error(`Missing dbo.${table}; apply the catalog migration first.`);
    }
    if (await queryRunner.hasTable("dbo.vc_animal_measurements")) throw new Error("vc_animal_measurements already exists; review migration state.");
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[vc_animals] WHERE [weight] < 0 OR [height] < 0)
        THROW 51000, 'Negative legacy animal measurements require explicit correction before migration.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_animals] WHERE [height] IS NOT NULL AND
        ([height] > 9999.99 OR [height] <> ROUND([height], 2)))
        THROW 51001, 'Legacy height cannot fit decimal(6,2) without rounding or overflow. Review before migrating.', 1;
    `);
    if (await queryRunner.hasColumn("dbo.vc_users", "nome")) {
      if (await queryRunner.hasColumn("dbo.vc_users", "name")) throw new Error("vc_users has both nome and name; resolve ambiguity before migration.");
      await queryRunner.query("EXEC sys.sp_rename N'dbo.vc_users.nome', N'name', N'COLUMN'");
    }
    for (const table of tables.filter(table => table !== "vc_animals")) {
      const fields = ["description", "notes"];
      if (["vc_reservations", "vc_blocked_times", "vc_reset_tokens"].includes(table)) fields.unshift("name");
      for (const field of fields) {
        const length = field === "notes" ? 500 : field === "description" ? 240 : 255;
        await queryRunner.query(`ALTER TABLE [dbo].[${table}] ADD [${field}] nvarchar(${length}) NULL`);
      }
    }
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_animals] ADD [notes] nvarchar(500) NULL;
      CREATE TABLE [dbo].[vc_animal_measurements] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_animal_measurements_id] DEFAULT NEWSEQUENTIALID(),
        [animal_id] uniqueidentifier NOT NULL,
        [name] nvarchar(255) NULL,
        [weight] decimal(13,3) NULL,
        [height] decimal(6,2) NULL,
        [measured_at] datetime2 NULL,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [user_id] uniqueidentifier NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_animal_measurements_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_animal_measurements_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_animal_measurements] PRIMARY KEY ([id]),
        CONSTRAINT [fk_vc_animal_measurements_animal] FOREIGN KEY ([animal_id]) REFERENCES [dbo].[vc_animals] ([id]),
        CONSTRAINT [fk_vc_animal_measurements_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_animal_measurements_value] CHECK ([weight] IS NOT NULL OR [height] IS NOT NULL),
        CONSTRAINT [ck_vc_animal_measurements_weight] CHECK ([weight] IS NULL OR [weight] >= 0),
        CONSTRAINT [ck_vc_animal_measurements_height] CHECK ([height] IS NULL OR [height] >= 0)
      );
      INSERT INTO [dbo].[vc_animal_measurements] ([animal_id], [weight], [height], [measured_at], [user_id])
      SELECT [id], [weight], [height], NULL, NULL FROM [dbo].[vc_animals]
      WHERE [weight] IS NOT NULL OR [height] IS NOT NULL;
      CREATE INDEX [ix_vc_animal_measurements_animal_date] ON [dbo].[vc_animal_measurements] ([animal_id], [measured_at] DESC, [created_at] DESC, [id] DESC);
      ALTER TABLE [dbo].[vc_animals] DROP COLUMN [weight], [height], [legacy_type], [legacy_age], [legacy_breed];
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard measurement history and metadata. Use a reviewed data-preserving reverse migration or restore a backup accounting for subsequent writes.");
  }
}
