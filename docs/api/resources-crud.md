---
titulo: Resource CRUD
descricao: Pagination, PATCH semantics, catalog CRUD, DTO documentation and animal compatibility.
cobre: [src/app/users/**, src/app/animal/**, src/app/species/**, src/app/breeds/**, src/app/core/dto/**]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

# Resource CRUD

## Resource CRUD

All base collections accept skip (default 0) and take (default 50, maximum 100). Collection DTOs define additional filters; unknown parameters are rejected by the existing global ValidationPipe. Specialized collection routes remain available for their distinct queries and may retain their unpaginated behavior.

| Resource | Collection routes | Single-record routes |
| --- | --- | --- |
| Users | GET/POST /api/vetcare/users | GET/PATCH/DELETE /api/vetcare/users/:id |
| Animals | GET/POST /api/vetcare/animal | GET/PATCH/DELETE /api/vetcare/animal/:id |
| Species | GET/POST /api/vetcare/species | GET/PATCH/DELETE /api/vetcare/species/:id |
| Breeds | GET/POST /api/vetcare/breeds | GET/PATCH/DELETE /api/vetcare/breeds/:id |
| Reservations | GET/POST /api/vetcare/reservations | GET /api/vetcare/reservations/:id (operations: see Reservations and clinical visits) |
| Blocked times | GET/POST /api/vetcare/blocked-times | GET/PATCH/DELETE /api/vetcare/blocked-times/:id |

PATCH applies the provided update fields; omitted values are retained. Animals, users, employees, roles, job titles, species, breeds, measurement types, system settings and blocked times expose one PATCH update handler each, without PUT aliases. Whole-list role replacement and explicit action routes retain their existing HTTP verbs. Animal creation uses POST /api/vetcare/animal and administrator-created clients use POST /api/vetcare/users/clients; deprecated route aliases are not registered. See [routes.md](routes.md) for the complete inventory.

Species and breeds are separate resources/modules/services. A breed's parent species cannot be changed through its update DTO. Deleting a referenced catalog entry returns 409; it never cascades through animal data.

New users collection endpoints and blocked-time CRUD require administrator access. User detail/update remains owner-or-administrator. Animal reads are open to staff and to every active tutor; updates to staff and the primary tutor (see "Animal tutors"); employees and administrators retain the existing broader access. Animal deletion remains administrative and returns 409 while the animal has open reservations or a visit in progress (see "Integrity and lifecycle"). Catalog reads require authentication; catalog writes require administrator access. Reservation access is described in Reservations and clinical visits.

DELETE users and animals performs soft deletion (both refused with 409 while open reservations exist, see "Integrity and lifecycle"). Reservations and clinical visits have no DELETE route; reservations are cancelled through POST /api/vetcare/reservations/:id/cancel. DELETE blocked times removes that block. No delete endpoint removes a related owner/animal/catalog implicitly.

## DTO documentation and animal compatibility

Every Create*Dto contains English class documentation and field descriptions exposed through Swagger decorators. DTOs validate request data; business validation verifies referenced owners, catalog membership, access and status changes.

AnimalEntity documents identity, taxonomy, physical attributes and audit timestamps; measurements live in their own entity. AnimalService is the application facade; AnimalBusinessService uses explicit helpers such as requireClientOwner, mapWritableAttributes and resolveAnimalTaxonomy.

Animal request fields include ownerId, speciesId, optional breedId, name, color, sex, optional birthDate, description, notes, imageUrl, microchipNumber and isNeutered. birthDate is YYYY-MM-DD and cannot be in the future; null represents unknown. Verification state is set by server rules; species/breed changes and approval are described in "Integrity and lifecycle".

Catalog lookup aliases type and breed, plus gender and image aliases remain accepted. Labels must identify catalog entries already present; client requests do not silently create taxonomy. Age is calculated only from a known birthDate; otherwise the response is null. Response breed remains a string, while breedDetails exposes the relation. Soft-deleted animals are hidden from normal animal collections but can be recovered when reading reservation history.

Authentication, email delivery, reset-token expiry and time utilities are supporting services or actions. They do not receive artificial CRUD endpoints or BusinessServices solely to imitate resource controllers.

## Verification

Build and focused business/persistence/metadata tests run without connecting to SQL Server. They do not execute migrations. Existing unrelated deletions in the workspace are left untouched.
