---
titulo: Database
descricao: SQL Server integrity rules (constraints, triggers), conventions (UTC, names) and how to write and run migrations.
cobre: [src/database/**, src/force-utc.ts, src/app/core/persistence/utc-datetime.ts, src/app/core/persistence/persistence.service.ts, src/app/**/entities/*.entity.ts]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

# Database

SQL Server through TypeORM 0.3 (`type: "mssql"`, schema `dbo`). Connection options: `src/database/database.config.ts`; CLI data source: `src/database/data-source.ts`. Only what the code does not make obvious is here; table columns are in the entities (`src/app/**/entities/*.entity.ts`) and in the migrations (`src/database/migrations/`).

## Running migrations

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | `typeorm migration:run -d src/database/data-source.ts` (ts-node) |
| `npm run db:migrations:show` | `typeorm migration:show` with the same data source |
| `npm run db:seed:admin` | `src/database/seed-admin.ts`: first administrator from `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (at least 12 characters) and optional `SEED_ADMIN_NAME`; run after migrating |

- Configuration comes from `VETCARE_ENV_FILE` or, by default, `.env.mssql.local` (`databaseEnvFile()`); required: `TYPEORM_CONNECTION=mssql`, `TYPEORM_HOST`, `TYPEORM_USERNAME`, `TYPEORM_PASSWORD`, `TYPEORM_DATABASE`; optional `TYPEORM_PORT` (1433), `TYPEORM_ENCRYPT` (true), `TYPEORM_TRUST_SERVER_CERTIFICATE` (false). Set `VETCARE_ENV_FILE` explicitly when the default file points at a database you must not touch.
- `synchronize` and `migrationsRun` are false: the schema changes only through migrations.
- Use the default TypeORM transaction mode (`all`). Every migration from `ConfigurableMeasurementTypes1794916800000` on refuses to run without an active transaction (`queryRunner.isTransactionActive`).
- `down` of every migration except `ClinicalIntegrity1795780800000` throws: rollback means restoring a backup taken before the migration. `ClinicalIntegrity` `down` drops only its two triggers.
- Specs with mocked query runners check the SQL batches and their order of `AnimalOwners`, `ReservationAuthorship`, `ClinicServices`, `SchedulesAndBlocks` and `ClinicalIntegrity` (`src/database/*.migration.spec.ts`); they do not touch a database.

## Writing a new migration

There is no npm script to create or generate migrations. Existing migrations are hand-written SQL:

- File `src/database/migrations/<timestamp>-<PascalName>.ts`, class `<PascalName><timestamp>` with `name = "<PascalName><timestamp>"`. Timestamps so far are one day apart (`1794657600000` ... `1795780800000`).
- Do not use `migration:generate` or `schema:sync`: the entities do not declare every CHECK constraint, `INCLUDE` columns, the legacy `vc_blocked_times` columns, `vc_reservations.row_version` or the composite foreign keys (mapped with `createForeignKeyConstraints: false`), so a generated diff is never empty and would drop objects.
- Pattern followed by the recent migrations: verify the transaction and the prerequisite objects in TypeScript; take exclusive table locks (`TABLOCKX, HOLDLOCK`) for the preconditions; `THROW` codes in a block of ten per migration (`510x0`-`510x9`, last used `51100`-`51109`; `51108` reserved); put `CREATE TRIGGER` and statements that reference a column added in the same migration in their own batch; finish with a verification batch (`510x9`) that checks names, trust (`is_not_trusted = 0`) and the absence of cascades.
- Filtered indexes need `SET ANSI_NULLS ON` and `SET QUOTED_IDENTIFIER ON` in the creating session (and in every writing session). The mssql driver sets both; migrations that create filtered indexes set and check them again (`IntegrityAndLifecycle`, `AnimalOwners`, `ReservationAuthorship`). Scripts run by hand (sqlcmd, SSMS) must start with both.
- New constraints are added `WITH CHECK` (trusted), foreign keys without cascade.
- Declare the same names in the entity (`@Index(..., { where })`, `@Unique`, `@Check`, `primaryKeyConstraintName`, `foreignKeyConstraintName`). `src/database/entity-foreign-key-names.spec.ts` fails when an entity foreign key has no explicit name. Add a `*.migration.spec.ts` that checks the SQL batches and their order.

## Conventions

- Names: tables `vc_<plural>`; lowercase constraint prefixes `pk_`, `fk_`, `uq_`, `ix_`, `ck_`, `df_`, `tr_` followed by the table (`fk_vc_reservations_service`, `ck_vc_services_duration`). Value checks on codes and enums use `COLLATE Latin1_General_100_BIN2`, so case and trailing spaces are not ignored.
- Catalog codes (`vc_roles`, `vc_job_titles`, `vc_system_settings`, `vc_measurement_types`, `vc_services`): `ck_<table>_code` = uppercase letter first, then only `A-Z`, `0-9`, `_`; unique (`uq_<table>_code`).
- Time: the Node process runs in UTC. `src/force-utc.ts` sets `process.env.TZ = "UTC"` and must be the first import of every entry point (`src/main.ts`, `src/database/data-source.ts`, `src/database/seed-admin.ts`, `src/scripts/export-openapi.ts`). The driver uses `useUTC: false` (process-local wall clock), so with the process in UTC `utcDateTimeTransformer` (`src/app/core/persistence/utc-datetime.ts`) is the identity; in any other timezone, a UTC wall clock inside a daylight-saving gap is rejected with 400 instead of shifted.
- Instants written by the application (`start_at`, `end_at`, `confirmed_at`, `measured_at`, `assigned_at`, ...) are UTC. Audit defaults `created_at`/`updated_at` use `SYSDATETIME()`, the SQL Server clock, which is UTC only if the server runs in UTC [não verificado: depends on the deployment]; exceptions with `SYSUTCDATETIME()`: `vc_blocked_times.created_at` and `vc_reset_tokens.created_at`.
- Deterministic seed ids: measurement types `10000000-0000-4000-8000-00000000000N` (WEIGHT, HEIGHT, TEMPERATURE, HEART_RATE, RESPIRATORY_RATE), roles `20000000-...-00000000000N` (ADMIN, EMPLOYEE, CLIENT), job titles `30000000-...-00000000000N` (VETERINARIAN, RECEPTIONIST, ACCOUNTANT, ADMINISTRATION, PHARMACY, OTHER), settings `40000000-...` (below). No services are seeded.
- Users, animals and measurements are soft-deleted (`deleted_at`); uniqueness of user email and NIF applies only to non-deleted rows (filtered unique indexes).
- Composite foreign keys exist only in the database: `fk_vc_clinical_visits_reservation_animal` (`reservation_id`, `animal_id`), `fk_vc_animal_measurements_clinical_visit` (`clinical_visit_id`, `animal_id`), `fk_vc_animals_breed_species` (`breed_id`, `species_id`). The entities map the relation on the single id column, because a composite join sharing `animal_id`/`species_id` makes TypeORM 0.3 generate wrong joins (`measurement.sql.spec.ts`).
- SQL Server errors are translated only in `PersistenceService` (`src/app/core/persistence/persistence.service.ts`): 2601/2627 -> 409, 547 FOREIGN KEY -> 409, 547 CHECK -> 400, 1205/1222 -> 409 (retry), trigger THROWs 51104-51107 -> 409 (also when they arrive in `precedingErrors` behind Msg 3616).

## Integrity enforced by the database

What each constraint blocks. Rules that cannot be expressed in SQL stay in the application; see [api/integrity-lifecycle.md](api/integrity-lifecycle.md).

### Accounts and staff

- `vc_users`: `ck_vc_users_email_normalized` blocks emails with leading/trailing spaces (`DATALENGTH` comparison) or uppercase (BIN2 against `LOWER`); `ck_vc_users_nif` requires nine digits; `uq_vc_users_email` and `uq_vc_users_nif` are filtered to non-deleted rows, so the email of a soft-deleted account can be reused.
- `vc_employees`: one profile per account (`uq_vc_employees_user_id`); `uq_vc_employees_employee_number` filtered (not null); `ck_vc_employees_dates` (termination on or after hire when both are known).
- `vc_user_roles`, `vc_employee_job_titles`, `vc_employee_services`: composite primary keys (one row per pair).
- `vc_reset_tokens`: only `token_hash` binary(32) (SHA-256), unique (`uq_vc_reset_tokens_token_hash`); the plain token is never stored.
- `vc_system_settings`: codes unique and immutable through the API; seeded ids `40000000-0000-4000-8000-00000000000N` (`ADMIN_ROLE_ID`, `EMPLOYEE_ROLE_ID`, `CLIENT_ROLE_ID`, `RESERVATION_NO_SHOW_TOLERANCE_MINUTES`, `RESERVATION_BUFFER_MINUTES`, `VETERINARIAN_JOB_TITLE_ID`, N = 1..6). Code references settings codes, never role ids.

### Animals, catalogs and measurements

- `uq_vc_species_name`, `uq_vc_breeds_species_name`; `uq_vc_breeds_id_species` supports the composite FK that keeps an animal's breed inside its species.
- `vc_animal_owners`: `uq_vc_animal_owners_active` (one active row per animal and user) and `uq_vc_animal_owners_primary` (at most one active primary per animal), both filtered `ended_at IS NULL`; `ck_vc_animal_owners_dates` (`ended_at >= assigned_at`), `ck_vc_animal_owners_ended` (an active row has no `ended_by`/`end_reason`), `ck_vc_animal_owners_end_reason` (TRANSFERRED, REMOVED, ROLE_CHANGED, ACCOUNT_DELETED, MIGRATED). "At least one primary while there are active tutors" is an application rule.
- `vc_animal_measurements`: `ck_vc_animal_measurements_deleted` (`deleted_at`, `deleted_by` and a non-blank `delete_reason` all set or all NULL); `ck_vc_animal_measurements_clinical_not_deleted` (a measurement linked to a visit cannot be soft-deleted). No sign check on `value`: sign rules per type are in the API.

### Services and scheduling

- `vc_services`: `ck_vc_services_duration` (`duration_minutes` 1..1440 and a multiple of 5, i.e. 5..1440); a referenced service cannot be deleted (FKs from `vc_reservations` and `vc_employee_services`, no cascade).
- `vc_employee_schedules`: `ck_vc_employee_schedules_day_of_week` (0..6, 0 = Sunday), `ck_vc_employee_schedules_time` (`end_time > start_time`), `ck_vc_employee_schedules_validity` (`valid_until >= valid_from`). Non-overlap of periods is an application rule (under the employee schedule applock).
- `vc_blocked_times`: `ck_vc_blocked_times_interval` (`end_at > start_at`). The legacy columns `date`, `time_start`, `time_end`, `start`, `end` are NULL-able, unmapped and no longer read or written; dropping them needs a new migration.

### Reservations and clinical visits

- `vc_reservations`: `ck_vc_reservations_interval` (`end_at > start_at`); `ck_vc_reservations_status` (PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW); `ck_vc_reservations_confirmed` (CONFIRMED/COMPLETED/NO_SHOW need `employee_id` and `confirmed_at`); `ck_vc_reservations_pending` (PENDING has no `confirmed_at`); `ck_vc_reservations_cancelled` (`cancelled_at` set if and only if CANCELLED). `service_id` and `created_by` are NULL for rows created before their migrations and are never updated by the application (`update: false`). `row_version` is not mapped.
- `vc_clinical_visits`: `ck_vc_clinical_visits_status` (IN_PROGRESS, COMPLETED, VOIDED), `_dates` (`ended_at >= started_at`), `_in_progress` (no `ended_at`), `_completed` (`ended_at` set), `_voided` (VOIDED if and only if non-blank `void_reason`, `voided_at` and `voided_by`), `_voided_dates` (`voided_at >= started_at`). `uq_vc_clinical_visits_reservation_id` (filtered, not null) allows one visit per reservation, VOIDED included; `uq_vc_clinical_visits_animal_in_progress` allows one IN_PROGRESS visit per animal. The composite FK to `vc_reservations (id, animal_id)` keeps the visit on the reservation's animal.
- `completed_by` has deliberately no CHECK "`COMPLETED` implies `completed_by IS NOT NULL`": visits completed before `IntegrityAndLifecycle1795348800000` have no known author and inventing one would falsify audit data. The application fills it on every completion (`src/database/migrations/1795348800000-IntegrityAndLifecycle.ts`, header comment).
- `vc_reservation_history`: append-only. `tr_vc_reservation_history_append_only` (INSTEAD OF UPDATE, DELETE) throws 51023; `ck_vc_reservation_history_action` lists the actions (CREATED, CONFIRMED, RESCHEDULED, EMPLOYEE_ASSIGNED, EMPLOYEE_CHANGED, CANCELLED, COMPLETED, NO_SHOW, CLIENT_CHANGED); `old_data`/`new_data` must be JSON (`ISJSON`, compatibility level 130 or later); `uq_vc_reservation_history_created` allows one CREATED event per reservation, whose `changed_by` equals `vc_reservations.created_by`.

### Clinical integrity triggers

Added by `ClinicalIntegrity1795780800000`; both `AFTER INSERT, UPDATE`, set-based, and read the other table `WITH (READCOMMITTEDLOCK)` so they see committed rows under READ_COMMITTED_SNAPSHOT.

| Trigger | Blocks | THROW | HTTP |
| --- | --- | --- | --- |
| `tr_vc_clinical_visits_reservation_integrity` | changing a visit's `id`, `animal_id` or `reservation_id` | 51104 | 409 |
| same | inserting a visit linked to a reservation that is not CONFIRMED (walk-ins not checked) | 51105 | 409 |
| `tr_vc_reservations_visit_integrity` | a reservation becoming COMPLETED without a COMPLETED visit | 51106 | 409 |
| same | a reservation with an IN_PROGRESS or COMPLETED visit becoming CANCELLED, NO_SHOW or PENDING | 51107 | 409 |

- The reservation trigger returns immediately when `status` is not in the SET list, so writes of other columns (tutor moves writing `client_id`) are not checked.
- Not covered by design: DELETE (no DELETE route for reservations or visits), a reservation going from COMPLETED back to CONFIRMED, and any change of a visit's `status`; the application blocks those transitions.
- Mandatory application order: `complete()` updates the visit to COMPLETED before the reservation; the reverse order fails with 51106.
- A THROW inside a trigger dooms the whole transaction; SQL Server may follow it with Msg 3616, which is why `PersistenceService` looks for the number in `precedingErrors`.
- TypeORM's mssql INSERT/UPDATE use `OUTPUT ... INTO @OutputTable`, which SQL Server accepts on tables with triggers (an OUTPUT without INTO is rejected, Msg 334). Avoid write paths that emit OUTPUT without INTO (for example `.returning()`) on `vc_reservations` and `vc_clinical_visits`.
