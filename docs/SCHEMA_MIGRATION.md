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
