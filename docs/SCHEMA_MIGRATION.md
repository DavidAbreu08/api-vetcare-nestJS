# SQL Server schema: configurable measurements

The incremental migration `ConfigurableMeasurementTypes1794916800000` follows `AnimalMeasurementsAndMetadata1794830400000`. Existing migrations remain unchanged. No migration was executed against the database during this work. `synchronize` and `migrationsRun` remain disabled.

## Applying the migration

Back up the database and rehearse restoration. Stop writes and run `npm run db:migrate` on a representative copy, using the default TypeORM transaction mode (`all`). The new migration requires an active transaction and locks the measurement table during copying and verification. Do not execute partial SQL. TypeScript compilation does not validate DDL, permissions, locking, collation or production data: rehearse on SQL Server before production deployment.

## Catalog and metadata

`vc_measurement_types` contains a UUID, unique `code` varchar(64), `name` nvarchar(255), `unit` nvarchar(32), `is_active` bit, `description` nvarchar(240), `notes` nvarchar(500), `created_at` and `updated_at`. Description and notes are optional, following the global rule for domain tables. The technical migration tracking table is excluded. Names and codes are required; application codes use canonical uppercase. Inactive types still identify historical observations. The FK prevents deleting referenced types, without cascading deletion.

Deterministic seeds (English display-name meanings below; historical migrations and their persisted labels remain unchanged). UUID `10000000-0000-4000-8000-00000000000N`:

| N | code | English display-name meaning | unit |
|---|---|---|---|
| 1 | WEIGHT | Weight | kg |
| 2 | HEIGHT | Height | cm |
| 3 | TEMPERATURE | Temperature | °C |
| 4 | HEART_RATE | Heart rate | bpm |
| 5 | RESPIRATORY_RATE | Respiratory rate | rpm |

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

Display names in this table are English meanings of the historical seed labels, not a migration that renames stored data.

| UUID | Table | code | English display-name meaning / value |
|---|---|---|---|
| `20000000-0000-4000-8000-000000000001` | vc_roles | ADMIN | Administrator |
| `20000000-0000-4000-8000-000000000002` | vc_roles | EMPLOYEE | Employee |
| `20000000-0000-4000-8000-000000000003` | vc_roles | CLIENT | Client |
| `30000000-0000-4000-8000-00000000000N` (1-6) | vc_job_titles | VETERINARIAN, RECEPTIONIST, ACCOUNTANT, ADMINISTRATION, PHARMACY, OTHER | Veterinarian, Receptionist, Accountant, Administration, Pharmacy, Other |
| `40000000-0000-4000-8000-000000000001` | vc_system_settings | ADMIN_ROLE_ID | `20000000-...-000000000001` |
| `40000000-0000-4000-8000-000000000002` | vc_system_settings | EMPLOYEE_ROLE_ID | `20000000-...-000000000002` |
| `40000000-0000-4000-8000-000000000003` | vc_system_settings | CLIENT_ROLE_ID | `20000000-...-000000000003` |

Job titles replace the former `Function` enum. After migrating, run `npm run db:seed:admin`: it reads `ADMIN_ROLE_ID` and `EMPLOYEE_ROLE_ID`, creates the account (bcrypt hash), both role assignments and an employee profile in one transaction, never promotes an existing account and never changes an existing administrator's password.

# SQL Server schema: reservations and clinical visits

`ReservationsAndClinicalVisits1795089600000` follows `UserRolesAndEmployees1795003200000`. It was not executed against any database during this work. It requires an active transaction and `down` rejects rollback. ISJSON checks require database compatibility level 130 or later.

Order of operations:

1. Verify prerequisite tables, absent new objects and absent `clinical_visit_id`; under `TABLOCKX, HOLDLOCK` THROW 51020 when `vc_reservations` has rows, 51021 when another table references it, 51022 when the new setting codes or seed ids exist. Data is not converted: the previous migration already removed every reservation.
2. `DROP TABLE vc_reservations` (legacy `PK_reservation`, `DF_/CK_reservation_*`, `FK_reservation_animal`, `fk_vc_reservations_*` go with it) and recreate it.
3. Create `vc_clinical_visits`, then `vc_reservation_history` and its trigger `tr_vc_reservation_history_append_only` (INSTEAD OF UPDATE, DELETE: THROW 51023).
4. Add `vc_animal_measurements.clinical_visit_id`, `fk_vc_animal_measurements_clinical_visit` (`clinical_visit_id`, `animal_id`) -> `vc_clinical_visits` (`id`, `animal_id`) and `ix_vc_animal_measurements_clinical_visit_id`. `recorded_by` still references `vc_users`.
5. Seed the settings below.

