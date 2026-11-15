import { MigrationInterface, QueryRunner } from "typeorm";

/** Initial schema for a NEW SQL Server database; does not import MySQL data. */
export class InitialSqlServer1794657600000 implements MigrationInterface {
  name = "InitialSqlServer1794657600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of ["users", "animal", "reservation", "blocked_times", "resetToken"]) {
      if (await queryRunner.hasTable(`dbo.${name}`)) {
        throw new Error("Initial MSSQL migration requires an empty application schema; existing tables were found.");
      }
    }
    await queryRunner.query(`
      CREATE TABLE [dbo].[users] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_users_id] DEFAULT NEWSEQUENTIALID(),
        [nome] nvarchar(255) NOT NULL,
        [email] nvarchar(255) NOT NULL,
        [password] nvarchar(255) NOT NULL,
        [user_role] nvarchar(255) NOT NULL CONSTRAINT [DF_users_role] DEFAULT N'99',
        [function] nvarchar(255) NOT NULL CONSTRAINT [DF_users_function] DEFAULT N'none',
        [is_active] bit NOT NULL CONSTRAINT [DF_users_active] DEFAULT 1,
        [phone] nvarchar(255) NULL,
        [workLoad] nvarchar(255) NULL CONSTRAINT [DF_users_workload] DEFAULT N'none',
        [dateBirth] nvarchar(255) NULL,
        [NIF] int NULL,
        [profile_picture] nvarchar(max) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [DF_users_created] DEFAULT GETDATE(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [DF_users_updated] DEFAULT GETDATE(),
        [deleted_at] datetime2 NULL,
        CONSTRAINT [PK_users] PRIMARY KEY ([id]),
        CONSTRAINT [CK_users_role] CHECK ([user_role] IN (N'97', N'98', N'99')),
        CONSTRAINT [CK_users_function] CHECK ([function] IN
          (N'none', N'Atendimento', N'Médica', N'Contablista', N'Administrador', N'Farmacia', N'Outros'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE [dbo].[animal] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_animal_id] DEFAULT NEWSEQUENTIALID(),
        [idOwner] uniqueidentifier NULL,
        [name] nvarchar(255) NOT NULL,
        [type] nvarchar(255) NOT NULL,
        [age] int NOT NULL,
        [color] nvarchar(255) NOT NULL,
        [breed] nvarchar(255) NOT NULL,
        [weight] int NOT NULL,
        [height] int NOT NULL,
        [description] nvarchar(255) NULL,
        [gender] nvarchar(255) NOT NULL,
        [image] nvarchar(max) NULL,
        [confirmed] bit NOT NULL CONSTRAINT [DF_animal_confirmed] DEFAULT 0,
        CONSTRAINT [PK_animal] PRIMARY KEY ([id]),
        CONSTRAINT [FK_animal_owner] FOREIGN KEY ([idOwner]) REFERENCES [dbo].[users] ([id])
      )
    `);
    await queryRunner.query(`
      CREATE TABLE [dbo].[reservation] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_reservation_id] DEFAULT NEWSEQUENTIALID(),
        [animalId] uniqueidentifier NULL,
        [clientId] uniqueidentifier NULL,
        [employeeId] uniqueidentifier NULL,
        [date] datetime NOT NULL,
        [timeStart] nvarchar(255) NOT NULL,
        [timeEnd] nvarchar(255) NOT NULL,
        [start] datetime NOT NULL,
        [end] datetime NOT NULL,
        [reason] nvarchar(255) NULL,
        [status] nvarchar(255) NOT NULL CONSTRAINT [DF_reservation_status] DEFAULT N'pending',
        [rescheduleNote] nvarchar(255) NULL,
        [createdAt] datetime2 NOT NULL CONSTRAINT [DF_reservation_created] DEFAULT GETDATE(),
        [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_reservation_updated] DEFAULT GETDATE(),
        CONSTRAINT [PK_reservation] PRIMARY KEY ([id]),
        CONSTRAINT [CK_reservation_status] CHECK ([status] IN
          (N'pending', N'confirmed', N'rescheduled', N'cancelled', N'completed')),
        CONSTRAINT [FK_reservation_animal] FOREIGN KEY ([animalId]) REFERENCES [dbo].[animal] ([id]),
        CONSTRAINT [FK_reservation_client] FOREIGN KEY ([clientId]) REFERENCES [dbo].[users] ([id]),
        CONSTRAINT [FK_reservation_employee] FOREIGN KEY ([employeeId]) REFERENCES [dbo].[users] ([id])
      )
    `);
    await queryRunner.query(`
      CREATE TABLE [dbo].[blocked_times] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_blocked_id] DEFAULT NEWSEQUENTIALID(),
        [date] datetime NOT NULL,
        [timeStart] nvarchar(255) NOT NULL,
        [timeEnd] nvarchar(255) NOT NULL,
        [start] datetime NOT NULL,
        [end] datetime NOT NULL,
        [reason] nvarchar(255) NULL,
        CONSTRAINT [PK_blocked_times] PRIMARY KEY ([id])
      )
    `);
    await queryRunner.query(`
      CREATE TABLE [dbo].[resetToken] (
        [resetToken] nvarchar(255) NOT NULL,
        [user_id] uniqueidentifier NULL,
        [expires_at] datetime2 NULL,
        CONSTRAINT [PK_resetToken] PRIMARY KEY ([resetToken]),
        CONSTRAINT [FK_resetToken_user] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users] ([id]) ON DELETE CASCADE
      )
    `);
    await queryRunner.query("CREATE INDEX [IDX_RESET_TOKEN] ON [dbo].[resetToken] ([user_id])");
  }

  async down(): Promise<void> {
    throw new Error("Initial schema rollback is intentionally manual. Preserve data and restore a backup or recreate a disposable development database.");
  }
}
