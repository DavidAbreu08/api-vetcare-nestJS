# API organization and resource usage

Resource code is organized into users, animal, species, breeds and reservation. Blocked times remain beside reservation because they share scheduling rules.

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
| Reservations | GET/POST /api/reservation | GET/PUT/DELETE /api/reservation/:id |
| Blocked times | GET/POST /api/blocked-times | GET/PUT/DELETE /api/blocked-times/:id |

PUT applies the provided update fields using the established update DTOs; omitted values are retained. Existing PATCH and action routes remain available. No unsupported replacement semantics are implied.

Species and breeds are separate resources/modules/services. A breed's parent species cannot be changed through its update DTO. Deleting a referenced catalog entry returns 409; it never cascades through animal data.

New users/reservation collection endpoints and blocked-time CRUD require administrator access. User detail/update remains owner-or-administrator. Animal reads/updates enforce owner access for clients; employees and administrators retain the existing broader access. Animal deletion remains administrative. Catalog reads require authentication; catalog writes require administrator access. Reservation detail is restricted to the client or administrator; administrative reservation mutations continue to follow scheduling and status-transition rules.

DELETE users and animals performs soft deletion. DELETE reservations cancels the reservation through the existing state-transition rules instead of removing historical data; terminal completed reservations cannot be cancelled. DELETE blocked times removes that block. No delete endpoint removes a related owner/animal/catalog implicitly.

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

`/api/animal-measurements` supports GET (optional animalId, measurementTypeId, skip, take), GET /:id, POST, PATCH /:id and DELETE /:id. Every operation requires JWT authentication. Clients access only their animals; staff and administrators use the existing animal access policy. Observations of soft-deleted animals remain stored but unavailable through this API.

POST accepts animalId, measurementTypeId, numeric value, optional name, measuredAt, description and notes. One row represents one type and value. Values must be finite with at most six decimal places and magnitude at most 999999999.999999; the API deliberately uses a conservative JavaScript numeric range within decimal(18,6). Stored values are returned as decimal strings to preserve precision. Negative temperatures and custom values are supported; WEIGHT, HEIGHT, HEART_RATE and RESPIRATORY_RATE must be nonnegative. The API rejects extra precision instead of rounding. The database preserves the full former weight precision, including historical values beyond the new-write API range.

Omitted measuredAt defaults to now. Explicit null, future times and timestamps without timezone are rejected. The authenticated caller supplies recordedBy; HTTP input cannot supply the author. PATCH cannot change the animal or original recorder. Omitted fields retain their values, including unknown legacy author/time. Creating an observation or changing its type/value requires an active type. Metadata edits and reads of inactive historical observations remain available. Explicit null type/value is rejected.

Animal create/update no longer accepts weight, height or legacy age. Supply an actual birthDate for age calculation. Species type and breed aliases still resolve catalog entries. Animal responses expose weight and height independently for compatibility, plus latestMeasurements containing the latest row for every type, including inactive types. Known timestamps precede unknown-time imports; ties use measuredAt, createdAt and id descending. Future stored rows are excluded. Collections use ranked SQL batches of at most 1000 animals, avoiding per-animal reads and SQL Server parameter limits.

For example, POST `{ "animalId": "<uuid>", "measurementTypeId": "<WEIGHT uuid>", "value": 12.125 }`, then a separate HEIGHT row with value 35.5 yields compatibility weight 12.125 and height 35.5. Multiple observations and custom signs require no schema changes. Both resources retain separate application facade, business rules, messages and centralized persistence error handling.
