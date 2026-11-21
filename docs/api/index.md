<!-- project-docs:inicio -->
# API implementation index - api-vetcare-angular

Internal. Open only the document the task needs. Endpoint details belong to the OpenAPI contract (see [../public/index.md](../public/index.md)). Cross-references by section name (for example "Integrity and lifecycle") point to the documents below.

| Document | Description (1 line) | Cobre |
|---|---|---|
| [routes.md](routes.md) | Route inventory with source links, access rules and route conventions | `src/**/*.controller.ts`, `src/api-routing.ts` |
| [http-responses.md](http-responses.md) | Envelope, domain errors, SQL Server error translation, success messages | `src/app/core/**` (response and error files) |
| [resources-crud.md](resources-crud.md) | Resource CRUD, DTO documentation and animal compatibility, verification notes | `src/app/{users,animal,species,breeds}/**`, `src/app/core/dto/**` |
| [measurements.md](measurements.md) | Measurement types and observations | `src/app/animal-measurements/**`, `src/app/measurement-types/**` |
| [accounts-employees-roles.md](accounts-employees-roles.md) | Roles through system settings; accounts, employees and catalogs; integrity rules for roles and employees | `src/app/{roles,system-settings,employees,job-titles,users}/**` |
| [password-recovery.md](password-recovery.md) | Password recovery flow and reset tokens | `src/auth/**`, `src/email/**` |
| [reservations-clinical-visits.md](reservations-clinical-visits.md) | Reservations, reservation history and clinical visits | `src/app/{reservation,reservation-history,clinical-visits}/**` |
| [integrity-lifecycle.md](integrity-lifecycle.md) | Integrity and lifecycle (open reservations blocking changes) | `src/app/reservation/open-reservations.ts` and related modules |
| [animal-owners.md](animal-owners.md) | Animal tutors and primary tutor transfer | `src/app/animal-owners/**` |
| [clinic-services.md](clinic-services.md) | Clinic services and qualifications | `src/app/clinic-services/**` |
| [schedules-blocked-times-availability.md](schedules-blocked-times-availability.md) | Employee schedules, blocked times and availability | `src/app/{employee-schedules,blocked-times,availability}/**` |

"Persistence errors" and "Lock order" are in [../architecture.md](../architecture.md).
<!-- project-docs:fim -->
