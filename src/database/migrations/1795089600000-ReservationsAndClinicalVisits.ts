import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Rebuild reservations around UTC instants and an explicit state machine, add clinical visits,
 * the append-only reservation history and the clinical context of measurements.
 * vc_reservations must be empty (UserRolesAndEmployees already removed every reservation).
 */
export class ReservationsAndClinicalVisits1795089600000 implements MigrationInterface {
  name = "ReservationsAndClinicalVisits1795089600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    for (const table of ["vc_reservations", "vc_animals", "vc_users", "vc_employees", "vc_animal_measurements", "vc_system_settings", "vc_blocked_times"]) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) throw new Error(`Missing dbo.${table}; apply UserRolesAndEmployees first.`);
    }
    for (const table of ["vc_clinical_visits", "vc_reservation_history"]) {
      if (await queryRunner.hasTable(`dbo.${table}`)) throw new Error(`Unexpected dbo.${table}; review migration state.`);
    }
    if (await queryRunner.hasColumn("dbo.vc_animal_measurements", "clinical_visit_id")) {
      throw new Error("vc_animal_measurements.clinical_visit_id already exists; review migration state.");
    }

    // 1. Preconditions, holding an exclusive table lock until commit so no reservation appears meanwhile.
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[vc_reservations] WITH (TABLOCKX, HOLDLOCK))
        THROW 51020, 'vc_reservations must be empty: this migration rebuilds the table without converting data.', 1;
      IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [referenced_object_id] = OBJECT_ID(N'dbo.vc_reservations'))
        THROW 51021, 'Unexpected foreign keys reference vc_reservations; review them before migrating.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_system_settings] WITH (UPDLOCK, HOLDLOCK)
        WHERE [code] IN ('RESERVATION_NO_SHOW_TOLERANCE_MINUTES', 'RESERVATION_BUFFER_MINUTES')
          OR [id] IN ('40000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000005'))
        THROW 51022, 'Reservation settings or their seed ids already exist; review migration state.', 1;
    `);

    // 2. Rebuild reservations: legacy PK_/DF_/CK_reservation_* and fk_vc_reservations_* go with the old table.
    //    Instants (start_at, end_at, confirmed_at, cancelled_at) are UTC written by the application;
    //    created_at/updated_at keep the local SYSDATETIME() convention.
    await queryRunner.query(`
      DROP TABLE [dbo].[vc_reservations];
      CREATE TABLE [dbo].[vc_reservations] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_reservations_id] DEFAULT NEWSEQUENTIALID(),
        [animal_id] uniqueidentifier NOT NULL,
        [client_id] uniqueidentifier NOT NULL,
        [employee_id] uniqueidentifier NULL,
        [start_at] datetime2(3) NOT NULL,
        [end_at] datetime2(3) NOT NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [df_vc_reservations_status] DEFAULT N'PENDING',
        [reason] nvarchar(500) NULL,
        [description] nvarchar(240) NULL,
        [notes] nvarchar(max) NULL,
        [confirmed_at] datetime2(3) NULL,
        [cancelled_at] datetime2(3) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_reservations_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_reservations_updated_at] DEFAULT SYSDATETIME(),
        [row_version] rowversion NOT NULL,
        CONSTRAINT [pk_vc_reservations] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_reservations_id_animal] UNIQUE ([id], [animal_id]),
        CONSTRAINT [fk_vc_reservations_animal] FOREIGN KEY ([animal_id]) REFERENCES [dbo].[vc_animals] ([id]),
        CONSTRAINT [fk_vc_reservations_client] FOREIGN KEY ([client_id]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [fk_vc_reservations_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id]),
        CONSTRAINT [ck_vc_reservations_interval] CHECK ([end_at] > [start_at]),
        CONSTRAINT [ck_vc_reservations_status] CHECK ([status] COLLATE Latin1_General_100_BIN2 IN
          (N'PENDING', N'CONFIRMED', N'COMPLETED', N'CANCELLED', N'NO_SHOW')),
        -- CONFIRMED and the states reachable only from it keep the employee and the confirmation instant.
        CONSTRAINT [ck_vc_reservations_confirmed] CHECK ([status] NOT IN (N'CONFIRMED', N'COMPLETED', N'NO_SHOW')
          OR ([employee_id] IS NOT NULL AND [confirmed_at] IS NOT NULL)),
        CONSTRAINT [ck_vc_reservations_pending] CHECK ([status] <> N'PENDING' OR [confirmed_at] IS NULL),
        CONSTRAINT [ck_vc_reservations_cancelled] CHECK (([status] = N'CANCELLED' AND [cancelled_at] IS NOT NULL)
          OR ([status] <> N'CANCELLED' AND [cancelled_at] IS NULL))
      );
      CREATE INDEX [ix_vc_reservations_client_start] ON [dbo].[vc_reservations] ([client_id], [start_at]);
      CREATE INDEX [ix_vc_reservations_animal_start] ON [dbo].[vc_reservations] ([animal_id], [start_at]);
      CREATE INDEX [ix_vc_reservations_employee_start] ON [dbo].[vc_reservations] ([employee_id], [start_at]);
      CREATE INDEX [ix_vc_reservations_status_start] ON [dbo].[vc_reservations] ([status], [start_at]);
    `);

    // 3. Clinical visits: optional reservation of the same animal (composite FK), at most one per reservation.
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_clinical_visits] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_clinical_visits_id] DEFAULT NEWSEQUENTIALID(),
        [reservation_id] uniqueidentifier NULL,
        [animal_id] uniqueidentifier NOT NULL,
        [employee_id] uniqueidentifier NOT NULL,
        [status] nvarchar(30) NOT NULL CONSTRAINT [df_vc_clinical_visits_status] DEFAULT N'IN_PROGRESS',
        [started_at] datetime2(3) NOT NULL,
        [ended_at] datetime2(3) NULL,
        [clinical_notes] nvarchar(max) NULL,
        [description] nvarchar(240) NULL,
        [void_reason] nvarchar(500) NULL,
        [voided_at] datetime2(3) NULL,
        [voided_by] uniqueidentifier NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_clinical_visits_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_clinical_visits_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_clinical_visits] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_clinical_visits_id_animal] UNIQUE ([id], [animal_id]),
        CONSTRAINT [fk_vc_clinical_visits_reservation_animal] FOREIGN KEY ([reservation_id], [animal_id])
          REFERENCES [dbo].[vc_reservations] ([id], [animal_id]),
        CONSTRAINT [fk_vc_clinical_visits_animal] FOREIGN KEY ([animal_id]) REFERENCES [dbo].[vc_animals] ([id]),
        CONSTRAINT [fk_vc_clinical_visits_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id]),
        CONSTRAINT [fk_vc_clinical_visits_voided_by] FOREIGN KEY ([voided_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_clinical_visits_status] CHECK ([status] COLLATE Latin1_General_100_BIN2 IN
          (N'IN_PROGRESS', N'COMPLETED', N'VOIDED')),
        CONSTRAINT [ck_vc_clinical_visits_dates] CHECK ([ended_at] IS NULL OR [ended_at] >= [started_at]),
        CONSTRAINT [ck_vc_clinical_visits_in_progress] CHECK ([status] <> N'IN_PROGRESS' OR [ended_at] IS NULL),
        CONSTRAINT [ck_vc_clinical_visits_completed] CHECK ([status] <> N'COMPLETED' OR [ended_at] IS NOT NULL),
        CONSTRAINT [ck_vc_clinical_visits_voided] CHECK (
          ([status] = N'VOIDED' AND [voided_at] IS NOT NULL AND [voided_by] IS NOT NULL
            AND [void_reason] IS NOT NULL AND LEN(LTRIM(RTRIM([void_reason]))) > 0)
          OR ([status] <> N'VOIDED' AND [voided_at] IS NULL AND [voided_by] IS NULL AND [void_reason] IS NULL))
      );
      CREATE UNIQUE INDEX [uq_vc_clinical_visits_reservation_id] ON [dbo].[vc_clinical_visits] ([reservation_id])
        WHERE [reservation_id] IS NOT NULL;
      CREATE INDEX [ix_vc_clinical_visits_animal_started] ON [dbo].[vc_clinical_visits] ([animal_id], [started_at]);
      CREATE INDEX [ix_vc_clinical_visits_employee_started] ON [dbo].[vc_clinical_visits] ([employee_id], [started_at]);
      CREATE INDEX [ix_vc_clinical_visits_voided_by] ON [dbo].[vc_clinical_visits] ([voided_by]);
    `);

    // 4. Append-only reservation history (JSON snapshots; ISJSON requires compatibility level 130+).
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_reservation_history] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_reservation_history_id] DEFAULT NEWSEQUENTIALID(),
        [reservation_id] uniqueidentifier NOT NULL,
        [changed_by] uniqueidentifier NULL,
        [action] nvarchar(30) NOT NULL,
        [old_data] nvarchar(max) NULL,
        [new_data] nvarchar(max) NULL,
        [reason] nvarchar(500) NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_reservation_history_created_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_reservation_history] PRIMARY KEY ([id]),
        CONSTRAINT [fk_vc_reservation_history_reservation] FOREIGN KEY ([reservation_id]) REFERENCES [dbo].[vc_reservations] ([id]),
        CONSTRAINT [fk_vc_reservation_history_changed_by] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_reservation_history_action] CHECK ([action] COLLATE Latin1_General_100_BIN2 IN
          (N'CREATED', N'CONFIRMED', N'RESCHEDULED', N'EMPLOYEE_ASSIGNED', N'EMPLOYEE_CHANGED', N'CANCELLED', N'COMPLETED', N'NO_SHOW')),
        CONSTRAINT [ck_vc_reservation_history_old_data] CHECK ([old_data] IS NULL OR ISJSON([old_data]) = 1),
        CONSTRAINT [ck_vc_reservation_history_new_data] CHECK ([new_data] IS NULL OR ISJSON([new_data]) = 1)
      );
      CREATE INDEX [ix_vc_reservation_history_reservation_created] ON [dbo].[vc_reservation_history] ([reservation_id], [created_at]);
      CREATE INDEX [ix_vc_reservation_history_changed_by] ON [dbo].[vc_reservation_history] ([changed_by]);
    `);
    // CREATE TRIGGER must be alone in its batch.
    await queryRunner.query(`
      CREATE TRIGGER [dbo].[tr_vc_reservation_history_append_only] ON [dbo].[vc_reservation_history]
      INSTEAD OF UPDATE, DELETE
      AS
      BEGIN
        THROW 51023, 'vc_reservation_history is append-only.', 1;
      END
    `);

    // 5. Clinical context of measurements: same animal as the visit (composite FK); recorded_by stays the author.
    await queryRunner.query(`ALTER TABLE [dbo].[vc_animal_measurements] ADD [clinical_visit_id] uniqueidentifier NULL;`);
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_animal_measurements] ADD CONSTRAINT [fk_vc_animal_measurements_clinical_visit]
        FOREIGN KEY ([clinical_visit_id], [animal_id]) REFERENCES [dbo].[vc_clinical_visits] ([id], [animal_id]);
      CREATE INDEX [ix_vc_animal_measurements_clinical_visit_id] ON [dbo].[vc_animal_measurements] ([clinical_visit_id]);
    `);

    // 6. Tolerances (minutes, non-negative integers validated by the settings endpoint).
    await queryRunner.query(`
      INSERT INTO [dbo].[vc_system_settings] ([id], [code], [value], [description]) VALUES
        ('40000000-0000-4000-8000-000000000004', 'RESERVATION_NO_SHOW_TOLERANCE_MINUTES', N'15', N'Minutes after the start of a confirmed reservation before it can be marked as no-show.'),
        ('40000000-0000-4000-8000-000000000005', 'RESERVATION_BUFFER_MINUTES', N'15', N'Minutes kept free between confirmed reservations of the same employee.');
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard clinical visits, reservation history and UTC instants. Restore a backup taken before this migration.");
  }
}
