# API organization and resource usage

Resource code is organized into users, employees, roles, job-titles, system-settings, animal, species, breeds, reservation, reservation-history, blocked-times and clinical-visits: one folder per table, with the resource-service layout (entities/, dto/, enums/, *.messages.ts, business service, service, controller and module when there are endpoints).

- `src/app/reservation/`: `vc_reservations` only (entity, DTOs, policy, serializer, controllers, services, module, `employee-schedule-lock.ts`); `GET /api/clinic/hours` stays here because it exposes the reservation policy.
- `src/app/reservation-history/`: `vc_reservation_history` (entity, action enum, `ReservationHistoryService`, module without controller). `GET /api/reservations/:id/history` remains in the reservations controller and uses the exported service.
- `src/app/blocked-times/`: `vc_blocked_times` (entity, DTOs, messages, services, controller, module; `/api/blocked-times` routes unchanged). The reservation module reads the entity for the block check.

Each resource has a controller, an application service, a BusinessService, request DTOs and a dedicated messages file. Controllers handle routing and authentication/role guards. Application services expose resource operations and delegate each call. BusinessServices own access checks, validation, repository work and orchestration. This avoids generic base-service inheritance and keeps resource-specific rules visible.

Animal relation names live in AnimalRelation; reservation relation names live in ReservationRelation. These enums refer to TypeScript relation attributes, not SQL names. SQL mappings continue to use the already-migrated snake_case schema. No database migration is required by this reorganization.

## Persistence errors

PersistenceService.execute wraps repository work. It recognizes SQL Server error numbers centrally: duplicate unique values become HTTP 409, reference conflicts become 409, invalid persisted values become 400, and unclassified QueryFailedError failures become a safe HTTP 500 without SQL or driver details. The global PersistenceExceptionFilter applies the same translator to queries not wrapped explicitly, including legacy reads. Existing HTTP business exceptions retain their original status. Resource services contain no SQL Server error-number handling.

Messages emitted by business rules are stored in the corresponding resource messages file. Enum names represent business concepts rather than copies of entire sentences.

## Resource CRUD

All base collections accept skip (default 0) and take (default 50, maximum 100). Collection DTOs define additional filters; unknown parameters are rejected by the existing global ValidationPipe. Existing specialized collection routes remain available for compatibility and may retain their previous unpaginated behavior.

| Resource | Collection routes | Single-record routes |
| --- | --- | --- |
| Users | GET/POST /api/users | GET/PUT/DELETE /api/users/:id |
| Animals | GET/POST /api/animal | GET/PUT/DELETE /api/animal/:id |
| Species | GET/POST /api/species | GET/PUT/DELETE /api/species/:id |
| Breeds | GET/POST /api/breeds | GET/PUT/DELETE /api/breeds/:id |
| Reservations | GET/POST /api/reservations | GET /api/reservations/:id (operations: see Reservations and clinical visits) |
| Blocked times | GET/POST /api/blocked-times | GET/PUT/DELETE /api/blocked-times/:id |

PUT applies the provided update fields using the established update DTOs; omitted values are retained. Existing PATCH and action routes remain available. No unsupported replacement semantics are implied.

Species and breeds are separate resources/modules/services. A breed's parent species cannot be changed through its update DTO. Deleting a referenced catalog entry returns 409; it never cascades through animal data.

New users collection endpoints and blocked-time CRUD require administrator access. User detail/update remains owner-or-administrator. Animal reads/updates enforce owner access for clients; employees and administrators retain the existing broader access. Animal deletion remains administrative. Catalog reads require authentication; catalog writes require administrator access. Reservation access is described in Reservations and clinical visits.

DELETE users and animals performs soft deletion. Reservations and clinical visits have no DELETE route; reservations are cancelled through POST /api/reservations/:id/cancel. DELETE blocked times removes that block. No delete endpoint removes a related owner/animal/catalog implicitly.

## DTO documentation and animal compatibility

Every Create*Dto contains English class documentation and field descriptions exposed through Swagger decorators. DTOs validate request data; business validation verifies referenced owners, catalog membership, access and status changes.