`vc_reservations`: `animal_id`, `client_id` (`vc_users`), `employee_id` NULL (`vc_employees`), `start_at`/`end_at` datetime2(3), `status` nvarchar(30) default PENDING, `reason` nvarchar(500), `description` nvarchar(240), `notes` nvarchar(max), `confirmed_at`/`cancelled_at` datetime2(3), audit timestamps and `row_version` rowversion. Constraints: `uq_vc_reservations_id_animal`, `ck_vc_reservations_interval` (end > start), `ck_vc_reservations_status` (BIN2: PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW), `ck_vc_reservations_confirmed` (CONFIRMED/COMPLETED/NO_SHOW need employee and confirmed_at), `ck_vc_reservations_pending` (PENDING has no confirmed_at), `ck_vc_reservations_cancelled` (cancelled_at iff CANCELLED). Indexes `ix_vc_reservations_{client,animal,employee,status}_start`. `row_version` is not mapped: the API serializes changes with UPDLOCK and re-validates state inside the transaction; it remains available to external tools.

`vc_clinical_visits`: `reservation_id` NULL, `animal_id`, `employee_id` (`vc_employees`), `status` (IN_PROGRESS, COMPLETED, VOIDED), `started_at`, `ended_at`, `clinical_notes` nvarchar(max), `description`, `void_reason` nvarchar(500), `voided_at`, `voided_by` (`vc_users`), audit timestamps. `fk_vc_clinical_visits_reservation_animal` (`reservation_id`, `animal_id`) -> `vc_reservations` (`id`, `animal_id`) keeps the animal of the reservation; filtered `uq_vc_clinical_visits_reservation_id` allows one visit per reservation; `uq_vc_clinical_visits_id_animal` supports the measurement FK. Checks: `ended_at >= started_at`, IN_PROGRESS without ended_at, COMPLETED with ended_at, VOIDED iff non-blank void_reason, voided_at and voided_by. Indexes on (animal_id, started_at), (employee_id, started_at) and voided_by.

`vc_reservation_history`: `reservation_id`, `changed_by` NULL (`vc_users`), `action` (CREATED, CONFIRMED, RESCHEDULED, EMPLOYEE_ASSIGNED, EMPLOYEE_CHANGED, CANCELLED, COMPLETED, NO_SHOW; CLIENT_CHANGED from migration 1795435200000), `old_data`/`new_data` nvarchar(max) with ISJSON checks, `reason` nvarchar(500), `created_at`; index (reservation_id, created_at) and changed_by. No description, notes or updated_at.

| UUID | code | value |
|---|---|---|
| `40000000-0000-4000-8000-000000000004` | RESERVATION_NO_SHOW_TOLERANCE_MINUTES | 15 |
| `40000000-0000-4000-8000-000000000005` | RESERVATION_BUFFER_MINUTES | 15 |

UTC columns: with `useUTC:false` the driver uses the process-local wall clock, so the entities use a transformer that sends and reads the UTC wall clock. **Running the Node process in UTC is mandatory**: `src/force-utc.ts` sets `process.env.TZ = "UTC"` and must remain the first import of `src/main.ts`, `src/database/data-source.ts` and `src/database/seed-admin.ts` (any new entry point must import it first). The transformer then is the identity; if the process ever ran in another timezone, a UTC wall clock inside its spring-forward gap would be rejected (400) instead of shifted. Columns written by the application from a `Date` (outside SQL defaults) are therefore UTC wall clock; `created_at`/`updated_at` keep `SYSDATETIME()` of the SQL Server. Reports must read the UTC columns as UTC.

Rules kept in the backend (not expressible as row checks): COMPLETED only through visit completion, no-show tolerance, overlap with buffer (applock), cancellation/reschedule/no-show blocked by an IN_PROGRESS or COMPLETED visit, the visit's employee being active, notes immutability after completion.

A VOIDED visit does not hold its reservation (it can still be rescheduled, cancelled or marked as no-show), but `uq_vc_clinical_visits_reservation_id` also covers VOIDED rows, so no new visit can be started for that reservation; a new attendance needs a new reservation or a visit without reservation.

Pending (not implemented): audit trail of `clinical_notes` changes on IN_PROGRESS visits (only the final state and void metadata are kept).

# SQL Server schema: measurement hardening

