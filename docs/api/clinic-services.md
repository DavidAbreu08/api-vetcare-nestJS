---
titulo: Clinic services and qualifications
descricao: Services catalog and employee qualifications.
cobre: [src/app/clinic-services/**]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

# Clinic services and qualifications

## Clinic services and qualifications

Bookable services live in `vc_services` (migration `1795608000000`; module `src/app/clinic-services`, entity `ClinicServiceEntity`, route `/api/vetcare/services`, Swagger tag "Services"): immutable uppercase `code` (catalog rule, `uq_vc_services_code`), `name`, optional `description`, `durationMinutes` (5..1440, multiple of 5; `ck_vc_services_duration`) and `isActive`. There is no price in this phase. Employee qualifications live in `vc_employee_services` (`employee_id`, `service_id`). The 409 names below (`SERVICE_INACTIVE`, `SERVICE_IN_USE`, `QUALIFICATION_HAS_OPEN_RESERVATIONS`, ...) are internal rule names; the HTTP body only carries `errorMetadata` and a readable `friendlyMessage`.

| Route | Access | Rule |
| --- | --- | --- |
| GET /api/vetcare/services | authenticated | non-administrators: active services only; ADMIN: all, optional `isActive` filter; skip/take; ordered by name |
| GET /api/vetcare/services/:id | authenticated | an inactive service is 404 for non-administrators |
| GET /api/vetcare/services/:id/employees | ADMIN, EMPLOYEE | qualified employees bookable today (available profile, active account, not terminated), projected like reservation employees; no schedule or occupation check (use GET /api/vetcare/availability) |
| POST /api/vetcare/services | ADMIN | 201; `isActive` defaults to true |
| PATCH /api/vetcare/services/:id | ADMIN | under the service row lock; `code` immutable (409); a new `durationMinutes` applies to new reservations only; deactivation blocks new reservations only and never removes qualifications |
| DELETE /api/vetcare/services/:id | ADMIN | 204 only when no reservation (any state) and no qualification references it; otherwise 409 IN_USE with the counts in the message (deactivate instead); a reference committed concurrently is caught by the foreign key and gets the same message |
| GET /api/vetcare/employees/:id/services | ADMIN, the employee itself | qualifications, including services deactivated later |
| PUT /api/vetcare/employees/:id/services `{ serviceIds }` | ADMIN | full replacement in one transaction; the services to add are read with a shared lock (by id) before the employee profile lock; unknown services: 404; new qualifications for inactive services: 409 `SERVICE_INACTIVE`; inactive services already held may be kept; qualifications changed concurrently so that an unlocked service must be added: 409 `QUALIFICATIONS_CHANGED` ("Qualifications changed; reload and retry"); removing a qualification while the employee has open reservations (PENDING/CONFIRMED, not finished) of that service: 409 IN_USE (count in the message); kept rows are not rewritten |

- Reservations: `serviceId` is required on POST /api/vetcare/reservations (no compatibility with the previous free-duration body). The service must exist (404) and be active: an inactive service is 409 `SERVICE_INACTIVE` for administrators and 404 for everyone else (inactive services are not revealed, as in GET /services/:id). The server computes `endAt = startAt + durationMinutes`; non-administrators may omit `endAt` or send exactly that value (400 `END_AT_MISMATCH` otherwise); administrators may send a different `endAt` (override), still subject to the clinic window rules. The interval is frozen in `start_at`/`end_at`: changing `durationMinutes` never alters existing reservations, and POST /reschedule without `endAt` keeps the reservation's own duration.
- `service_id` is immutable (`update: false`); changing the service of an existing reservation is not supported and no `SERVICE_CHANGED` history action exists. History snapshots written from now on include `serviceId`.
- Qualification: when the reservation has a service, the employee (pre-assignment on creation, PATCH /employee, confirm, reschedule) must hold it in `vc_employee_services` (400 `EMPLOYEE_NOT_QUALIFIED`, "The employee is not qualified for this service"), checked inside the transaction after the employee profile lock and before the applock. Reservations created before the catalog (`service_id` NULL) are not checked. An inactive service blocks only new reservations: assign, confirm and reschedule of existing ones do not read the service.
- Responses: `serviceId` and `service { id, code, name, durationMinutes }` (same for every caller; current catalog values, null for legacy reservations). `service` is always present: every reservation loader (detail, list, write responses) joins the relation, and the serializer fails instead of silently omitting it.
- Referenced ids in a body follow one rule (POST /reservations, PUT /employees/:id/services): an absent or malformed id is 400 (DTO validation: `serviceId` has `@IsUUID()` without `@IsOptional()`, `serviceIds` has `@IsUUID("all", { each: true })`); a well-formed id of an unknown service is 404; an inactive service being newly referenced is 409 `SERVICE_INACTIVE`.
- Visit start (POST /api/vetcare/clinical-visits from a reservation with a service): the responsible employee — the reservation's employee by default, or the one an administrator names — must hold that service (400 `EMPLOYEE_NOT_QUALIFIED`, same message), checked after the employee profile lock and before the visit insert. Walk-ins (no reservation) and reservations with `service_id` NULL are not checked.
- Deactivating an employee or a service keeps the qualifications; deleting an employee profile (only possible without reservations or visits) removes its qualifications together with its job titles.
