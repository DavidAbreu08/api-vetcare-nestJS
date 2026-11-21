---
titulo: Integrity and lifecycle
descricao: Open-reservation rules that block deactivation, deletion and status changes.
cobre: [src/app/reservation/open-reservations.ts, src/app/employees/**, src/app/users/**, src/app/animal/**, src/app/clinical-visits/**]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

# Integrity and lifecycle

## Integrity and lifecycle

Nothing is ever cancelled or reassigned automatically: changes that would strand open reservations return 409 so the caller can cancel or reassign them first. "Open reservation" = PENDING or CONFIRMED whose `end_at` is still in the future (UTC); a stale reservation whose end has passed does not block. Known limitation (accepted): an overdue CONFIRMED reservation (end passed, never completed, cancelled or marked NO_SHOW) is therefore not counted as open and does not block these changes; administrators should close such reservations (no-show/cancel). Conflict responses are the global error envelope only (`status` 409, `errorMetadata` IN_USE or CONFLICT, `friendlyMessage`, `result: null`): they never carry id lists or count fields. When useful the number of affected records is part of the readable message (e.g. "The client has 2 open reservations (pending or confirmed, not yet finished); cancel them before deactivating or deleting the account."); clients find the records through GET /api/vetcare/reservations (filters `clientId`, `employeeId`, `animalId`, `status`, `from`) or GET /api/vetcare/clinical-visits. The internal names in the table below identify each rule in code and tests; they are not part of the HTTP body.

| Change | Rule | Internal rule name (message only in HTTP) |
| --- | --- | --- |
| PATCH /api/vetcare/employees/:id: termination date or `isAvailableForBookings=false` | refused when an open reservation assigned to the profile was attendable before the change and no longer is after it (termination on or before its clinic date, or unavailability). PENDING assignments count as well as CONFIRMED, so no reservation stays assigned to someone who cannot attend it. Edits that keep the profile bookable, and edits of an already unavailable profile, are not blocked | `EMPLOYEE_HAS_OPEN_RESERVATIONS` |
| PATCH /api/vetcare/users/:id `isActive=false`, DELETE /api/vetcare/users/:id | refused while the account is the client of open reservations, or its employee profile has open reservations assigned; the message states how many | `CLIENT_HAS_OPEN_RESERVATIONS`, `EMPLOYEE_HAS_OPEN_RESERVATIONS` |
| DELETE /api/vetcare/animal/:id | refused while the animal has open reservations or an IN_PROGRESS visit; the message states how many of each | `ANIMAL_HAS_OPEN_ACTIVITY` |
| DELETE /api/vetcare/employees/:id | refused while any reservation or visit references the profile; the message states how many reservations and visits | `EMPLOYEE_HAS_HISTORY` |
| POST /api/vetcare/employees (existing account), profile reactivation, PUT /api/vetcare/users/:id/roles adding roles | refused for an inactive account (removing roles stays allowed) | (message only) |
| POST /api/vetcare/clinical-visits | one IN_PROGRESS visit per animal; also enforced by `uq_vc_clinical_visits_animal_in_progress`, whose 2601 violation (concurrent start) maps to the same 409 (message only, no visit id) | `ANIMAL_VISIT_IN_PROGRESS` |

Reservation creation, confirmation and reschedule re-check inside the transaction, under lock, that the animal exists and is not soft-deleted (409 `ANIMAL_UNAVAILABLE`) and that the client account is active and not deleted (409 `CLIENT_INACTIVE`). Creation also re-reads, after those locks, that the client is still an active tutor of the animal (409 `ANIMAL_OWNER_MISMATCH`; the earlier pre-check returns 400).

Species and breed: the animal's owner and any staff with write access may change them (no 403). A change by an administrator, or by a veterinarian acting on another client's animal, takes effect verified (`isVerified=true`); a change by anyone else (the client, a non-veterinarian employee, or a veterinarian on their own animal, which follows the client path) leaves the animal `isVerified=false` until approved through `PUT /api/vetcare/animal/confirm/:id`, which accepts ADMIN and veterinarians (not for their own animal) and returns 403 otherwise. Sending the current species/breed is not a change. A veterinarian is an active employee (`isEmployee`) whose profile holds the job title referenced by the setting `VETERINARIAN_JOB_TITLE_ID` (`EmployeeQualificationService` in `src/app/employees/employee-qualification.service.ts`, exported by the standalone `EmployeeQualificationModule` for reuse without circular imports). Without a valid setting nobody is a veterinarian and only administrators approve; the referenced job title must also be active (`is_active = 1`, checked with the assignment, fail closed). `VETERINARIAN_JOB_TITLE_ID` can be cleared (`null` or `""`, stored as NULL) through PATCH /api/vetcare/system-settings/:id. Creation follows the same rule: an animal is created verified only by an administrator or a veterinarian registering another client's animal (a receptionist's or a client's registration stays `isVerified=false`). Update and confirm lock the animal row (UPDLOCK) in a transaction, so an approval and a concurrent species/breed change serialize. `PUT /api/vetcare/animal/confirm/:id` accepts an optional body `{ expectedSpeciesId?, expectedBreedId? }` with the values the approver reviewed (`expectedBreedId: null` = no breed); when they no longer match it returns 409 (CONFLICT, message only: read the animal again to get the current values). Without a body the contract is unchanged.

Clinical visits record `completed_by` (the account completing it); `voided_at` is never before `started_at` (`ck_vc_clinical_visits_voided_dates`). There is deliberately no CHECK requiring `completed_by` on COMPLETED visits: legacy completed visits have no known author (see [../database.md](../database.md#reservations-and-clinical-visits)); the rule is enforced by the application only.

## Confirmed rules

- A veterinarian never approves their own animal. `canApprove(actor, isTutor)` (`src/app/animal/animal.business.service.ts`) returns false for a non-administrator who is a tutor of the animal, so PUT /api/vetcare/animal/confirm/:id answers 403. Nuance: on creation "own animal" means the requested owner (`sameId(owner.id, actor.id)`, the only tutor at that point); on update and confirm it means any active tutor (`isActiveTutor`).
