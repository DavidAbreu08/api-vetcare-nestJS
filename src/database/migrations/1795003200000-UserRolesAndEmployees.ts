import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Rebuild accounts with data-driven roles, employee profiles and system settings.
 * Authorized destructive step: user data and every row depending on users is removed;
 * species, breeds, measurement types and blocked times are retained.
 */
export class UserRolesAndEmployees1795003200000 implements MigrationInterface {
  name = "UserRolesAndEmployees1795003200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    for (const table of ["vc_users", "vc_animals", "vc_reservations", "vc_reset_tokens", "vc_animal_measurements", "vc_measurement_types"]) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) throw new Error(`Missing dbo.${table}; apply ConfigurableMeasurementTypes first.`);
    }
    for (const table of ["vc_roles", "vc_user_roles", "vc_job_titles", "vc_employees", "vc_employee_job_titles", "vc_system_settings"]) {
      if (await queryRunner.hasTable(`dbo.${table}`)) throw new Error(`Unexpected dbo.${table}; review migration state.`);
    }

    // 1. Remove user-dependent data in foreign-key order, then the legacy references to vc_users.
    await queryRunner.query(`
      DELETE FROM [dbo].[vc_reset_tokens];
      DELETE FROM [dbo].[vc_animal_measurements];
      DELETE FROM [dbo].[vc_reservations];
      DELETE FROM [dbo].[vc_animals];
      DELETE FROM [dbo].[vc_users];
      ALTER TABLE [dbo].[vc_reset_tokens] DROP CONSTRAINT [FK_resetToken_user];
      ALTER TABLE [dbo].[vc_animal_measurements] DROP CONSTRAINT [fk_vc_animal_measurements_recorder];
      ALTER TABLE [dbo].[vc_reservations] DROP CONSTRAINT [FK_reservation_client], [FK_reservation_employee];
      ALTER TABLE [dbo].[vc_animals] DROP CONSTRAINT [FK_animal_owner];
      DROP TABLE [dbo].[vc_users];
    `);

    // 2. Account table without role, function or workload; legacy PK_/CK_/DF_users_* go with it.
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_users] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_users_id] DEFAULT NEWSEQUENTIALID(),
        [name] nvarchar(150) NOT NULL,
        [email] nvarchar(255) NOT NULL,
        [password_hash] nvarchar(255) NOT NULL,
        [phone] nvarchar(20) NULL,
        [birth_date] date NULL,
        [nif] varchar(9) NULL,
        [profile_picture_url] nvarchar(500) NULL,
        [is_active] bit NOT NULL CONSTRAINT [df_vc_users_is_active] DEFAULT 1,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_users_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_users_updated_at] DEFAULT SYSDATETIME(),
        [deleted_at] datetime2 NULL,
        CONSTRAINT [pk_vc_users] PRIMARY KEY ([id]),
        -- "=" pads with trailing spaces (ANSI), so it alone would accept 'a@b.pt '; DATALENGTH counts them
        -- and rejects leading/trailing spaces, while the BIN2 comparison rejects uppercase.
        CONSTRAINT [ck_vc_users_email_normalized] CHECK (
          DATALENGTH([email]) = DATALENGTH(LTRIM(RTRIM([email])))
          AND [email] COLLATE Latin1_General_100_BIN2 = LOWER([email]) COLLATE Latin1_General_100_BIN2
        ),
        CONSTRAINT [ck_vc_users_nif] CHECK ([nif] IS NULL OR [nif] LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
      );
      CREATE UNIQUE INDEX [uq_vc_users_email] ON [dbo].[vc_users] ([email]) WHERE [deleted_at] IS NULL;
      CREATE UNIQUE INDEX [uq_vc_users_nif] ON [dbo].[vc_users] ([nif]) WHERE [nif] IS NOT NULL AND [deleted_at] IS NULL;
    `);

    // 3. Catalogs: uppercase immutable codes; referenced rows are deactivated rather than deleted.
    const catalogCode = (table: string) =>
      `CONSTRAINT [ck_${table}_code] CHECK ([code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%')`;
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_roles] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_roles_id] DEFAULT NEWSEQUENTIALID(),
        [code] varchar(64) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [is_active] bit NOT NULL CONSTRAINT [df_vc_roles_is_active] DEFAULT 1,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_roles_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_roles_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_roles] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_roles_code] UNIQUE ([code]),
        ${catalogCode("vc_roles")}
      );
      CREATE TABLE [dbo].[vc_user_roles] (
        [user_id] uniqueidentifier NOT NULL,
        [role_id] uniqueidentifier NOT NULL,
        [assigned_by] uniqueidentifier NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_user_roles_created_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_user_roles] PRIMARY KEY ([user_id], [role_id]),
        CONSTRAINT [fk_vc_user_roles_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [fk_vc_user_roles_role] FOREIGN KEY ([role_id]) REFERENCES [dbo].[vc_roles] ([id]),
        CONSTRAINT [fk_vc_user_roles_assigned_by] FOREIGN KEY ([assigned_by]) REFERENCES [dbo].[vc_users] ([id])
      );
      CREATE INDEX [ix_vc_user_roles_role_id] ON [dbo].[vc_user_roles] ([role_id]);
      CREATE INDEX [ix_vc_user_roles_assigned_by] ON [dbo].[vc_user_roles] ([assigned_by]);

      CREATE TABLE [dbo].[vc_job_titles] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_job_titles_id] DEFAULT NEWSEQUENTIALID(),
        [code] varchar(64) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [is_active] bit NOT NULL CONSTRAINT [df_vc_job_titles_is_active] DEFAULT 1,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_job_titles_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_job_titles_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_job_titles] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_job_titles_code] UNIQUE ([code]),
        ${catalogCode("vc_job_titles")}
      );

      CREATE TABLE [dbo].[vc_employees] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_employees_id] DEFAULT NEWSEQUENTIALID(),
        [user_id] uniqueidentifier NOT NULL,
        [employee_number] nvarchar(30) NULL,
        [license_number] nvarchar(50) NULL,
        [hire_date] date NULL,
        [termination_date] date NULL,
        [is_available_for_bookings] bit NOT NULL CONSTRAINT [df_vc_employees_is_available_for_bookings] DEFAULT 1,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_employees_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_employees_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_employees] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_employees_user_id] UNIQUE ([user_id]),
        CONSTRAINT [fk_vc_employees_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_employees_dates] CHECK ([termination_date] IS NULL OR [hire_date] IS NULL OR [termination_date] >= [hire_date])
      );
      CREATE UNIQUE INDEX [uq_vc_employees_employee_number] ON [dbo].[vc_employees] ([employee_number]) WHERE [employee_number] IS NOT NULL;

      CREATE TABLE [dbo].[vc_employee_job_titles] (
        [employee_id] uniqueidentifier NOT NULL,
        [job_title_id] uniqueidentifier NOT NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_employee_job_titles_created_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_employee_job_titles] PRIMARY KEY ([employee_id], [job_title_id]),
        CONSTRAINT [fk_vc_employee_job_titles_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id]),
        CONSTRAINT [fk_vc_employee_job_titles_job_title] FOREIGN KEY ([job_title_id]) REFERENCES [dbo].[vc_job_titles] ([id])
      );
      CREATE INDEX [ix_vc_employee_job_titles_job_title_id] ON [dbo].[vc_employee_job_titles] ([job_title_id]);

      CREATE TABLE [dbo].[vc_system_settings] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_system_settings_id] DEFAULT NEWSEQUENTIALID(),
        [code] varchar(64) NOT NULL,
        [value] nvarchar(500) NULL,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(500) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_system_settings_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_system_settings_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_system_settings] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_system_settings_code] UNIQUE ([code]),
        ${catalogCode("vc_system_settings")}
      );
    `);

    // 4. Deterministic seeds: roles 2000..., job titles 3000..., settings 4000...
    await queryRunner.query(`
      INSERT INTO [dbo].[vc_roles] ([id], [code], [name]) VALUES
        ('20000000-0000-4000-8000-000000000001', 'ADMIN', N'Administrador'),
        ('20000000-0000-4000-8000-000000000002', 'EMPLOYEE', N'Funcionário'),
        ('20000000-0000-4000-8000-000000000003', 'CLIENT', N'Cliente');
      INSERT INTO [dbo].[vc_job_titles] ([id], [code], [name]) VALUES
        ('30000000-0000-4000-8000-000000000001', 'VETERINARIAN', N'Veterinário'),
        ('30000000-0000-4000-8000-000000000002', 'RECEPTIONIST', N'Atendimento'),
        ('30000000-0000-4000-8000-000000000003', 'ACCOUNTANT', N'Contabilista'),
        ('30000000-0000-4000-8000-000000000004', 'ADMINISTRATION', N'Administração'),
        ('30000000-0000-4000-8000-000000000005', 'PHARMACY', N'Farmácia'),
        ('30000000-0000-4000-8000-000000000006', 'OTHER', N'Outros');
      INSERT INTO [dbo].[vc_system_settings] ([id], [code], [value], [description]) VALUES
        ('40000000-0000-4000-8000-000000000001', 'ADMIN_ROLE_ID', N'20000000-0000-4000-8000-000000000001', N'Role granting administrator access.'),
        ('40000000-0000-4000-8000-000000000002', 'EMPLOYEE_ROLE_ID', N'20000000-0000-4000-8000-000000000002', N'Role granting staff access.'),
        ('40000000-0000-4000-8000-000000000003', 'CLIENT_ROLE_ID', N'20000000-0000-4000-8000-000000000003', N'Role assigned to client accounts.');
    `);

    // 5. Recreate references to vc_users with lowercase names and no cascading deletes.
    //    Reset tokens are deleted explicitly by the application when a user is soft-deleted.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_animals] ADD CONSTRAINT [fk_vc_animals_owner]
        FOREIGN KEY ([owner_id]) REFERENCES [dbo].[vc_users] ([id]);
      ALTER TABLE [dbo].[vc_reservations] ADD
        CONSTRAINT [fk_vc_reservations_client] FOREIGN KEY ([client_id]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [fk_vc_reservations_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_users] ([id]);
      ALTER TABLE [dbo].[vc_reset_tokens] ADD CONSTRAINT [fk_vc_reset_tokens_user]
        FOREIGN KEY ([user_id]) REFERENCES [dbo].[vc_users] ([id]);
      ALTER TABLE [dbo].[vc_animal_measurements] ADD CONSTRAINT [fk_vc_animal_measurements_recorder]
        FOREIGN KEY ([recorded_by]) REFERENCES [dbo].[vc_users] ([id]);
      EXEC sys.sp_rename N'dbo.PK_resetToken', N'pk_vc_reset_tokens', N'OBJECT';
      EXEC sys.sp_rename N'dbo.vc_reset_tokens.IDX_RESET_TOKEN', N'ix_vc_reset_tokens_user_id', N'INDEX';
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback cannot restore the removed accounts or legacy role/function columns. Restore a backup taken before this migration.");
  }
}