AnimalEntity documents identity, taxonomy, physical attributes and audit timestamps; measurements live in their own entity. AnimalService is the application facade; AnimalBusinessService uses explicit helpers such as requireClientOwner, mapWritableAttributes and resolveAnimalTaxonomy.

Animal request fields include ownerId, speciesId, optional breedId, name, color, sex, optional birthDate, description, notes, imageUrl, microchipNumber and isNeutered. birthDate is YYYY-MM-DD and cannot be in the future; null represents unknown. Verification state is set by server rules.

Catalog lookup aliases type and breed, plus gender and image aliases remain accepted. Labels must identify catalog entries already present; client requests do not silently create taxonomy. Age is calculated only from a known birthDate; otherwise the response is null. Response breed remains a string, while breedDetails exposes the relation. Soft-deleted animals are hidden from normal animal collections but can be recovered when reading reservation history.

Authentication, email delivery, reset-token expiry and time utilities are supporting services or actions. They do not receive artificial CRUD endpoints or BusinessServices solely to imitate resource controllers.

## Verification

Build and focused business/persistence/metadata tests run without connecting to SQL Server. They do not execute migrations. Existing unrelated deletions in the workspace are left untouched.

## Measurement types and observations

`/api/measurement-types` supports paginated GET, GET /:id, POST, PUT/PATCH /:id and DELETE /:id. Reads require authentication; mutations require ADMIN. Types have code, name, unit, isActive (default true), description (240) and notes (500). Codes are trimmed and normalized to uppercase, with letters, digits and underscores (first character a letter); custom codes are supported independently of the built-in enum. Code uniqueness is enforced by SQL Server; duplicates return 409. Code and unit are immutable after creation: create a new type to represent a different unit or meaning. Name, activation and metadata remain editable. Referenced types cannot be deleted (409); deactivate them instead.

The seeded types are WEIGHT (Peso, kg), HEIGHT (Altura, cm), TEMPERATURE (Temperatura, ?C), HEART_RATE (Frequ?ncia card?aca, bpm) and RESPIRATORY_RATE (Frequ?ncia respirat?ria, rpm).

`/api/animal-measurements` supports GET (optional animalId, measurementTypeId, clinicalVisitId, skip, take), GET /:id, POST, PATCH /:id and DELETE /:id (JSON body `{ "reason": "..." }` required). Every operation requires JWT authentication. Reads (`@Roles` ADMIN, EMPLOYEE, CLIENT): clients see only their animals; staff and administrators use the existing animal access policy. POST and PATCH require ADMIN or an active EMPLOYEE (`@Roles` plus `requireStaff` in the business service); clients get 403. DELETE requires ADMIN (employees and clients get 403). Observations of soft-deleted animals remain stored but unavailable through this API.

DELETE is an audited soft-delete: the body `{ "reason": "<non-blank, max 500>" }` is mandatory (400 otherwise); the row keeps `deletedAt` (UTC), `deletedBy` and `deleteReason` and disappears from GET, lists and latest values (404 afterwards). Measurements of a clinical visit are never deleted (409). PATCH and DELETE re-read the row with `pessimistic_write` (UPDLOCK) inside a transaction, so concurrent edits do not lose updates.

Every response carries `clinicalVisitStatus` (IN_PROGRESS, COMPLETED, VOIDED, or null without a visit) next to `clinicalVisitId`; the visit itself is never serialized. Measurements of VOIDED visits stay listed (with that indicator) but never count as latest values.

POST accepts animalId, measurementTypeId, numeric value, optional name, measuredAt, description and notes. One row represents one type and value. Values must be finite with at most six decimal places and magnitude at most 999999999.999999; the API deliberately uses a conservative JavaScript numeric range within decimal(18,6). Stored values are returned as decimal strings to preserve precision. Negative temperatures and custom values are supported; WEIGHT, HEIGHT, HEART_RATE and RESPIRATORY_RATE must be nonnegative. The API rejects extra precision instead of rounding. The database preserves the full former weight precision, including historical values beyond the new-write API range.

