---
titulo: Measurement types and observations
descricao: Configurable measurement types and animal measurement rules.
cobre: [src/app/animal-measurements/**, src/app/measurement-types/**]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

# Measurement types and observations

## Measurement types and observations

`/api/vetcare/measurement-types` supports paginated GET, GET /:id, POST, PATCH /:id and DELETE /:id. Reads require authentication; mutations require ADMIN. Types have code, name, unit, isActive (default true), description (240) and notes (500). Codes are trimmed and normalized to uppercase, with letters, digits and underscores (first character a letter); custom codes are supported independently of the built-in enum. Code uniqueness is enforced by SQL Server; duplicates return 409. Code and unit are immutable after creation: create a new type to represent a different unit or meaning. Name, activation and metadata remain editable. Referenced types cannot be deleted (409); deactivate them instead.

The seeded measurement categories are WEIGHT (weight, kg), HEIGHT (height, cm), TEMPERATURE (temperature, degrees Celsius), HEART_RATE (heart rate, bpm) and RESPIRATORY_RATE (respiratory rate, rpm). These are English descriptions; historical persisted display names are not renamed by this change.

`/api/vetcare/animal-measurements` supports GET (optional animalId, measurementTypeId, clinicalVisitId, skip, take), GET /:id, POST, PATCH /:id and DELETE /:id (JSON body `{ "reason": "..." }` required). Every operation requires JWT authentication. Reads (`@Roles` ADMIN, EMPLOYEE, CLIENT): clients see only their animals; staff and administrators use the existing animal access policy. POST and PATCH require ADMIN or an active EMPLOYEE (`@Roles` plus `requireStaff` in the business service); clients get 403. DELETE requires ADMIN (employees and clients get 403). Observations of soft-deleted animals remain stored but unavailable through this API.

DELETE is an audited soft-delete: the body `{ "reason": "<non-blank, max 500>" }` is mandatory (400 otherwise); the row keeps `deletedAt` (UTC), `deletedBy` and `deleteReason` and disappears from GET, lists and latest values (404 afterwards). Measurements of a clinical visit are never deleted (409). PATCH and DELETE re-read the row with `pessimistic_write` (UPDLOCK) inside a transaction, so concurrent edits do not lose updates.

Every response carries `clinicalVisitStatus` (IN_PROGRESS, COMPLETED, VOIDED, or null without a visit) next to `clinicalVisitId`; the visit itself is never serialized. Measurements of VOIDED visits stay listed (with that indicator) but never count as latest values.

POST accepts animalId, measurementTypeId, numeric value, optional name, measuredAt, description and notes. One row represents one type and value. Values must be finite with at most six decimal places and magnitude at most 999999999.999999; the API deliberately uses a conservative JavaScript numeric range within decimal(18,6). Stored values are returned as decimal strings to preserve precision. Negative temperatures and custom values are supported; WEIGHT, HEIGHT, HEART_RATE and RESPIRATORY_RATE must be nonnegative. The API rejects extra precision instead of rounding. The database preserves the full former weight precision, including historical values beyond the new-write API range.

Omitted measuredAt defaults to now. Explicit null, future times and timestamps without timezone are rejected. measuredAt is stored as a UTC instant. The authenticated caller supplies recordedBy (mandatory, NOT NULL); HTTP input cannot supply the author. PATCH accepts only value, measuredAt, name, description and notes: animalId, measurementTypeId, clinicalVisitId and recordedBy are rejected with 400 (`forbidNonWhitelisted`). PATCH never rewrites recordedBy; it records the editor in `updatedBy`. Omitted fields retain their values, including unknown legacy time. Creating an observation requires an active type; the type is immutable, so value corrections of observations of inactive types remain possible (validated against that type's sign rules). Explicit null value is rejected.

Animal create/update no longer accepts weight, height or legacy age. Supply an actual birthDate for age calculation. Species type and breed aliases still resolve catalog entries. Animal responses expose weight and height independently for compatibility, plus latestMeasurements containing the latest row for every type, including inactive types. Known timestamps precede unknown-time imports; ties use measuredAt, createdAt and id descending. Future stored rows (compared with `SYSUTCDATETIME()`), soft-deleted rows and measurements of VOIDED clinical visits are excluded. Collections use ranked SQL batches of at most 1000 animals, avoiding per-animal reads and SQL Server parameter limits.

For example, POST `{ "animalId": "<uuid>", "measurementTypeId": "<WEIGHT uuid>", "value": 12.125 }`, then a separate HEIGHT row with value 35.5 yields compatibility weight 12.125 and height 35.5. Multiple observations and custom signs require no schema changes. Both resources retain separate application facade, business rules, messages and centralized persistence error handling.
