# API routes

Inventory of the current HTTP controllers (100 operations). Paths below are the real registered routes; Swagger must describe these paths rather than infer singular/plural names.

All operations use the global `/api/vetcare` prefix from `src/api-routing.ts`. Controllers declare only their resource path. Swagger UI and its JSON document remain at `/docs` and `/docs-json`.

## Access and validation

- Public: POST /api/vetcare/auth/login (local credentials guard), POST /api/vetcare/auth/forgot-password and PUT /api/vetcare/auth/reset-password (rate limited), POST /api/vetcare/users, GET /api/vetcare/users/check-email, GET /api/vetcare/clinic/hours.
- Other operations require JWT. Role restrictions come from @Roles; ownership, employee responsibility, clinical permissions and tutorship are additionally checked by domain services.
- All identifier path parameters use ParseUUIDPipe. GET /api/vetcare/employees/available/:date validates YYYY-MM-DD through dateKey in the business service.
- DELETE routes returning 204 have no response body. Measurement deletion and tutorship removal return 200 with their operation result.

## Route inventory

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/vetcare/animal` | [src/app/animal/animal.controller.ts:24](../src/app/animal/animal.controller.ts) |
| POST | `/api/vetcare/animal` | [src/app/animal/animal.controller.ts:28](../src/app/animal/animal.controller.ts) |
| DELETE | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:87](../src/app/animal/animal.controller.ts) |
| GET | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:68](../src/app/animal/animal.controller.ts) |
| PATCH | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:80](../src/app/animal/animal.controller.ts) |
| PUT | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:73](../src/app/animal/animal.controller.ts) |
| GET | `/api/vetcare/animal/:id/owners` | [src/app/animal-owners/animal-owners.controller.ts:23](../src/app/animal-owners/animal-owners.controller.ts) |
| POST | `/api/vetcare/animal/:id/owners` | [src/app/animal-owners/animal-owners.controller.ts:31](../src/app/animal-owners/animal-owners.controller.ts) |
| DELETE | `/api/vetcare/animal/:id/owners/:userId` | [src/app/animal-owners/animal-owners.controller.ts:42](../src/app/animal-owners/animal-owners.controller.ts) |
| POST | `/api/vetcare/animal/:id/transfer` | [src/app/animal-owners/animal-owners.controller.ts:56](../src/app/animal-owners/animal-owners.controller.ts) |
| GET | `/api/vetcare/animal/all` | [src/app/animal/animal.controller.ts:37](../src/app/animal/animal.controller.ts) |
| PUT | `/api/vetcare/animal/confirm/:id` | [src/app/animal/animal.controller.ts:53](../src/app/animal/animal.controller.ts) |
| POST | `/api/vetcare/animal/create` | [src/app/animal/animal.controller.ts:33](../src/app/animal/animal.controller.ts) |
| GET | `/api/vetcare/animal/owner/:ownerId` | [src/app/animal/animal.controller.ts:42](../src/app/animal/animal.controller.ts) |
| PATCH | `/api/vetcare/animal/update/:id` | [src/app/animal/animal.controller.ts:61](../src/app/animal/animal.controller.ts) |
| GET | `/api/vetcare/animal-measurements` | [src/app/animal-measurements/measurement.controller.ts:22](../src/app/animal-measurements/measurement.controller.ts) |
| POST | `/api/vetcare/animal-measurements` | [src/app/animal-measurements/measurement.controller.ts:33](../src/app/animal-measurements/measurement.controller.ts) |
| DELETE | `/api/vetcare/animal-measurements/:id` | [src/app/animal-measurements/measurement.controller.ts:44](../src/app/animal-measurements/measurement.controller.ts) |
| GET | `/api/vetcare/animal-measurements/:id` | [src/app/animal-measurements/measurement.controller.ts:27](../src/app/animal-measurements/measurement.controller.ts) |
| PATCH | `/api/vetcare/animal-measurements/:id` | [src/app/animal-measurements/measurement.controller.ts:38](../src/app/animal-measurements/measurement.controller.ts) |
| POST | `/api/vetcare/auth/change-password` | [src/auth/auth.controller.ts:50](../src/auth/auth.controller.ts) |
| POST | `/api/vetcare/auth/forgot-password` | [src/auth/auth.controller.ts:69](../src/auth/auth.controller.ts) |
| POST | `/api/vetcare/auth/login` | [src/auth/auth.controller.ts:33](../src/auth/auth.controller.ts) |
| GET | `/api/vetcare/auth/me` | [src/auth/auth.controller.ts:42](../src/auth/auth.controller.ts) |
| PUT | `/api/vetcare/auth/reset-password` | [src/auth/auth.controller.ts:79](../src/auth/auth.controller.ts) |
| GET | `/api/vetcare/blocked-times` | [src/app/blocked-times/blocked-time.controller.ts:20](../src/app/blocked-times/blocked-time.controller.ts) |
| POST | `/api/vetcare/blocked-times` | [src/app/blocked-times/blocked-time.controller.ts:33](../src/app/blocked-times/blocked-time.controller.ts) |
| DELETE | `/api/vetcare/blocked-times/:id` | [src/app/blocked-times/blocked-time.controller.ts:47](../src/app/blocked-times/blocked-time.controller.ts) |
| GET | `/api/vetcare/blocked-times/:id` | [src/app/blocked-times/blocked-time.controller.ts:26](../src/app/blocked-times/blocked-time.controller.ts) |
| PUT | `/api/vetcare/blocked-times/:id` | [src/app/blocked-times/blocked-time.controller.ts:40](../src/app/blocked-times/blocked-time.controller.ts) |
| GET | `/api/vetcare/breeds` | [src/app/breeds/breeds.controller.ts:16](../src/app/breeds/breeds.controller.ts) |
| POST | `/api/vetcare/breeds` | [src/app/breeds/breeds.controller.ts:23](../src/app/breeds/breeds.controller.ts) |
| DELETE | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:37](../src/app/breeds/breeds.controller.ts) |
| GET | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:19](../src/app/breeds/breeds.controller.ts) |
| PATCH | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:32](../src/app/breeds/breeds.controller.ts) |
| PUT | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:27](../src/app/breeds/breeds.controller.ts) |
| GET | `/api/vetcare/clinic/hours` | [src/app/reservation/clinic.controller.ts:8](../src/app/reservation/clinic.controller.ts) |
| GET | `/api/vetcare/clinical-visits` | [src/app/clinical-visits/clinical-visit.controller.ts:20](../src/app/clinical-visits/clinical-visit.controller.ts) |
| POST | `/api/vetcare/clinical-visits` | [src/app/clinical-visits/clinical-visit.controller.ts:31](../src/app/clinical-visits/clinical-visit.controller.ts) |
| GET | `/api/vetcare/clinical-visits/:id` | [src/app/clinical-visits/clinical-visit.controller.ts:25](../src/app/clinical-visits/clinical-visit.controller.ts) |
| PATCH | `/api/vetcare/clinical-visits/:id` | [src/app/clinical-visits/clinical-visit.controller.ts:36](../src/app/clinical-visits/clinical-visit.controller.ts) |
| POST | `/api/vetcare/clinical-visits/:id/complete` | [src/app/clinical-visits/clinical-visit.controller.ts:44](../src/app/clinical-visits/clinical-visit.controller.ts) |
| POST | `/api/vetcare/clinical-visits/:id/void` | [src/app/clinical-visits/clinical-visit.controller.ts:53](../src/app/clinical-visits/clinical-visit.controller.ts) |
| GET | `/api/vetcare/employees` | [src/app/employees/employees.controller.ts:19](../src/app/employees/employees.controller.ts) |
| POST | `/api/vetcare/employees` | [src/app/employees/employees.controller.ts:42](../src/app/employees/employees.controller.ts) |
| DELETE | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:59](../src/app/employees/employees.controller.ts) |
| GET | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:37](../src/app/employees/employees.controller.ts) |
| PATCH | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:53](../src/app/employees/employees.controller.ts) |
| PUT | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:47](../src/app/employees/employees.controller.ts) |
| GET | `/api/vetcare/employees/available/:date` | [src/app/employees/employees.controller.ts:30](../src/app/employees/employees.controller.ts) |
| GET | `/api/vetcare/employees/me` | [src/app/employees/employees.controller.ts:25](../src/app/employees/employees.controller.ts) |
| GET | `/api/vetcare/job-titles` | [src/app/job-titles/job-titles.controller.ts:18](../src/app/job-titles/job-titles.controller.ts) |
| POST | `/api/vetcare/job-titles` | [src/app/job-titles/job-titles.controller.ts:27](../src/app/job-titles/job-titles.controller.ts) |
| DELETE | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:44](../src/app/job-titles/job-titles.controller.ts) |
| GET | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:22](../src/app/job-titles/job-titles.controller.ts) |
| PATCH | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:38](../src/app/job-titles/job-titles.controller.ts) |
| PUT | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:32](../src/app/job-titles/job-titles.controller.ts) |
| GET | `/api/vetcare/measurement-types` | [src/app/measurement-types/measurement-type.controller.ts:18](../src/app/measurement-types/measurement-type.controller.ts) |
| POST | `/api/vetcare/measurement-types` | [src/app/measurement-types/measurement-type.controller.ts:27](../src/app/measurement-types/measurement-type.controller.ts) |
| DELETE | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:44](../src/app/measurement-types/measurement-type.controller.ts) |
| GET | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:22](../src/app/measurement-types/measurement-type.controller.ts) |
| PATCH | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:38](../src/app/measurement-types/measurement-type.controller.ts) |
| PUT | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:32](../src/app/measurement-types/measurement-type.controller.ts) |
| GET | `/api/vetcare/reservations` | [src/app/reservation/reservation.controller.ts:27](../src/app/reservation/reservation.controller.ts) |
| POST | `/api/vetcare/reservations` | [src/app/reservation/reservation.controller.ts:46](../src/app/reservation/reservation.controller.ts) |
| GET | `/api/vetcare/reservations/:id` | [src/app/reservation/reservation.controller.ts:32](../src/app/reservation/reservation.controller.ts) |
| POST | `/api/vetcare/reservations/:id/cancel` | [src/app/reservation/reservation.controller.ts:77](../src/app/reservation/reservation.controller.ts) |
| POST | `/api/vetcare/reservations/:id/confirm` | [src/app/reservation/reservation.controller.ts:59](../src/app/reservation/reservation.controller.ts) |
| PATCH | `/api/vetcare/reservations/:id/employee` | [src/app/reservation/reservation.controller.ts:51](../src/app/reservation/reservation.controller.ts) |
| GET | `/api/vetcare/reservations/:id/history` | [src/app/reservation/reservation.controller.ts:38](../src/app/reservation/reservation.controller.ts) |
| POST | `/api/vetcare/reservations/:id/no-show` | [src/app/reservation/reservation.controller.ts:86](../src/app/reservation/reservation.controller.ts) |
| POST | `/api/vetcare/reservations/:id/reschedule` | [src/app/reservation/reservation.controller.ts:68](../src/app/reservation/reservation.controller.ts) |
| GET | `/api/vetcare/roles` | [src/app/roles/roles.controller.ts:19](../src/app/roles/roles.controller.ts) |
| POST | `/api/vetcare/roles` | [src/app/roles/roles.controller.ts:30](../src/app/roles/roles.controller.ts) |
| DELETE | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:47](../src/app/roles/roles.controller.ts) |
| GET | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:24](../src/app/roles/roles.controller.ts) |
| PATCH | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:41](../src/app/roles/roles.controller.ts) |
| PUT | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:35](../src/app/roles/roles.controller.ts) |
| GET | `/api/vetcare/species` | [src/app/species/species.controller.ts:18](../src/app/species/species.controller.ts) |
| POST | `/api/vetcare/species` | [src/app/species/species.controller.ts:27](../src/app/species/species.controller.ts) |
| DELETE | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:44](../src/app/species/species.controller.ts) |
| GET | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:22](../src/app/species/species.controller.ts) |
| PATCH | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:38](../src/app/species/species.controller.ts) |
| PUT | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:32](../src/app/species/species.controller.ts) |
| GET | `/api/vetcare/system-settings` | [src/app/system-settings/system-settings.controller.ts:19](../src/app/system-settings/system-settings.controller.ts) |
| GET | `/api/vetcare/system-settings/:id` | [src/app/system-settings/system-settings.controller.ts:23](../src/app/system-settings/system-settings.controller.ts) |
| PATCH | `/api/vetcare/system-settings/:id` | [src/app/system-settings/system-settings.controller.ts:33](../src/app/system-settings/system-settings.controller.ts) |
| PUT | `/api/vetcare/system-settings/:id` | [src/app/system-settings/system-settings.controller.ts:28](../src/app/system-settings/system-settings.controller.ts) |
| GET | `/api/vetcare/users` | [src/app/users/users.controller.ts:39](../src/app/users/users.controller.ts) |
| POST | `/api/vetcare/users` | [src/app/users/users.controller.ts:64](../src/app/users/users.controller.ts) |
| DELETE | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:150](../src/app/users/users.controller.ts) |
| GET | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:112](../src/app/users/users.controller.ts) |
| PATCH | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:122](../src/app/users/users.controller.ts) |
| PUT | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:136](../src/app/users/users.controller.ts) |
| GET | `/api/vetcare/users/:id/roles` | [src/app/users/users.controller.ts:91](../src/app/users/users.controller.ts) |
| PUT | `/api/vetcare/users/:id/roles` | [src/app/users/users.controller.ts:103](../src/app/users/users.controller.ts) |
| GET | `/api/vetcare/users/check-email` | [src/app/users/users.controller.ts:57](../src/app/users/users.controller.ts) |
| GET | `/api/vetcare/users/clients` | [src/app/users/users.controller.ts:48](../src/app/users/users.controller.ts) |
| POST | `/api/vetcare/users/clients` | [src/app/users/users.controller.ts:72](../src/app/users/users.controller.ts) |
| POST | `/api/vetcare/users/create-clients` | [src/app/users/users.controller.ts:82](../src/app/users/users.controller.ts) |

## Review findings and compatibility

1. No duplicate method/path pairs were found. Static GET routes in users, employees and animals precede the generic /:id handler. Nested animal owners routes have additional segments and do not collide with AnimalController.
2. Canonical reservation routes are /api/vetcare/reservations (plural). Swagger grouping must use reservations. GET /api/vetcare/clinic/hours is public; DELETE /api/vetcare/animal/:id is administrator-only.
3. Existing animal compatibility routes POST /api/vetcare/animal/create and PATCH /api/vetcare/animal/update/:id remain available and are deprecated in OpenAPI. Prefer POST /api/vetcare/animal and the canonical PATCH /api/vetcare/animal/:id in new clients. POST /api/vetcare/users/create-clients remains as a deprecated alias of the canonical POST /api/vetcare/users/clients, with identical administrator protection and behavior.
4. Several domains expose PUT and PATCH with the same partial-update DTO. Document this compatibility behavior accurately. A future strict PUT replacement contract would be a breaking change.
5. Action statuses are explicit: login and password change return 200; asynchronous password recovery returns 202; primary tutor transfer returns 200. Resource creation remains 201. Reservation/clinical action controllers already use explicit 200. These explicit statuses replace the previous default 201 for these POST actions.
6. GET /api/vetcare/users/check-email intentionally reveals email existence. CheckEmailQueryDto now validates the query: missing or invalid email returns 400 instead of the previous false result. The operation remains public; its authentication and rate-limit policy are unchanged.
7. Employee availability means an active, bookable employee on the date; it does not promise an unoccupied timeslot (the business service has a scheduling TODO). Document the existing meaning rather than imply timeslot availability.
8. DELETE /api/vetcare/animal/:id/owners/:userId accepts transferFutureReservations in query or JSON body; body wins. Prefer the query parameter in clients for DELETE portability while keeping body compatibility.

## Regression checks

- Boot controllers with stub services and real Nest routing/ValidationPipe, without a database.
- Verify static routes are dispatched before UUID handlers, nested owners routes reach the correct controller, invalid UUIDs return 400, and unknown routes return 404.
- Verify actual public routes omit bearer security in OpenAPI, protected operations advertise bearer security, and aliases are documented without adding routes.
- Verify explicit action statuses, 201 creation, and body-free 204 deletion.

## Explicit action statuses

| Operation | HTTP status |
| --- | --- |
| POST /api/vetcare/auth/login | 200 |
| POST /api/vetcare/auth/change-password | 200 |
| POST /api/vetcare/auth/forgot-password | 202 |
| PUT /api/vetcare/auth/reset-password | 200 |
| POST /api/vetcare/animal/:id/transfer | 200 |
| POST /api/vetcare/users/clients and its legacy alias | 201 |

Compatibility: the base URL changes from `/api` to `/api/vetcare`; clients must update their API base URL. No aliases for the old base prefix are registered. Existing resource/action suffixes remain available under the new prefix, including deprecated aliases. The action statuses above intentionally replace the old implicit POST 201 responses. PATCH /api/vetcare/animal/:id and POST /api/vetcare/users/clients are additive canonical routes. Invalid or missing check-email query input now returns 400.
