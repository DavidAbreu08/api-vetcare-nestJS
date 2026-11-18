import { MigrationInterface, QueryRunner } from "typeorm";

const SERVICES = "N'dbo.vc_services'";
const EMPLOYEE_SERVICES = "N'dbo.vc_employee_services'";
const RESERVATIONS = "N'dbo.vc_reservations'";

/** Same catalogCode rule as vc_roles, vc_job_titles and vc_measurement_types. */
const CODE_CHECK = "[code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%'";
const DURATION_CHECK = "[duration_minutes] BETWEEN 1 AND 1440 AND [duration_minutes] % 5 = 0";

/**
 * Clinic services catalog and employee qualifications:
 * - vc_services: bookable services (code varchar(64) unique + catalogCode CHECK, name, description, duration_minutes
 *   1..1440 and a multiple of 5, is_active). No price column. Referenced services are deactivated, not deleted.
 * - vc_employee_services: (employee_id, service_id) qualifications, FKs without cascade, index on service_id.
 * - vc_reservations.service_id: uniqueidentifier NULL (NULL keeps the reservations created before this migration),
 *   FK fk_vc_reservations_service without cascade, ix_vc_reservations_service_id. No backfill and no seed: the
 *   administrator creates the catalog.
 * THROW codes 51080-51089.
 */
export class ClinicServices1795608000000 implements MigrationInterface {
  name = "ClinicServices1795608000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    // Each required table and the migration that creates it.
    const origins: Record<string, string> = { vc_employees: "UserRolesAndEmployees", vc_reservations: "ReservationsAndClinicalVisits" };
    for (const [table, migration] of Object.entries(origins)) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) {
        throw new Error(`Missing dbo.${table} (created by ${migration}); apply the earlier migrations up to ReservationAuthorship first.`);
      }
    }
    for (const table of ["vc_services", "vc_employee_services"]) {
      if (await queryRunner.hasTable(`dbo.${table}`)) throw new Error(`dbo.${table} already exists; review migration state.`);
    }
    if (await queryRunner.hasColumn("dbo.vc_reservations", "service_id")) {
      throw new Error("vc_reservations.service_id already exists; review migration state.");
    }

    // 1. Preconditions, holding exclusive table locks until commit: no reservation or employee profile changes meanwhile.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[vc_reservations] WITH (TABLOCKX, HOLDLOCK);
      SELECT @locked = COUNT(*) FROM [dbo].[vc_employees] WITH (TABLOCKX, HOLDLOCK);
      IF OBJECT_ID(${SERVICES}, N'U') IS NOT NULL
        OR OBJECT_ID(${EMPLOYEE_SERVICES}, N'U') IS NOT NULL
        OR COL_LENGTH(${RESERVATIONS}, N'service_id') IS NOT NULL
        OR OBJECT_ID(N'dbo.fk_vc_reservations_service', N'F') IS NOT NULL
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${RESERVATIONS}) AND [name] = N'ix_vc_reservations_service_id')
        OR EXISTS (SELECT 1 FROM sys.objects WHERE [name] LIKE N'%vc[_]services%' OR [name] LIKE N'%vc[_]employee[_]services%')
        THROW 51081, 'Clinic service objects already exist; review migration state.', 1;
      IF OBJECT_ID(N'dbo.pk_vc_employees', N'PK') IS NULL
        OR OBJECT_ID(N'dbo.fk_vc_reservations_employee', N'F') IS NULL
        THROW 51082, 'pk_vc_employees or fk_vc_reservations_employee is missing; review migration state.', 1;
    `);

    // 2. Catalog and qualifications. No ON DELETE CASCADE; trusted constraints.
    await queryRunner.query(`
      CREATE TABLE [dbo].[vc_services] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_services_id] DEFAULT NEWSEQUENTIALID(),
        [code] varchar(64) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(240) NULL,
        [duration_minutes] int NOT NULL,
        [is_active] bit NOT NULL CONSTRAINT [df_vc_services_is_active] DEFAULT 1,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_services_created_at] DEFAULT SYSDATETIME(),
        [updated_at] datetime2 NOT NULL CONSTRAINT [df_vc_services_updated_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_services] PRIMARY KEY ([id]),
        CONSTRAINT [uq_vc_services_code] UNIQUE ([code]),
        CONSTRAINT [ck_vc_services_code] CHECK (${CODE_CHECK}),
        CONSTRAINT [ck_vc_services_duration] CHECK (${DURATION_CHECK})
      );
      CREATE TABLE [dbo].[vc_employee_services] (
        [employee_id] uniqueidentifier NOT NULL,
        [service_id] uniqueidentifier NOT NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_employee_services_created_at] DEFAULT SYSDATETIME(),
        CONSTRAINT [pk_vc_employee_services] PRIMARY KEY ([employee_id], [service_id]),
        CONSTRAINT [fk_vc_employee_services_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id]),
        CONSTRAINT [fk_vc_employee_services_service] FOREIGN KEY ([service_id]) REFERENCES [dbo].[vc_services] ([id])
      );
    `);

    // 3. Index (later batch: the table exists).
    await queryRunner.query(`CREATE INDEX [ix_vc_employee_services_service_id] ON [dbo].[vc_employee_services] ([service_id]);`);

    // 4. Service of a reservation (NULL = reservation created before the catalog).
    await queryRunner.query(`ALTER TABLE [dbo].[vc_reservations] ADD [service_id] uniqueidentifier NULL;`);

    // 5. Trusted FK (WITH CHECK), no cascade, and index (later batch: references the new column).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_reservations] WITH CHECK ADD
        CONSTRAINT [fk_vc_reservations_service] FOREIGN KEY ([service_id]) REFERENCES [dbo].[vc_services] ([id]);
      CREATE INDEX [ix_vc_reservations_service_id] ON [dbo].[vc_reservations] ([service_id]);
    `);

    // 6. Final verification.
    await queryRunner.query(`
      IF (SELECT COUNT(*) FROM sys.check_constraints WHERE [parent_object_id] = OBJECT_ID(${SERVICES}) AND [is_not_trusted] = 0
          AND [name] IN (N'ck_vc_services_code', N'ck_vc_services_duration')) <> 2
        OR NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE [parent_object_id] = OBJECT_ID(${SERVICES}) AND [name] = N'uq_vc_services_code' AND [type] = 'UQ')
        OR (SELECT COUNT(*) FROM sys.foreign_keys WHERE [parent_object_id] = OBJECT_ID(${EMPLOYEE_SERVICES})
          AND [is_not_trusted] = 0 AND [delete_referential_action] = 0
          AND [name] IN (N'fk_vc_employee_services_employee', N'fk_vc_employee_services_service')) <> 2
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${EMPLOYEE_SERVICES}) AND [name] = N'ix_vc_employee_services_service_id')
        OR COL_LENGTH(${RESERVATIONS}, N'service_id') IS NULL
        OR COLUMNPROPERTY(OBJECT_ID(${RESERVATIONS}), N'service_id', 'AllowsNull') <> 1
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'fk_vc_reservations_service'
          AND [parent_object_id] = OBJECT_ID(${RESERVATIONS}) AND [is_not_trusted] = 0 AND [delete_referential_action] = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${RESERVATIONS}) AND [name] = N'ix_vc_reservations_service_id')
        THROW 51089, 'vc_services, vc_employee_services or vc_reservations is not in the expected final state.', 1;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard the clinic services catalog, the employee qualifications and the service of every reservation. Restore a backup taken before this migration.");
  }
}
