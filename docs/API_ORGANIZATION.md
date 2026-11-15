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

## Animal measurements

`/api/animal-measurements` supports `GET` (optional `animalId`, `skip`, `take`), `GET /:id`, `POST`, `PATCH /:id` and `DELETE /:id`. Every operation requires JWT authentication. Clients access only their animals; staff and administrators use the existing animal access policy. Measurements of soft-deleted animals remain stored but are unavailable through this active-animal API.

POST accepts `animalId`, optional `name`, `weight` (kg, decimal(13,3)), `height` (cm, decimal(6,2)), `measuredAt`, `description` (240), and `notes` (500). At least one non-null dimension is required; zero is valid. Omitted measuredAt defaults to the current time. Explicit null, future times, and timestamps without timezone are rejected. The server derives `userId` from authentication; neither author nor animal can be changed through PATCH. PATCH preserves every omitted field, permits clearing one dimension when the other remains, and rejects a resulting observation with neither dimension. Author identifies the original recorder, not the last editor.

Animal create/update no longer accepts `weight`, `height` or legacy `age`. Record measurements through the new resource; supply an actual known `birthDate` for age calculation. Removed legacy age is never converted to an invented birth date. Species `type` and `breed` input aliases still resolve catalog entries, without legacy columns. Animal responses retain derived `weight` and `height` for compatibility: each is selected independently from its latest non-null observation. Known observation timestamps take precedence over unknown-time imported observations; ties use measuredAt, createdAt, then id descending. Future stored observations are excluded from derived current values. Historical unknown measuredAt values remain null and fall back to createdAt/id only when there is no dated observation for that dimension. Collection serialization caps concurrency at five animals, including unpaginated compatibility routes.

For example, POST `{ "animalId": "<uuid>", "weight": 12.125 }`, followed by POST `{ "animalId": "<uuid>", "height": 35.5 }` produces animal response weight 12.125 and height 35.5. Metadata defaults to null rather than manufactured labels. Animal measurements are managed through a facade Service and a dedicated BusinessService, with resource messages and shared persistence error translation.
