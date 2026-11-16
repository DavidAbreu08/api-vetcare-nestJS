import { MigrationInterface, QueryRunner } from "typeorm";

/** Upgrade the existing application schema without discarding legacy animal data. */
export class UniformSchemaAndAnimalCatalog1794744000000 implements MigrationInterface {
  name = "UniformSchemaAndAnimalCatalog1794744000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const tables = {
      users: "vc_users",
      animal: "vc_animals",
      reservation: "vc_reservations",
      blocked_times: "vc_blocked_times",
      resetToken: "vc_reset_tokens",
    };
    // Check the full expected starting point before performing any renames.
    for (const [oldName, newName] of Object.entries(tables)) {
      if (!(await queryRunner.hasTable(`dbo.${oldName}`)) || await queryRunner.hasTable(`dbo.${newName}`)) {
        throw new Error(`Expected dbo.${oldName} and no dbo.${newName}; migration requires the initial SQL Server schema.`);
      }
    }
    for (const name of ["vc_species", "vc_breeds"]) {
      if (await queryRunner.hasTable(`dbo.${name}`)) throw new Error(`Unexpected table dbo.${name}.`);
    }
    for (const [oldName, newName] of Object.entries(tables)) {
      await queryRunner.query(`EXEC sys.sp_rename N'dbo.${oldName}', N'${newName}', N'OBJECT'`);
    }

    const columns: Record<string, Record<string, string>> = {
      vc_users: { nome: "name", workLoad: "work_load", dateBirth: "birth_date", NIF: "nif" },
      vc_animals: { idOwner: "owner_id", type: "legacy_type", breed: "legacy_breed", age: "legacy_age", gender: "sex", image: "image_url", confirmed: "is_verified" },
      vc_reservations: { animalId: "animal_id", clientId: "client_id", employeeId: "employee_id", timeStart: "time_start", timeEnd: "time_end", rescheduleNote: "reschedule_note", createdAt: "created_at", updatedAt: "updated_at" },
      vc_blocked_times: { timeStart: "time_start", timeEnd: "time_end" },
      vc_reset_tokens: { resetToken: "reset_token" },
    };
    for (const [table, names] of Object.entries(columns)) {
      for (const [oldName, newName] of Object.entries(names)) {
        await queryRunner.query(`EXEC sys.sp_rename N'dbo.${table}.${oldName}', N'${newName}', N'COLUMN'`);
      }
    }

    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_species] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_species_id] DEFAULT NEWSEQUENTIALID(),
        [name] nvarchar(255) NOT NULL,
        CONSTRAINT [pk_vc_species] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_species_name] UNIQUE ([name])
      );
      CREATE TABLE [dbo].[vc_breeds] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_breeds_id] DEFAULT NEWSEQUENTIALID(),
        [species_id] uniqueidentifier NOT NULL,
        [name] nvarchar(255) NOT NULL,
        CONSTRAINT [pk_vc_breeds] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_breeds_species_name] UNIQUE ([species_id], [name]),
        CONSTRAINT [uq_vc_breeds_id_species] UNIQUE ([id], [species_id]),
        CONSTRAINT [fk_vc_breeds_species] FOREIGN KEY ([species_id]) REFERENCES [dbo].[vc_species] ([id])
      );
      ALTER TABLE [dbo].[vc_animals] ALTER COLUMN [weight] decimal(13,3) NOT NULL;
      ALTER TABLE [dbo].[vc_animals] ALTER COLUMN [height] decimal(13,3) NOT NULL;
      ALTER TABLE [dbo].[vc_animals] ALTER COLUMN [legacy_type] nvarchar(255) NULL;
      ALTER TABLE [dbo].[vc_animals] ALTER COLUMN [legacy_breed] nvarchar(255) NULL;
      ALTER TABLE [dbo].[vc_animals] ALTER COLUMN [legacy_age] int NULL;
      ALTER TABLE [dbo].[vc_animals] ADD
        [species_id] uniqueidentifier NULL,
        [breed_id] uniqueidentifier NULL,
        [birth_date] date NULL,
        [microchip_number] nvarchar(255) NULL,
        [is_neutered] bit NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_animals_created_at] DEFAULT GETDATE(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_animals_updated_at] DEFAULT GETDATE(),
        [deleted_at] datetime2 NULL;
    `);

    // Normalize only the catalog labels. The original strings stay untouched.
    // Database collation governs equality, matching the catalog UNIQUE constraints.
    await queryRunner.query(`
      SELECT [id],
        COALESCE(NULLIF(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE([legacy_type], NCHAR(9), N' '), NCHAR(10), N' '), NCHAR(13), N' '))), N''), N'Unknown') AS [species_name],
        NULLIF(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE([legacy_breed], NCHAR(9), N' '), NCHAR(10), N' '), NCHAR(13), N' '))), N'') AS [breed_name]
      INTO #vc_animal_catalog
      FROM [dbo].[vc_animals];

      INSERT INTO [dbo].[vc_species] ([name])
      SELECT MIN([species_name] COLLATE Latin1_General_100_BIN2)
      FROM #vc_animal_catalog GROUP BY [species_name];

      INSERT INTO [dbo].[vc_breeds] ([species_id], [name])
      SELECT s.[id], MIN(a.[breed_name] COLLATE Latin1_General_100_BIN2)
      FROM #vc_animal_catalog a
      INNER JOIN [dbo].[vc_species] s ON s.[name] = a.[species_name]
      WHERE a.[breed_name] IS NOT NULL
      GROUP BY s.[id], a.[breed_name];

      UPDATE animal SET [species_id] = s.[id], [breed_id] = b.[id]
      FROM [dbo].[vc_animals] animal
      INNER JOIN #vc_animal_catalog a ON a.[id] = animal.[id]
      INNER JOIN [dbo].[vc_species] s ON s.[name] = a.[species_name]
      LEFT JOIN [dbo].[vc_breeds] b ON b.[species_id] = s.[id] AND b.[name] = a.[breed_name];
      DROP TABLE #vc_animal_catalog;

      ALTER TABLE [dbo].[vc_animals] ALTER COLUMN [species_id] uniqueidentifier NOT NULL;
      ALTER TABLE [dbo].[vc_animals] ADD
        CONSTRAINT [fk_vc_animals_species] FOREIGN KEY ([species_id]) REFERENCES [dbo].[vc_species] ([id]),
        CONSTRAINT [fk_vc_animals_breed_species] FOREIGN KEY ([breed_id], [species_id]) REFERENCES [dbo].[vc_breeds] ([id], [species_id]);
      CREATE INDEX [ix_vc_animals_species] ON [dbo].[vc_animals] ([species_id]);
      CREATE INDEX [ix_vc_animals_breed_species] ON [dbo].[vc_animals] ([breed_id], [species_id]);
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback requires a reviewed data-preserving migration or restoration of the pre-upgrade backup; catalog and new animal data must not be discarded.");
  }
}