`MeasurementsHardening1795176000000` follows `ReservationsAndClinicalVisits1795089600000`. It was not executed against any database during this work. It requires an active transaction (default `--transaction all`) and `down` rejects rollback (restore a backup).

Preconditions (exclusive table locks held until commit; THROW codes 51030–51034):

- 51030: no `vc_animal_measurements` row without `recorded_by`.
- 51031: every `vc_measurement_types.code` matches `[A-Z][A-Z0-9_]*` (binary collation).
- 51032: `fk_vc_animal_measurements_recorder` and `ix_vc_animal_measurements_recorded_by` exist.
- 51033: no other index or user-created statistics depend on `recorded_by`.
- 51034: the new check constraints do not exist yet (the new columns are also checked before any DDL).

Steps:

1. `recorded_by` becomes NOT NULL: drop `fk_vc_animal_measurements_recorder` and `ix_vc_animal_measurements_recorded_by`, `ALTER COLUMN`, recreate both (FK `WITH CHECK`, trusted).
2. Add `updated_by` uniqueidentifier NULL (last editor; `recorded_by` stays the original author), `deleted_at` datetime2(3) NULL (UTC instant), `deleted_by` uniqueidentifier NULL and `delete_reason` nvarchar(500) NULL.
3. `fk_vc_animal_measurements_updated_by` and `fk_vc_animal_measurements_deleted_by` -> `vc_users` (no cascade), indexes `ix_vc_animal_measurements_updated_by` and `ix_vc_animal_measurements_deleted_by`.
4. `ck_vc_animal_measurements_deleted`: the three soft-delete columns are all NULL or all set with a non-blank reason. `ck_vc_animal_measurements_clinical_not_deleted`: a measurement with `clinical_visit_id` cannot be soft-deleted.
5. `ck_vc_measurement_types_code`, the same pattern as `ck_vc_roles_code`, `ck_vc_job_titles_code` and `ck_vc_system_settings_code`.

`measured_at` keeps its type; the entity now uses the UTC transformer. Because the Node process is forced to UTC (`src/force-utc.ts`), the transformer is the identity and existing values need no conversion. The entities declare the same index, check and foreign-key names. Measurements are no longer physically deleted by the application.

ORM mapping of composite FKs: `fk_vc_animal_measurements_clinical_visit` (clinical_visit_id, animal_id) and `fk_vc_clinical_visits_reservation_animal` (reservation_id, animal_id) exist only in the database. The entities map `clinicalVisit` and `reservation` on the single id column with `createForeignKeyConstraints: false`, because a composite join column sharing `animal_id` with the `animal` relation makes TypeORM 0.3 overwrite that column's metadata and generate wrong joins. `measurement.sql.spec.ts` checks the generated SQL.

# SQL Server schema: hashed reset tokens

`HashedResetTokens1795262400000` follows `MeasurementsHardening1795176000000` and must ship in the same deploy as the code that reads `token_hash` (the previous code reads `reset_token`, which this migration removes). It was not executed against any database during this work. It requires an active transaction (default `--transaction all`) and `down` rejects rollback (plain-text tokens cannot be restored from their hashes; restore a backup).

Preconditions (exclusive lock on `vc_reset_tokens` held until commit; THROW codes 51040–51049):

- 51040: `pk_vc_reset_tokens`, `fk_vc_reset_tokens_user` and `ix_vc_reset_tokens_user_id` exist.
- 51041: no other index on `vc_reset_tokens` and no user-created statistics on `reset_token`, `user_id` or `expires_at`.
- 51042: no foreign key references `vc_reset_tokens`, no check constraint, computed column or schema-bound object depends on it, no default on the changed columns and no foreign key other than `fk_vc_reset_tokens_user`.
- 51043: `uq_vc_reset_tokens_token_hash`, `df_vc_reset_tokens_id` and `df_vc_reset_tokens_created_at` do not exist yet (the new columns and `vc_users.password_changed_at` are also checked before any DDL).

Steps:

1. Delete unusable rows: `user_id` or `expires_at` NULL, `user_id` without a `vc_users` row (orphans; soft-deleted accounts still have one), `expires_at <= SYSUTCDATETIME()`, or a `reset_token` that is not 64 lowercase hexadecimal characters (`DATALENGTH` and a `Latin1_General_100_BIN2` pattern, so trailing spaces and uppercase are caught). Then 51044 verifies that no remaining token references a missing user (the foreign key is recreated `WITH CHECK`).
2. Add `id` uniqueidentifier NOT NULL (`df_vc_reset_tokens_id` DEFAULT NEWSEQUENTIALID()), `token_hash` binary(32) NULL, `used_at` datetime2 NULL and `created_at` datetime2 NOT NULL (`df_vc_reset_tokens_created_at` DEFAULT SYSUTCDATETIME(); the process runs in UTC).
3. Convert in place: `token_hash = HASHBYTES('SHA2_256', CONVERT(varchar(255), reset_token))` (varchar, so the bytes hashed equal the utf8 text hashed by the application); `created_at` is estimated as `expires_at - 1 hour` (capped at now).
4. Drop `fk_vc_reset_tokens_user` and `ix_vc_reset_tokens_user_id`; `user_id`, `expires_at` and `token_hash` become NOT NULL; drop `pk_vc_reset_tokens` and the column `reset_token`.
5. `pk_vc_reset_tokens` on `id`, unique index `uq_vc_reset_tokens_token_hash`, `ix_vc_reset_tokens_user_id`, and `fk_vc_reset_tokens_user` -> `vc_users` recreated `WITH CHECK` (trusted), without cascade.
6. `vc_users.password_changed_at` datetime2 NULL (UTC instant of the last password reset or change).
7. Final verification (51048: every row has a 32-byte `token_hash`; 51049: final columns, nullability, key, indexes and trusted non-cascading FK are as expected).

Resulting `vc_reset_tokens`: `id` (PK), `token_hash` binary(32) unique, `user_id` NOT NULL, `expires_at` NOT NULL, `used_at` NULL, `created_at` NOT NULL, plus `name`/`description`/`notes`. Only the SHA-256 of a token is stored; the plain token exists only in the email link. Pending tokens are rows with `used_at` NULL and `expires_at` in the future; a token is consumed or invalidated by setting `used_at`. The hourly cleanup deletes expired rows and rows used more than 24 hours ago. The entities declare the same key, index and foreign-key names; instants use the UTC transformer.

# SQL Server schema: integrity and lifecycle

`IntegrityAndLifecycle1795348800000` follows `HashedResetTokens1795262400000`. It is additive and was not executed against any database during this work. It requires an active transaction (default `--transaction all`); `down` rejects rollback (it would discard `completed_by` and the new setting; restore a backup).

The migration sets `ANSI_NULLS` and `QUOTED_IDENTIFIER` ON for its session and verifies them (51050) before creating the filtered unique index (see the note on filtered indexes above).

Preconditions (exclusive lock on `vc_clinical_visits` held until commit; THROW codes 51050–51059). No data is normalized automatically: duplicates and inconsistent dates need a clinical decision.

- 51050: `ANSI_NULLS` and `QUOTED_IDENTIFIER` are ON.
- 51051: `fk_vc_clinical_visits_completed_by`, `ck_vc_clinical_visits_voided_dates`, `uq_vc_clinical_visits_animal_in_progress` and `ix_vc_clinical_visits_completed_by` do not exist yet (`completed_by` is also checked before any DDL).
- 51052: no animal has more than one `IN_PROGRESS` visit (complete or void the extra visits first).
- 51053: no visit has `voided_at < started_at`.
- 51054: the setting `VETERINARIAN_JOB_TITLE_ID` and its seed id `40000000-0000-4000-8000-000000000006` do not exist yet (`vc_system_settings` read with `UPDLOCK, HOLDLOCK`).

Steps:

1. `vc_clinical_visits.completed_by` uniqueidentifier NULL (account that completed the visit).
2. In a later batch: `fk_vc_clinical_visits_completed_by` -> `vc_users` (`WITH CHECK`, no cascade), `ck_vc_clinical_visits_voided_dates` (`voided_at IS NULL OR voided_at >= started_at`, `WITH CHECK`), `ix_vc_clinical_visits_completed_by`, and the filtered unique index `uq_vc_clinical_visits_animal_in_progress` on `(animal_id) WHERE status = N'IN_PROGRESS'` (at most one visit in progress per animal).
3. Setting `VETERINARIAN_JOB_TITLE_ID` (fixed id `...0006`, same method as the `*_ROLE_ID` seeds): value = lowercase id of the active job title with code `VETERINARIAN` (seeded by `UserRolesAndEmployees`, `30000000-...-0001`), read with `UPDLOCK, HOLDLOCK`; NULL when no such active job title exists, which the application treats as "no veterinarian configured" (only administrators approve animal data) until an administrator sets it through `/api/vetcare/system-settings`.
4. Final verification (51059): column, nullability, trusted non-cascading FK, trusted CHECK, both indexes (the unique one filtered) and the setting row.