Omitted measuredAt defaults to now. Explicit null, future times and timestamps without timezone are rejected. measuredAt is stored as a UTC instant. The authenticated caller supplies recordedBy (mandatory, NOT NULL); HTTP input cannot supply the author. PATCH accepts only value, measuredAt, name, description and notes: animalId, measurementTypeId, clinicalVisitId and recordedBy are rejected with 400 (`forbidNonWhitelisted`). PATCH never rewrites recordedBy; it records the editor in `updatedBy`. Omitted fields retain their values, including unknown legacy time. Creating an observation requires an active type; the type is immutable, so value corrections of observations of inactive types remain possible (validated against that type's sign rules). Explicit null value is rejected.

Animal create/update no longer accepts weight, height or legacy age. Supply an actual birthDate for age calculation. Species type and breed aliases still resolve catalog entries. Animal responses expose weight and height independently for compatibility, plus latestMeasurements containing the latest row for every type, including inactive types. Known timestamps precede unknown-time imports; ties use measuredAt, createdAt and id descending. Future stored rows (compared with `SYSUTCDATETIME()`), soft-deleted rows and measurements of VOIDED clinical visits are excluded. Collections use ranked SQL batches of at most 1000 animals, avoiding per-animal reads and SQL Server parameter limits.

For example, POST `{ "animalId": "<uuid>", "measurementTypeId": "<WEIGHT uuid>", "value": 12.125 }`, then a separate HEIGHT row with value 35.5 yields compatibility weight 12.125 and height 35.5. Multiple observations and custom signs require no schema changes. Both resources retain separate application facade, business rules, messages and centralized persistence error handling.

## Roles through system settings

Roles are data. Code never references role ids or role codes; it references only `vc_system_settings` keys (`SystemSettingCode`). `SystemRole.ADMIN`, `SystemRole.EMPLOYEE` and `SystemRole.CLIENT` map to `ADMIN_ROLE_ID`, `EMPLOYEE_ROLE_ID` and `CLIENT_ROLE_ID`. `@Roles(...)` receives these keys; `RolesGuard` resolves them through the global `SystemSettingsService` and allows the request when the caller holds ANY resolved role id. A missing or malformed role setting fails closed (500). Settings are cached in memory for 60 seconds per application instance; the instance that serves an update invalidates its own cache after the update transaction ends, while other instances (or direct SQL edits) see the change only after their cache expires, i.e. up to 60 seconds later.

JWT validation loads the user's active roles (`vc_user_roles` joined to active `vc_roles`) and the employee profile (id and termination date). `request.user`/`Actor` contains `id`, `email`, `name`, `roleIds` (lowercase), `isAdmin`, `isEmployee`, `isClient` and `employeeId` (or null). `isEmployee` requires the role of `EMPLOYEE_ROLE_ID` AND an active employee profile (termination NULL or after today); when the role is held without an active profile, the EMPLOYEE role id is also removed from `roleIds`, so `@Roles(EMPLOYEE)` denies access as soon as a termination date passes, even without any save. The JWT payload is unchanged (`sub`, `email`, `name`). Staff means administrator or employee role. Ids are compared case-insensitively because SQL Server returns uniqueidentifier in uppercase.

`GET /api/auth/me` returns account data without the password hash, `roles` [{id, code, name}] and `employee` (or null) with `jobTitles` [{id, code, name}]. `role`, `function` and `workLoad` no longer exist in requests or responses.

## Accounts, employees and catalogs

| Resource | Routes | Access |
| --- | --- | --- |
| Roles | GET/POST /api/roles, GET/PUT/PATCH/DELETE /api/roles/:id | ADMIN (callers read their own roles through GET /api/auth/me) |
| Job titles | GET/POST /api/job-titles, GET/PUT/PATCH/DELETE /api/job-titles/:id | read: authenticated; write: ADMIN |
| System settings | GET /api/system-settings, GET/PUT/PATCH /api/system-settings/:id | ADMIN |
| Employees | GET/POST /api/employees (GET filter `isAvailableForBookings=true` also requires termination NULL or after today), GET /api/employees/me, GET /api/employees/available/:date, GET/PUT/PATCH/DELETE /api/employees/:id | ADMIN; GET /me and GET /:id also for the employee itself |
| User roles | GET /api/users/:id/roles (owner or ADMIN), PUT /api/users/:id/roles (ADMIN) | |

Role and job-title codes are normalized to uppercase and immutable (409). Referenced entries cannot be deleted (409): deactivate them instead. A role referenced by a `*_ROLE_ID` setting can be neither deleted nor deactivated. Setting codes are immutable and settings are neither created nor deleted through the API; `*_ROLE_ID` values must be the UUID of an existing, active role (400), must differ from the value of every other `*_ROLE_ID` setting (409), and `ADMIN_ROLE_ID` must reference a role held by at least one active user (409). Validation and save run in one transaction that first locks (UPDLOCK) every `*_ROLE_ID` row and the previous and new role rows, so it serializes with concurrent setting updates and with the last-administrator check.

`PUT /api/users/:id/roles` with `{ roleIds: [] }` replaces the whole list in one transaction. New assignments require active roles; existing assignments of since-deactivated roles may be kept. Kept assignments are not rewritten. The last active administrator cannot lose the administrator role, be deactivated or be deleted (409); the administrator role row is locked to serialize concurrent changes.

`POST /api/employees` accepts exactly one of `userId` (existing account) or `user` (new account: name, email, optional phone, birthDate, nif), plus employeeNumber, licenseNumber, hireDate, terminationDate, isAvailableForBookings, jobTitleIds, description and notes. Account, role from `EMPLOYEE_ROLE_ID` (only when the created profile is active; a profile created already terminated gets no role, and a new account is then created without roles), profile, job titles and reset token are written in one transaction; the existing employee welcome email is sent after commit when an account was created. `jobTitleIds` on update replaces the assignments. DELETE removes the profile, its job titles and the EMPLOYEE role, keeping the account, its other roles and reservation history. These routes replace `POST /api/users/employees`, `PATCH /api/users/employee/:id`, `GET /api/users/available/:date` and `GET /api/auth/employees`, which were removed.

Users keep only account data. Public registration (`POST /api/users`) and `POST /api/users/create-clients` assign the role from `CLIENT_ROLE_ID` in the same transaction. Emails are trimmed and lowercased, `nif` is a nine-digit string and `birthDate` is YYYY-MM-DD (not in the future). Changing `email` or `isActive` is reserved to administrators. Duplicate email or NIF among non-deleted users returns 409; email and NIF are unique only among non-deleted accounts, so they can be reused after a soft delete. Soft-deleting a user also deletes its reset tokens, and returns 409 while the user has an active employee profile (terminate or delete the profile through `/api/employees` first).

Animal owners must hold the client role; staff see all animals and staff-created animals are verified. A reservation's assigned employee is an employee profile (`vc_employees.id`) that is available for bookings, belongs to an active account and has no termination date or one after today and after the reservation date, regardless of roles. Reservations are never self-assigned nor auto-confirmed. Password hashes are never selected or serialized.

Related accounts are projected per caller. In reservation responses, non-administrators see `employee` as `{ id, name, profilePictureUrl }` and `client` as `{ id, name, email, phone }`, and the nested `animal` has no `owner` (it is the client); administrators see full accounts (`id`, `name`, `email`, `phone`, `birthDate`, `nif`, `profilePictureUrl`, `isActive`, `description`, `notes`, timestamps) for client, employee and animal owner. Animal responses expose `owner` as `{ id, name, email, phone }` to non-administrators and as the full account to administrators. Measurement responses carry only `recordedBy` (an id), never the account.

## Integrity rules for roles and employees

- An employee profile is active while `termination_date` is NULL or after today (clinic date). An active profile always carries the role of `EMPLOYEE_ROLE_ID`: creating an active profile, or reactivating it (clearing or postponing the termination), grants the role in the same transaction; an update that leaves the profile terminated removes the role in the same transaction (logged after commit with actor, user and timestamp). A termination date that passes without a save is covered by JWT validation (see `isEmployee`). `PUT /api/employees/:id` and the profile check of `PUT /api/users/:id/roles` lock the `vc_employees` row (UPDLOCK), so they serialize without relying on blocking reads (READ_COMMITTED_SNAPSHOT). `PUT /api/users/:id/roles` returns 409 when it would remove EMPLOYEE from a user with an active profile, and also 409 when it would grant EMPLOYEE to a user without an active profile (the role is never granted for an account alone). Updating `EMPLOYEE_ROLE_ID` returns 409 unless every active employee already holds the new role. `DELETE /api/employees/:id` removes the profile, its job titles and the EMPLOYEE role in one transaction.
- When the termination date is today or earlier, `isAvailableForBookings` is forced to false on save; explicitly requesting true for a terminated employee returns 400. Reservation assignment still checks bookability. `users.is_active` (may authenticate) and `employees.is_available_for_bookings` (may be chosen for new bookings) stay independent otherwise. A termination date that passes later does not rewrite the stored flag; the booking check covers it.
- Role assignments record `assigned_by`: the authenticated actor for `PUT /api/users/:id/roles`, employee creation/reactivation and `POST /api/users/create-clients`; NULL for public registration and the seed. Replacing roles deletes only removed assignments and inserts only new ones, so kept rows retain their original `assigned_by` and `created_at`. Every assignment and removal of the `ADMIN_ROLE_ID` role is logged through the Nest Logger (actor, target and timestamp) after commit. Role management (roles catalog, user roles and system settings) is restricted to ADMIN; account-creation paths can only assign EMPLOYEE or CLIENT.
- An account may be client and employee at once (e.g. a veterinarian with her own pet): neither `PUT /api/users/:id/roles` nor `POST /api/employees` (existing user) makes the roles exclusive, and granting EMPLOYEE never removes CLIENT. Animal owners and reservation clients only need CLIENT, and `/api/auth/me` returns every active role plus the employee profile. Access to other clients' data comes only from the professional path (administrator, or EMPLOYEE with an active profile); otherwise CLIENT limits the caller to their own data and adds nothing for staff. When staff act on their own account as clients they follow the client path: a reservation for their own animal (no `ownerId` or `ownerId` = self, CLIENT required) is not self-assigned and stays `PENDING`, and an animal they register for themselves is not auto-verified (administrators excepted). Responses are projected by `isAdmin` only, so such an account sees reduced related accounts.
- SQL Server error 547 is split by the driver message: CHECK constraint violations return 400 ("A value does not satisfy the rules required for this record"); FOREIGN KEY/REFERENCE violations keep returning 409.
- Local login rejects inactive and soft-deleted accounts, and JWT validation reloads the account on every request, so a token issued before deactivation or deletion stops working immediately.

## Reservations and clinical visits

Instants (`startAt`, `endAt`, `confirmedAt`, `cancelledAt`, `startedAt`, `endedAt`, `voidedAt`) are ISO-8601 with an explicit offset or `Z`; values without an offset are rejected (400). They are stored in UTC and returned as UTC ISO strings. `createdAt`/`updatedAt` keep the local-time convention. Business hours (Mon-Fri 07:00-20:00, one clinic day) are evaluated in Europe/Lisbon.

| Route | Access | Rule |
| --- | --- | --- |
| GET /api/reservations | authenticated roles | filters status, clientId, employeeId, animalId, from, to (startAt), skip/take; scoped: ADMIN all, active employee assigned to them, client own |
| GET /api/reservations/:id, GET /api/reservations/:id/history | same scope (403 otherwise) | history is chronological; non-admins see `changedBy` only when it is themselves (`changedBySelf`) |
| POST /api/reservations | ADMIN, EMPLOYEE, CLIENT | always PENDING; `employeeId` (pre-assignment, CREATED + EMPLOYEE_ASSIGNED) only for ADMIN (403 otherwise), like PATCH /employee |
| PATCH /api/reservations/:id/employee | ADMIN | PENDING only; bookable employee; EMPLOYEE_ASSIGNED or EMPLOYEE_CHANGED; never confirms |
| POST /api/reservations/:id/confirm | ADMIN | PENDING with employee, future, not blocked, no overlap; sets confirmedAt |
| POST /api/reservations/:id/reschedule | ADMIN | PENDING/CONFIRMED without an IN_PROGRESS/COMPLETED visit; CONFIRMED returns to PENDING (confirmedAt cleared); RESCHEDULED with old/new |
| POST /api/reservations/:id/cancel | ADMIN or the reservation's client | PENDING/CONFIRMED without an IN_PROGRESS/COMPLETED visit; the client only before startAt (409 `CANCEL_AFTER_START`), ADMIN at any time; sets cancelledAt |
| POST /api/reservations/:id/no-show | ADMIN | CONFIRMED, without an IN_PROGRESS/COMPLETED visit, after startAt + `RESERVATION_NO_SHOW_TOLERANCE_MINUTES` |
| GET /api/clinical-visits, GET /api/clinical-visits/:id | authenticated roles | clinical access below |
| POST /api/clinical-visits | ADMIN, EMPLOYEE | from a CONFIRMED reservation without any visit (VOIDED included; same animal), started only by the employee assigned to the reservation or ADMIN; or without reservation (animalId). Responsible = caller (reservation's employee by default), or any active employee chosen by ADMIN |
| PATCH /api/clinical-visits/:id | ADMIN or responsible | IN_PROGRESS only (clinicalNotes, description) |
| POST /api/clinical-visits/:id/complete | ADMIN or responsible | IN_PROGRESS -> COMPLETED (endedAt); its reservation CONFIRMED -> COMPLETED + COMPLETED event |
| POST /api/clinical-visits/:id/void | ADMIN | IN_PROGRESS -> VOIDED with mandatory reason (voidedAt, voidedBy) |

States: PENDING -> CONFIRMED | CANCELLED; CONFIRMED -> COMPLETED | CANCELLED | NO_SHOW (409 otherwise). COMPLETED is reachable only through visit completion. Every change and its history event share one transaction; the reservation row is read with UPDLOCK. Confirmation, assignment, reschedule and creation with an employee take `sp_getapplock` on `vc_reservations:employee:<employeeId>` (Exclusive, Transaction owner, 5 s) before the overlap check: timeout/deadlock return 409, other failures 503. Overlap counts only CONFIRMED reservations of the employee, widened by `RESERVATION_BUFFER_MINUTES`; global blocked times are checked on creation, confirmation and reschedule. Notifications are sent after commit (`notificationStatus`); user values in email HTML are escaped. Cancel, no-show and visit completion only free time and therefore run without the applock (safe: they can never create an overlap). Rescheduling a PENDING reservation whose employee is no longer bookable fails (400): reassign the employee first (PATCH /employee). A VOIDED visit does not block reschedule/cancel/no-show, but the reservation cannot get a new visit (unique index). SQL deadlock victims (1205) return 409.

Clinical access (no RBAC): ADMIN sees everything; an employee with an active profile sees visits they are responsible for and visits of animals with a reservation assigned to them in CONFIRMED, COMPLETED or NO_SHOW (a PENDING assignment grants nothing); the animal's owner sees its visits without `clinicalNotes`/`voidReason`. `voidedBy` is shown only to ADMIN. Employees in responses are `{ id (vc_employees.id), name, profilePictureUrl }` (ADMIN also `userId` and the account).

`/api/animal-measurements` (writes restricted to staff, see "Measurement types and observations") accepts an optional immutable `clinicalVisitId` (also a list filter). Linking requires an IN_PROGRESS visit of the same animal and clinical access; the save runs under the visit lock. Measurements of a visit can be edited only while it is IN_PROGRESS and are never deleted (409).

`RESERVATION_NO_SHOW_TOLERANCE_MINUTES` and `RESERVATION_BUFFER_MINUTES` accept only integers 0..2147483647 through `/api/system-settings` (400 otherwise); an invalid stored value fails closed (500). The former routes `/api/reservation/*` (create, update-status, all, client, employee, confirm-pending, confirm-rescheduled, reject-rescheduled, :employeeId/:date, PUT/DELETE :id) were removed.
