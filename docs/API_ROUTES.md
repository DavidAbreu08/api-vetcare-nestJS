# API routes

Inventory of the current HTTP controllers (96 operations). Paths below are the real registered routes; Swagger must describe these paths rather than infer singular/plural names.

All operations use the global `/api/vetcare` prefix from `src/api-routing.ts`. Controllers declare only their resource path. Swagger UI and its JSON document remain at `/docs` and `/docs-json`.

## Access and validation

- Public: POST /api/vetcare/auth/login (local credentials guard), POST /api/vetcare/auth/forgot-password and PUT /api/vetcare/auth/reset-password (rate limited), POST /api/vetcare/users, GET /api/vetcare/users/check-email, GET /api/vetcare/clinic/hours.
- Other operations require JWT. Role restrictions come from @Roles; ownership, employee responsibility, clinical permissions and tutorship are additionally checked by domain services.
- All identifier path parameters use ParseUUIDPipe. GET /api/vetcare/employees/available/:date validates YYYY-MM-DD through dateKey in the business service.
- DELETE routes returning 204 have no response body. Measurement deletion and tutorship removal return 200 with their operation result.

## Route inventory

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/vetcare/animal` | [src/app/animal/animal.controller.ts:24](../src/app/animal/animal.controller.ts#L24) |
| POST | `/api/vetcare/animal` | [src/app/animal/animal.controller.ts:28](../src/app/animal/animal.controller.ts#L28) |
| DELETE | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:68](../src/app/animal/animal.controller.ts#L68) |
| GET | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:56](../src/app/animal/animal.controller.ts#L56) |
| PATCH | `/api/vetcare/animal/:id` | [src/app/animal/animal.controller.ts:61](../src/app/animal/animal.controller.ts#L61) |
| GET | `/api/vetcare/animal/:id/owners` | [src/app/animal-owners/animal-owners.controller.ts:23](../src/app/animal-owners/animal-owners.controller.ts#L23) |
| POST | `/api/vetcare/animal/:id/owners` | [src/app/animal-owners/animal-owners.controller.ts:31](../src/app/animal-owners/animal-owners.controller.ts#L31) |
| DELETE | `/api/vetcare/animal/:id/owners/:userId` | [src/app/animal-owners/animal-owners.controller.ts:42](../src/app/animal-owners/animal-owners.controller.ts#L42) |
| POST | `/api/vetcare/animal/:id/transfer` | [src/app/animal-owners/animal-owners.controller.ts:56](../src/app/animal-owners/animal-owners.controller.ts#L56) |
| GET | `/api/vetcare/animal/all` | [src/app/animal/animal.controller.ts:32](../src/app/animal/animal.controller.ts#L32) |
| PUT | `/api/vetcare/animal/confirm/:id` | [src/app/animal/animal.controller.ts:48](../src/app/animal/animal.controller.ts#L48) |
| GET | `/api/vetcare/animal/owner/:ownerId` | [src/app/animal/animal.controller.ts:37](../src/app/animal/animal.controller.ts#L37) |
| GET | `/api/vetcare/animal-measurements` | [src/app/animal-measurements/measurement.controller.ts:22](../src/app/animal-measurements/measurement.controller.ts#L22) |
| POST | `/api/vetcare/animal-measurements` | [src/app/animal-measurements/measurement.controller.ts:33](../src/app/animal-measurements/measurement.controller.ts#L33) |
| DELETE | `/api/vetcare/animal-measurements/:id` | [src/app/animal-measurements/measurement.controller.ts:44](../src/app/animal-measurements/measurement.controller.ts#L44) |
| GET | `/api/vetcare/animal-measurements/:id` | [src/app/animal-measurements/measurement.controller.ts:27](../src/app/animal-measurements/measurement.controller.ts#L27) |
| PATCH | `/api/vetcare/animal-measurements/:id` | [src/app/animal-measurements/measurement.controller.ts:38](../src/app/animal-measurements/measurement.controller.ts#L38) |
| POST | `/api/vetcare/auth/change-password` | [src/auth/auth.controller.ts:63](../src/auth/auth.controller.ts#L63) |
| POST | `/api/vetcare/auth/forgot-password` | [src/auth/auth.controller.ts:84](../src/auth/auth.controller.ts#L84) |
| POST | `/api/vetcare/auth/login` | [src/auth/auth.controller.ts:33](../src/auth/auth.controller.ts#L33) |
| GET | `/api/vetcare/auth/me` | [src/auth/auth.controller.ts:55](../src/auth/auth.controller.ts#L55) |
| PUT | `/api/vetcare/auth/reset-password` | [src/auth/auth.controller.ts:97](../src/auth/auth.controller.ts#L97) |
| GET | `/api/vetcare/blocked-times` | [src/app/blocked-times/blocked-time.controller.ts:20](../src/app/blocked-times/blocked-time.controller.ts#L20) |
| POST | `/api/vetcare/blocked-times` | [src/app/blocked-times/blocked-time.controller.ts:33](../src/app/blocked-times/blocked-time.controller.ts#L33) |
| DELETE | `/api/vetcare/blocked-times/:id` | [src/app/blocked-times/blocked-time.controller.ts:47](../src/app/blocked-times/blocked-time.controller.ts#L47) |
| GET | `/api/vetcare/blocked-times/:id` | [src/app/blocked-times/blocked-time.controller.ts:26](../src/app/blocked-times/blocked-time.controller.ts#L26) |
| PATCH | `/api/vetcare/blocked-times/:id` | [src/app/blocked-times/blocked-time.controller.ts:40](../src/app/blocked-times/blocked-time.controller.ts#L40) |
| GET | `/api/vetcare/breeds` | [src/app/breeds/breeds.controller.ts:17](../src/app/breeds/breeds.controller.ts#L17) |
| POST | `/api/vetcare/breeds` | [src/app/breeds/breeds.controller.ts:26](../src/app/breeds/breeds.controller.ts#L26) |
| DELETE | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:37](../src/app/breeds/breeds.controller.ts#L37) |
| GET | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:21](../src/app/breeds/breeds.controller.ts#L21) |
| PATCH | `/api/vetcare/breeds/:id` | [src/app/breeds/breeds.controller.ts:31](../src/app/breeds/breeds.controller.ts#L31) |
| GET | `/api/vetcare/clinic/hours` | [src/app/reservation/clinic.controller.ts:8](../src/app/reservation/clinic.controller.ts#L8) |
| GET | `/api/vetcare/clinical-visits` | [src/app/clinical-visits/clinical-visit.controller.ts:20](../src/app/clinical-visits/clinical-visit.controller.ts#L20) |
| POST | `/api/vetcare/clinical-visits` | [src/app/clinical-visits/clinical-visit.controller.ts:31](../src/app/clinical-visits/clinical-visit.controller.ts#L31) |
| GET | `/api/vetcare/clinical-visits/:id` | [src/app/clinical-visits/clinical-visit.controller.ts:25](../src/app/clinical-visits/clinical-visit.controller.ts#L25) |
| PATCH | `/api/vetcare/clinical-visits/:id` | [src/app/clinical-visits/clinical-visit.controller.ts:36](../src/app/clinical-visits/clinical-visit.controller.ts#L36) |
| POST | `/api/vetcare/clinical-visits/:id/complete` | [src/app/clinical-visits/clinical-visit.controller.ts:44](../src/app/clinical-visits/clinical-visit.controller.ts#L44) |
| POST | `/api/vetcare/clinical-visits/:id/void` | [src/app/clinical-visits/clinical-visit.controller.ts:53](../src/app/clinical-visits/clinical-visit.controller.ts#L53) |
| GET | `/api/vetcare/employees` | [src/app/employees/employees.controller.ts:20](../src/app/employees/employees.controller.ts#L20) |
| POST | `/api/vetcare/employees` | [src/app/employees/employees.controller.ts:56](../src/app/employees/employees.controller.ts#L56) |
| DELETE | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:67](../src/app/employees/employees.controller.ts#L67) |
| GET | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:51](../src/app/employees/employees.controller.ts#L51) |
| PATCH | `/api/vetcare/employees/:id` | [src/app/employees/employees.controller.ts:61](../src/app/employees/employees.controller.ts#L61) |
| GET | `/api/vetcare/employees/:id/services` | [src/app/employees/employees.controller.ts:38](../src/app/employees/employees.controller.ts#L38) |
| PUT | `/api/vetcare/employees/:id/services` | [src/app/employees/employees.controller.ts:44](../src/app/employees/employees.controller.ts#L44) |
| GET | `/api/vetcare/employees/available/:date` | [src/app/employees/employees.controller.ts:31](../src/app/employees/employees.controller.ts#L31) |
| GET | `/api/vetcare/employees/me` | [src/app/employees/employees.controller.ts:26](../src/app/employees/employees.controller.ts#L26) |
| GET | `/api/vetcare/job-titles` | [src/app/job-titles/job-titles.controller.ts:18](../src/app/job-titles/job-titles.controller.ts#L18) |
| POST | `/api/vetcare/job-titles` | [src/app/job-titles/job-titles.controller.ts:27](../src/app/job-titles/job-titles.controller.ts#L27) |
| DELETE | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:38](../src/app/job-titles/job-titles.controller.ts#L38) |
| GET | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:22](../src/app/job-titles/job-titles.controller.ts#L22) |
| PATCH | `/api/vetcare/job-titles/:id` | [src/app/job-titles/job-titles.controller.ts:32](../src/app/job-titles/job-titles.controller.ts#L32) |
| GET | `/api/vetcare/measurement-types` | [src/app/measurement-types/measurement-type.controller.ts:18](../src/app/measurement-types/measurement-type.controller.ts#L18) |
| POST | `/api/vetcare/measurement-types` | [src/app/measurement-types/measurement-type.controller.ts:27](../src/app/measurement-types/measurement-type.controller.ts#L27) |
| DELETE | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:38](../src/app/measurement-types/measurement-type.controller.ts#L38) |
| GET | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:22](../src/app/measurement-types/measurement-type.controller.ts#L22) |
| PATCH | `/api/vetcare/measurement-types/:id` | [src/app/measurement-types/measurement-type.controller.ts:32](../src/app/measurement-types/measurement-type.controller.ts#L32) |
| GET | `/api/vetcare/reservations` | [src/app/reservation/reservation.controller.ts:28](../src/app/reservation/reservation.controller.ts#L28) |
| POST | `/api/vetcare/reservations` | [src/app/reservation/reservation.controller.ts:49](../src/app/reservation/reservation.controller.ts#L49) |
| GET | `/api/vetcare/reservations/:id` | [src/app/reservation/reservation.controller.ts:34](../src/app/reservation/reservation.controller.ts#L34) |
| POST | `/api/vetcare/reservations/:id/cancel` | [src/app/reservation/reservation.controller.ts:84](../src/app/reservation/reservation.controller.ts#L84) |
| POST | `/api/vetcare/reservations/:id/confirm` | [src/app/reservation/reservation.controller.ts:64](../src/app/reservation/reservation.controller.ts#L64) |
| PATCH | `/api/vetcare/reservations/:id/employee` | [src/app/reservation/reservation.controller.ts:55](../src/app/reservation/reservation.controller.ts#L55) |
| GET | `/api/vetcare/reservations/:id/history` | [src/app/reservation/reservation.controller.ts:41](../src/app/reservation/reservation.controller.ts#L41) |
| POST | `/api/vetcare/reservations/:id/no-show` | [src/app/reservation/reservation.controller.ts:94](../src/app/reservation/reservation.controller.ts#L94) |
| POST | `/api/vetcare/reservations/:id/reschedule` | [src/app/reservation/reservation.controller.ts:74](../src/app/reservation/reservation.controller.ts#L74) |
| GET | `/api/vetcare/roles` | [src/app/roles/roles.controller.ts:19](../src/app/roles/roles.controller.ts#L19) |
| POST | `/api/vetcare/roles` | [src/app/roles/roles.controller.ts:30](../src/app/roles/roles.controller.ts#L30) |
| DELETE | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:41](../src/app/roles/roles.controller.ts#L41) |
| GET | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:24](../src/app/roles/roles.controller.ts#L24) |
| PATCH | `/api/vetcare/roles/:id` | [src/app/roles/roles.controller.ts:35](../src/app/roles/roles.controller.ts#L35) |
| GET | `/api/vetcare/services` | [src/app/clinic-services/clinic-services.controller.ts:20](../src/app/clinic-services/clinic-services.controller.ts#L20) |
| POST | `/api/vetcare/services` | [src/app/clinic-services/clinic-services.controller.ts:35](../src/app/clinic-services/clinic-services.controller.ts#L35) |
| DELETE | `/api/vetcare/services/:id` | [src/app/clinic-services/clinic-services.controller.ts:46](../src/app/clinic-services/clinic-services.controller.ts#L46) |
| GET | `/api/vetcare/services/:id` | [src/app/clinic-services/clinic-services.controller.ts:30](../src/app/clinic-services/clinic-services.controller.ts#L30) |
| PATCH | `/api/vetcare/services/:id` | [src/app/clinic-services/clinic-services.controller.ts:40](../src/app/clinic-services/clinic-services.controller.ts#L40) |
| GET | `/api/vetcare/services/:id/employees` | [src/app/clinic-services/clinic-services.controller.ts:24](../src/app/clinic-services/clinic-services.controller.ts#L24) |
| GET | `/api/vetcare/species` | [src/app/species/species.controller.ts:18](../src/app/species/species.controller.ts#L18) |
| POST | `/api/vetcare/species` | [src/app/species/species.controller.ts:27](../src/app/species/species.controller.ts#L27) |
| DELETE | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:38](../src/app/species/species.controller.ts#L38) |
| GET | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:22](../src/app/species/species.controller.ts#L22) |
| PATCH | `/api/vetcare/species/:id` | [src/app/species/species.controller.ts:32](../src/app/species/species.controller.ts#L32) |
| GET | `/api/vetcare/system-settings` | [src/app/system-settings/system-settings.controller.ts:19](../src/app/system-settings/system-settings.controller.ts#L19) |
| GET | `/api/vetcare/system-settings/:id` | [src/app/system-settings/system-settings.controller.ts:23](../src/app/system-settings/system-settings.controller.ts#L23) |
| PATCH | `/api/vetcare/system-settings/:id` | [src/app/system-settings/system-settings.controller.ts:28](../src/app/system-settings/system-settings.controller.ts#L28) |
| GET | `/api/vetcare/users` | [src/app/users/users.controller.ts:39](../src/app/users/users.controller.ts#L39) |
| POST | `/api/vetcare/users` | [src/app/users/users.controller.ts:65](../src/app/users/users.controller.ts#L65) |
| DELETE | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:130](../src/app/users/users.controller.ts#L130) |
| GET | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:103](../src/app/users/users.controller.ts#L103) |
| PATCH | `/api/vetcare/users/:id` | [src/app/users/users.controller.ts:113](../src/app/users/users.controller.ts#L113) |
| GET | `/api/vetcare/users/:id/roles` | [src/app/users/users.controller.ts:82](../src/app/users/users.controller.ts#L82) |
| PUT | `/api/vetcare/users/:id/roles` | [src/app/users/users.controller.ts:94](../src/app/users/users.controller.ts#L94) |
| GET | `/api/vetcare/users/check-email` | [src/app/users/users.controller.ts:57](../src/app/users/users.controller.ts#L57) |
| GET | `/api/vetcare/users/clients` | [src/app/users/users.controller.ts:48](../src/app/users/users.controller.ts#L48) |
| POST | `/api/vetcare/users/clients` | [src/app/users/users.controller.ts:73](../src/app/users/users.controller.ts#L73) |

## Route conventions

1. No duplicate method/path pairs were found. Static GET routes in users, employees and animals precede the generic /:id handler. Nested animal owners routes have additional segments and do not collide with AnimalController.
2. Canonical reservation routes are /api/vetcare/reservations (plural). Swagger grouping must use reservations. GET /api/vetcare/clinic/hours is public; DELETE /api/vetcare/animal/:id is administrator-only.
3. Animal creation uses POST /api/vetcare/animal and animal updates use PATCH /api/vetcare/animal/:id. Administrator-created client accounts use POST /api/vetcare/users/clients. Deprecated route aliases are not registered or advertised in OpenAPI.
4. Partial updates use PATCH for animals, users, employees, roles, job titles, services, species, breeds, measurement types, system settings and blocked times. Duplicate PUT /:id handlers and the previous blocked-time PUT /:id handler are not registered. PUT /users/:id/roles and PUT /employees/:id/services replace the whole assignment list; confirmation and password-reset action routes also retain PUT.
5. Action statuses are explicit: login and password change return 200; asynchronous password recovery returns 202; primary tutor transfer returns 200. Resource creation remains 201. Reservation/clinical action controllers already use explicit 200. These explicit statuses replace the previous default 201 for these POST actions.
6. GET /api/vetcare/users/check-email intentionally reveals email existence. CheckEmailQueryDto now validates the query: missing or invalid email returns 400 instead of the previous false result. The operation remains public; its authentication and rate-limit policy are unchanged.
7. Employee availability means an active, bookable employee on the date; it does not promise an unoccupied timeslot (the business service has a scheduling TODO). Document the existing meaning rather than imply timeslot availability.
8. DELETE /api/vetcare/animal/:id/owners/:userId accepts transferFutureReservations in query or JSON body; body wins. Prefer the query parameter in clients for DELETE portability while keeping body compatibility.
9. Reservation authorship: POST /api/vetcare/reservations always records the caller as `createdBy` (a `createdBy` body field is rejected with 400 by the whitelist validation). GET /api/vetcare/reservations accepts an optional `createdBy` (UUID) query filter that only narrows the caller's existing scope; non-administrators can only filter by their own id (another id returns an empty page). Reservation responses carry `createdBy` (administrators, or the caller's own id; null otherwise) and `createdBySelf`; the schema is `ReservationResponseDto` in OpenAPI.
10. Clinic services (Swagger tag "Services", module `src/app/clinic-services`, table `vc_services`): GET /api/vetcare/services and GET /services/:id for every authenticated user (non-administrators only see active services; inactive ones are 404 for them; administrators may filter with `?isActive=true|false`), POST/PATCH/DELETE for administrators (code immutable, 409; DELETE returns 204 and is refused with 409 when the service is referenced by any reservation or qualification: deactivate it instead). GET /services/:id/employees (ADMIN, EMPLOYEE) lists the qualified employees bookable today. The literal `:id/employees` route is declared before `:id`. GET /employees/:id/services (ADMIN or the employee itself) and PUT /employees/:id/services `{ serviceIds }` (ADMIN, full replacement) manage qualifications. Service ids in a body follow one rule (POST /reservations and PUT /employees/:id/services): missing → 404, inactive and newly referenced → 409 `SERVICE_INACTIVE` (on POST /reservations non-administrators get 404 for an inactive service, which is not revealed to them); PUT /employees/:id/services returns 409 "Qualifications changed; reload and retry" when the qualifications changed concurrently. POST /reservations requires `serviceId`; `endAt` is optional (computed from the service duration; only administrators may send a different value); POST /reservations/:id/reschedule accepts an optional `endAt` (default: the reservation's current duration). Reservation responses carry `serviceId` and `service { id, code, name, durationMinutes }` (always present; null for legacy reservations).

## Regression checks

- Boot controllers with stub services and real Nest routing/ValidationPipe, without a database.
- Verify static routes are dispatched before UUID handlers, nested owners routes reach the correct controller, invalid UUIDs return 400, and unknown routes return 404.
- Verify actual public routes omit bearer security in OpenAPI, protected operations advertise bearer security, and removed aliases and duplicate PUT handlers are absent from both routing and OpenAPI.
- Verify explicit action statuses, 201 creation, and body-free 204 deletion.

## Explicit action statuses

| Operation | HTTP status |
| --- | --- |
| POST /api/vetcare/auth/login | 200 |
| POST /api/vetcare/auth/change-password | 200 |
| POST /api/vetcare/auth/forgot-password | 202 |
| PUT /api/vetcare/auth/reset-password | 200 |
| POST /api/vetcare/animal/:id/transfer | 200 |
| POST /api/vetcare/users/clients | 201 |

The API base URL is `/api/vetcare`. No aliases for the old `/api` prefix, deprecated animal/client creation routes or duplicate PUT partial-update handlers are registered. The frontend must use the canonical routes in the inventory. The action statuses above are explicit rather than the implicit POST default of 201. Invalid or missing check-email query input returns 400.
