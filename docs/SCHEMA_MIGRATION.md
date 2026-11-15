# SQL Server schema: configurable measurements

The incremental migration `ConfigurableMeasurementTypes1794916800000` follows `AnimalMeasurementsAndMetadata1794830400000`. Existing migrations remain unchanged. No migration was executed against the database during this work. `synchronize` and `migrationsRun` remain disabled.

## Applying the migration

Back up the database and rehearse restoration. Stop writes and run `npm run db:migrate` on a representative copy, using the default TypeORM transaction mode (`all`). The new migration requires an active transaction and locks the measurement table during copying and verification. Do not execute partial SQL. TypeScript compilation does not validate DDL, permissions, locking, collation or production data: rehearse on SQL Server before production deployment.

## Catalog and metadata

`vc_measurement_types` contains a UUID, unique `code` varchar(64), `name` nvarchar(255), `unit` nvarchar(32), `is_active` bit, `description` nvarchar(240), `notes` nvarchar(500), `created_at` and `updated_at`. Description and notes are optional, following the global rule for domain tables. The technical migration tracking table is excluded. Names and codes are required; application codes use canonical uppercase. Inactive types still identify historical observations. The FK prevents deleting referenced types, without cascading deletion.

Deterministic seeds (UUID `10000000-0000-4000-8000-00000000000N`):

| N | code | name | unit |
|---|---|---|---|
| 1 | WEIGHT | Peso | kg |
| 2 | HEIGHT | Altura | cm |
| 3 | TEMPERATURE | Temperatura | °C |
| 4 | HEART_RATE | Frequência cardíaca | bpm |
| 5 | RESPIRATORY_RATE | Frequência respiratória | rpm |

## Historical conversion

`vc_animal_measurements` now contains `animal_id`, `measurement_type_id`, mandatory `value` decimal(18,6), `recorded_by`, `measured_at`, name, description, notes and audit timestamps. The decimal preserves all former weight decimal(13,3) and height decimal(6,2) values without conversion of units or rounding. There is no global sign constraint: temperatures and custom types may be negative. The API applies its own numeric limits to new writes; historical data retains its original precision.

A weight-only row retains its UUID and becomes WEIGHT. A height-only row retains its UUID and becomes HEIGHT. A row with both retains its UUID for WEIGHT and receives a new UUID for HEIGHT. The additional UUID is generated once in the temporary snapshot and used consistently for conversion and verification. Both observations preserve the animal, name, description, notes, author, measured_at, created_at and updated_at exactly. Unknown legacy author/time values remain NULL.

The migration counts expected observations and compares every value and metadata field before removing old columns. Checks depending on weight/height are removed, mandatory columns and the type FK are established, and only then are weight and height removed. Any failure rolls back the whole transaction. Review additional external objects depending on old columns before rehearsal: unsupported dependencies cause failure rather than silent removal.

`user_id` is renamed to `recorded_by` with `sp_rename`, retaining values, nullability and FK. The FK receives a matching name; existing indexes retain their column references. The migration adds author and animal/type/date indexes and retains the historical animal/date index. External SQL and reports must update the column name.

## Earlier migrations

The first animal snapshot conversion remains in the preceding migration: it copies values before removing weight/height from `vc_animals`, rejects negative data and heights that cannot fit without rounding, and leaves unknown measured_at/author values NULL. Species/breed structuring and removal of legacy_type, legacy_breed and legacy_age remain in that earlier chain. Export legacy text before applying the chain if required for external audits. Global metadata and the rename of `vc_users.nome` to `name` are retained.

## Audit timestamps and reversal

The driver uses `useUTC:false`, and datetime2 stores local time without an offset. The application and SQL Server must use the same timezone. Audit defaults use `SYSDATETIME()`, consistent with that convention. Conversion retains original timestamps without updating them.

`down` rejects destructive rollback: custom types, additional precision, UUIDs and history cannot be reconstructed in the former weight/height model without potentially losing information. Prepare a reviewed data-preserving reverse migration or restore a backup accounting for subsequent writes.

# SQL Server schema: accounts, roles and employees

`UserRolesAndEmployees1795003200000` follows `ConfigurableMeasurementTypes1794916800000`. It was not executed against any database during this work. It requires an active transaction (default `--transaction all`) and `down` rejects rollback.

## Destructive step (authorized)

The migration deletes every account and all data depending on accounts. Back up first: the data cannot be reconstructed. Species, breeds, measurement types and blocked times are retained. Order of operations:

1. Verify prerequisite tables exist and the new tables do not.
2. `DELETE` in foreign-key order: `vc_reset_tokens`, `vc_animal_measurements`, `vc_reservations`, `vc_animals`, `vc_users`.
3. Drop the references to `vc_users` (`FK_resetToken_user`, `fk_vc_animal_measurements_recorder`, `FK_reservation_client`, `FK_reservation_employee`, `FK_animal_owner`) and `DROP TABLE vc_users`; legacy `PK_users`, `CK_users_role`, `CK_users_function` and `DF_users_*` disappear with it. Any other unknown reference makes the drop fail and the transaction roll back.
4. Create the new `vc_users`, `vc_roles`, `vc_user_roles`, `vc_job_titles`, `vc_employees`, `vc_employee_job_titles` and `vc_system_settings`.
5. Seed roles, job titles and settings.
6. Recreate the five references with lowercase names (`fk_vc_animals_owner`, `fk_vc_reservations_client`, `fk_vc_reservations_employee`, `fk_vc_reset_tokens_user`, `fk_vc_animal_measurements_recorder`) without cascade, and rename `PK_resetToken`/`IDX_RESET_TOKEN` to `pk_vc_reset_tokens`/`ix_vc_reset_tokens_user_id`. The former `ON DELETE CASCADE` on reset tokens is removed: users are soft-deleted and the application deletes their reset tokens explicitly. `employee_id` and `recorded_by` still reference `vc_users`.

## Tables

`vc_users` holds account data only: `name` nvarchar(150), `email` nvarchar(255) (trimmed lowercase, `ck_vc_users_email_normalized`: `DATALENGTH([email]) = DATALENGTH(LTRIM(RTRIM([email])))` rejects leading and trailing spaces, which a plain `=` would accept because SQL Server pads trailing spaces in comparisons, and a `Latin1_General_100_BIN2` comparison with `LOWER([email])` rejects uppercase; unique among non-deleted rows through the filtered index `uq_vc_users_email`, so the email of a soft-deleted account can be reused by a new account), `password_hash`, `phone` nvarchar(20), `birth_date` date, `nif` varchar(9) (nine digits, `ck_vc_users_nif`; filtered unique `uq_vc_users_nif` when not null and not deleted), `profile_picture_url` nvarchar(500), `is_active`, metadata, audit timestamps and `deleted_at`. Role, function and workload columns are gone.

`vc_employees` is a one-to-one profile (`uq_vc_employees_user_id`): `employee_number` nvarchar(30) (filtered unique), `license_number` nvarchar(50), `hire_date`, `termination_date` (`ck_vc_employees_dates`: termination on or after hire when both are known), `is_available_for_bookings` (default 1), metadata and audit timestamps. `vc_employee_job_titles` and `vc_user_roles` are composite-key assignment tables with `created_at` and indexes on the second key (`ix_vc_employee_job_titles_job_title_id`, `ix_vc_user_roles_role_id`); `ix_vc_user_roles_assigned_by` indexes the audit reference. `vc_user_roles.assigned_by` uniqueidentifier NULL (`fk_vc_user_roles_assigned_by` to `vc_users`, no cascade) records the authenticated actor of each assignment; it is NULL for seeds, the migration, public registration and the admin bootstrap.

`vc_roles` and `vc_job_titles` are catalogs (`code` varchar(64) unique uppercase checked by `ck_vc_*_code`, `name` nvarchar(100), metadata, `is_active`, timestamps). `vc_system_settings` holds generic settings (`code` varchar(64) unique uppercase, `value` nvarchar(500) NULL, metadata, timestamps).

The entities declare the same constraint and index names as the migration (`@Unique("uq_vc_<table>_code", ["code"])`, `uq_vc_employees_user_id`, and the filtered unique indexes `uq_vc_users_email`, `uq_vc_users_nif` and `uq_vc_employees_employee_number` through `@Index(..., { unique: true, where })`), so generated schema diffs do not invent other names. Synchronization stays disabled.

Filtered indexes require `SET ANSI_NULLS ON` and `SET QUOTED_IDENTIFIER ON` in the session that creates them and in every session that writes to those tables. The `mssql` driver used by TypeORM sets both; when running parts of this migration manually (sqlcmd, SSMS scripts, other tools), start the script with `SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`.

## Deterministic seeds

| UUID | Table | code | name / value |
|---|---|---|---|
| `20000000-0000-4000-8000-000000000001` | vc_roles | ADMIN | Administrador |
| `20000000-0000-4000-8000-000000000002` | vc_roles | EMPLOYEE | Funcionário |
| `20000000-0000-4000-8000-000000000003` | vc_roles | CLIENT | Cliente |
| `30000000-0000-4000-8000-00000000000N` (1-6) | vc_job_titles | VETERINARIAN, RECEPTIONIST, ACCOUNTANT, ADMINISTRATION, PHARMACY, OTHER | Veterinário, Atendimento, Contabilista, Administração, Farmácia, Outros |
| `40000000-0000-4000-8000-000000000001` | vc_system_settings | ADMIN_ROLE_ID | `20000000-...-000000000001` |
| `40000000-0000-4000-8000-000000000002` | vc_system_settings | EMPLOYEE_ROLE_ID | `20000000-...-000000000002` |
| `40000000-0000-4000-8000-000000000003` | vc_system_settings | CLIENT_ROLE_ID | `20000000-...-000000000003` |

Job titles replace the former `Function` enum. After migrating, run `npm run db:seed:admin`: it reads `ADMIN_ROLE_ID` and `EMPLOYEE_ROLE_ID`, creates the account (bcrypt hash), both role assignments and an employee profile in one transaction, never promotes an existing account and never changes an existing administrator's password.