`completed_by` is filled by the application on every completion from this release on. There is deliberately no CHECK "`status = COMPLETED` ⇒ `completed_by IS NOT NULL`": visits completed before this migration have no known author, a trusted CHECK would fail on them and a `WITH NOCHECK` one would be untrusted and hide them. Inferring the author (e.g. from the responsible employee) would invent audit data. The rule is enforced by the application only; consider adding the CHECK once no legacy COMPLETED row without author remains.

The entities declare the same names (`@Index` with the filter, `@Check`, `foreignKeyConstraintName`). Metadata-only alignment, no migration: `BreedEntity` names `uq_vc_breeds_species_name`, `uq_vc_breeds_id_species` and `fk_vc_breeds_species`; `SpeciesEntity` names `uq_vc_species_name` (instead of `unique: true`); `AnimalEntity` declares `ix_vc_animals_species`, `ix_vc_animals_breed_species`, `fk_vc_animals_owner` and `fk_vc_animals_species`; `ReservationEntity` names its three FKs; `MeasurementTypeEntity` already matched. `AnimalEntity.breed` is now mapped on `breed_id` only with `createForeignKeyConstraints: false`: the composite join (`breed_id`, `species_id`) shared `species_id` with `species`, so TypeORM 0.3 generated an invalid species join (`ON species.speciesId = ...`). The composite FK `fk_vc_animals_breed_species` remains in the database (as `fk_vc_clinical_visits_reservation_animal`); `measurement.sql.spec.ts` checks the generated SQL and the declared names.

# SQL Server schema: animal tutors

`AnimalOwners1795435200000` follows `IntegrityAndLifecycle1795348800000`. It was not executed against any database during this work. It requires an active transaction (default `--transaction all`); `down` rejects rollback (it would discard the tutorship history and `CLIENT_CHANGED` events; restore a backup). The migration sets `ANSI_NULLS` and `QUOTED_IDENTIFIER` ON and verifies them (51060) before creating the filtered indexes.

Preconditions (exclusive locks on `vc_animals` and `vc_reservation_history` held until commit; THROW codes 51060–51069):

- 51061: `vc_animal_owners`, `ix_vc_animals_owner_id` and no object named like `vc_animal_owners` exist yet (the table is also checked before any SQL).
- 51062: `fk_vc_animals_owner`, `ck_vc_reservation_history_action` and the append-only trigger exist.
- 51063: every `vc_animals.owner_id` references an existing `vc_users` row (soft-deleted accounts included).
- 51064: every `vc_reservation_history.action` belongs to the new list (the current list plus `CLIENT_CHANGED`).

Steps:

1. `vc_animal_owners`: `id` uniqueidentifier (`df_vc_animal_owners_id` NEWSEQUENTIALID(), `pk_vc_animal_owners`), `animal_id` NOT NULL (`fk_vc_animal_owners_animal`), `user_id` NOT NULL (`fk_vc_animal_owners_user`), `is_primary` bit NOT NULL (`df_vc_animal_owners_is_primary` 0), `assigned_at` datetime2(3) NOT NULL, `ended_at` datetime2(3) NULL (UTC instants), `assigned_by`/`ended_by` NULL (`fk_vc_animal_owners_assigned_by`/`_ended_by` -> `vc_users`), `end_reason` nvarchar(30) NULL, `created_at`/`updated_at` (SYSDATETIME()). Foreign keys without cascade. Checks: `ck_vc_animal_owners_dates` (`ended_at IS NULL OR ended_at >= assigned_at`), `ck_vc_animal_owners_ended` (an active row has no `ended_by`/`end_reason`), `ck_vc_animal_owners_end_reason` (BIN2 IN TRANSFERRED, REMOVED, ROLE_CHANGED, ACCOUNT_DELETED, MIGRATED).
2. In a later batch: `uq_vc_animal_owners_active` (`animal_id`, `user_id`) WHERE `ended_at IS NULL`; `uq_vc_animal_owners_primary` (`animal_id`) WHERE `ended_at IS NULL AND is_primary = 1`; `ix_vc_animal_owners_user_active` (`user_id`, `animal_id`) INCLUDE (`is_primary`) WHERE `ended_at IS NULL` (the INCLUDE is not expressible in TypeORM metadata; the entity declares the key and filter); `ix_vc_animal_owners_animal_assigned` (`animal_id`, `assigned_at`); `ix_vc_animal_owners_assigned_by`; `ix_vc_animal_owners_ended_by`; `ix_vc_animals_owner_id` on `vc_animals(owner_id)` (the FK had no index).
3. Copy: one active primary row per animal with `owner_id` (soft-deleted animals included), `assigned_at = CONVERT(datetime2(3), created_at)` of the animal (the process and the server run in UTC), `assigned_by` NULL.
4. Copy verification (51065): number of active primary rows = number of animals with `owner_id`; each such animal has an active primary row equal to `owner_id`; no other active row exists.
5. `ck_vc_reservation_history_action` dropped and recreated `WITH CHECK` with `CLIENT_CHANGED` added (rows validated in 51064; the append-only trigger only blocks row UPDATE/DELETE).
6. Final verification (51069): four trusted non-cascading FKs, three trusted checks, both filtered unique indexes, the other four indexes, `ix_vc_animals_owner_id`, and the trusted history CHECK containing `CLIENT_CHANGED`.

`vc_animals.owner_id` is kept (not dropped) as a synchronized copy of the active primary tutor, written in the same transaction as every tutorship change; access rules read `vc_animal_owners`. Rows are periods that the application only closes (`ended_at`, `ended_by`, `end_reason`) and never deletes or rewrites. `MIGRATED` is reserved for future data migrations and is not written by the application. "At least one primary tutor while there are active tutors" cannot be expressed declaratively and is enforced by the application (animal row lock). The entities declare the same names (`@Index` with filters, `@Check`, `foreignKeyConstraintName`; `AnimalEntity` declares `ix_vc_animals_owner_id`); `animal-owners.sql.spec.ts` checks the metadata and the generated SQL, and `src/database/animal-owners.migration.spec.ts` checks the migration's SQL batches and their order.

# SQL Server schema: reservation authorship

`ReservationAuthorship1795521600000` follows `AnimalOwners1795435200000`. It was not executed against any database during this work. It requires an active transaction (default `--transaction all`); `down` rejects rollback (restore a backup). The migration sets `ANSI_NULLS` and `QUOTED_IDENTIFIER` ON and verifies them (51070) before creating the filtered unique index.

Preconditions (exclusive locks on `vc_reservations` and `vc_reservation_history` held until commit; THROW codes 51070–51079):

- 51071: `vc_reservations.created_by`, `fk_vc_reservations_created_by`, `ix_vc_reservations_created_by` and `uq_vc_reservation_history_created` do not exist yet (the column is also checked with `hasColumn` before any SQL).
- 51072: `fk_vc_reservation_history_changed_by` and the append-only trigger `tr_vc_reservation_history_append_only` exist.
- 51073: no reservation has more than one `CREATED` history event. The history is append-only, so duplicates are not cleaned automatically; review them before migrating.

Steps:

1. `ALTER TABLE vc_reservations ADD created_by uniqueidentifier NULL` (alone in its batch; the column is only referenced by later batches). NULL means system/unknown author.
2. Backfill: `created_by = changed_by` of the reservation's single `CREATED` event (when it has an author). Never derived from `client_id`, because staff may book on behalf of a client. Reservations without a `CREATED` event (or with an unauthored one) stay NULL. No trigger maintains `updated_at`, so the backfill does not change it.
3. Backfill verification (51074): `created_by` equals the `CREATED` author wherever one exists and is NULL otherwise.
4. `fk_vc_reservations_created_by` (`created_by` -> `vc_users.id`, `WITH CHECK`, no cascade), `ix_vc_reservations_created_by` (`created_by`), and `uq_vc_reservation_history_created` on `vc_reservation_history(reservation_id)` WHERE `action = N'CREATED'`.
5. Final verification (51079): nullable column, trusted non-cascading FK, both indexes (the history one unique and filtered).
6. Report: the number of reservations left with `created_by` NULL is logged as a warning through the TypeORM logger (nothing is logged when it is zero).

The application writes `created_by` only on `POST /api/vetcare/reservations` (always the authenticated caller, never read from the body) and never updates it (`update: false` on the entity column). Invariant: `vc_reservations.created_by` = `changed_by` of the reservation's `CREATED` event; the history snapshot does not duplicate it. The entities declare the same names (`foreignKeyConstraintName`, `@Index`, including the filtered unique index on `ReservationHistoryEntity`); `src/app/reservation/reservation.sql.spec.ts` checks the metadata and the generated INSERT/UPDATE/SELECT SQL, and `src/database/reservation-authorship.migration.spec.ts` checks the migration's SQL batches and their order.
