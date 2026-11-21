---
titulo: Employee schedules, blocked times and availability
descricao: Weekly schedules, blocked times and indicative availability.
cobre: [src/app/employee-schedules/**, src/app/blocked-times/**, src/app/availability/**]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

# Employee schedules, blocked times and availability

## Employee schedules, blocked times and availability

Migration `1795694400000` (`SchedulesAndBlocks`) creates `vc_employee_schedules` (FK `fk_vc_employee_schedules_employee`, no cascade, index `ix_vc_employee_schedules_employee_day`) and extends `vc_blocked_times` with `employee_id`, `start_at`, `end_at`, `created_by` and `created_at`. It backfills `start_at`/`end_at` from the legacy `start`/`end`, adds `ck_vc_blocked_times_interval`, the FKs `fk_vc_blocked_times_employee` and `fk_vc_blocked_times_created_by` (no cascade) and the indexes `ix_vc_blocked_times_start_end` and `ix_vc_blocked_times_employee_start`.

- `vc_employee_schedules` (`EmployeeScheduleEntity`) holds the weekly working periods of an employee profile in clinic local time (Europe/Lisbon). `dayOfWeek` (`day_of_week`) runs from 0 = Sunday to 6 = Saturday. `startTime` and `endTime` (`time(0)`, "HH:mm") end after they start, on the same day. `validFrom` is the first clinic date on which the period applies (inclusive, required); `validUntil` is the last one (inclusive; null = open-ended). Several rows for one weekday are several periods; periods of the same weekday with intersecting validity must not overlap (touching periods are allowed).
- Working periods of a date: when no row is valid on that date, the employee works the clinic hours (`CLINIC_POLICY`). When some row is valid, only the rows of that weekday count, so a weekday without a row is a day off. `CLINIC_POLICY` (Monday to Friday, 07:00-20:00) is always the outer envelope: periods are clipped to it and closed days have no working period. `PUT` with an empty list removes the schedule.
- Schedule validation returns 400 (`INVALID_VALUE`): end not after start, a time from 01:00 to 01:59 (the daylight-saving hour), `validUntil` before `validFrom`, overlapping periods, malformed dates, or more than 100 periods.
- `vc_blocked_times` (`BlockedTimeEntity`) stores `[startAt, endAt)` as UTC instants (`start_at`/`end_at`, `datetime2(3)`, `endAt` after `startAt`). A block may span several days and may overlap other blocks. `employeeId` NULL is a clinic-wide closure; otherwise the block is the unavailability of that employee profile. `createdBy` (`created_by`) is the authenticated caller, set by the server, never updated, and NULL for legacy rows. `reason` (255), `name` (255), `description` (240) and `notes` (500) are optional metadata; they predate this migration. The legacy single-day columns (`date`, `time_start`, `time_end`, `start`, `end`) are deprecated: NULL-able, never mapped, never read or written.

| Route | Access | Rule |
| --- | --- | --- |
| GET /api/vetcare/employees/:id/schedules | ADMIN, or the employee itself (`EMPLOYEE` role; others 403) | the profile's periods; unknown profile 404; empty list = clinic hours |
| PUT /api/vetcare/employees/:id/schedules | ADMIN | full replacement in one transaction (200); see the rules below |
| GET /api/vetcare/blocked-times | ADMIN | blocks intersecting `from`/`to`; `employeeId` filters individual blocks of that profile (closures excluded); skip/take; ordered by `startAt` |
| GET /api/vetcare/blocked-times/:id | ADMIN | unknown: 404 |
| POST /api/vetcare/blocked-times | ADMIN | 201; `createdBy` = caller; a closure when `employeeId` is omitted |
| PATCH /api/vetcare/blocked-times/:id | ADMIN | omitted fields keep their values; `employeeId: null` turns the block into a closure |
| DELETE /api/vetcare/blocked-times/:id | ADMIN | 204; frees time, so it never returns a reservation conflict |
| GET /api/vetcare/availability | any authenticated caller | `date` and `serviceId` (required), `employeeId` (optional); free slots only |
| GET /api/vetcare/employees/available/:date | ADMIN | bookable profiles with some free working time on the date; reservations are not considered |

- Creating or changing a block that intersects CONFIRMED reservations returns 409 (`IN_USE`). The message states how many; nothing is cancelled. A closure checks the reservations of every employee; an individual block checks only its employee's. PENDING reservations are not checked here (confirmation checks them again).
- Block errors: unknown `employeeId` 404; profile not active (terminated, or inactive account) 409 (`CONFLICT`); `endAt` not after `startAt`, or an instant without offset, 400. A PATCH that omits `employeeId` returns 409 (`CONFLICT`, "reload and retry") when the block's scope changed meanwhile.
- Replacing a schedule returns 409 (`IN_USE`) when a CONFIRMED reservation not yet finished fits the current schedule but would not fit the new one. PENDING reservations are not checked here. Nothing is cancelled.
- Reservations that occupy employee time (creation with an employee, assignment, confirmation, reschedule) return 409 (`CONFLICT`) when the interval is not inside one working period of the employee (rule `OUTSIDE_EMPLOYEE_SCHEDULE`), when it intersects a closure or the employee's block (`TIME_BLOCKED`), or when it overlaps another CONFIRMED reservation of the employee widened by `RESERVATION_BUFFER_MINUTES` (`EMPLOYEE_UNAVAILABLE`). Creation and reschedule without an employee only check closures, without the applock, because a PENDING reservation occupies no time.
- The rule names above are internal; the HTTP body carries only the global envelope (`status`, `friendlyMessage`, `success`, `result: null`, `errorMetadata`).
- Availability is indicative and computed with plain reads; confirmation re-checks under the applocks. For each employee qualified for the service (see "Clinic services and qualifications") and bookable on the date, it returns slots of the service duration, starting every `slotMinutes` (30) from the start of each working period. It excludes closures, the employee's blocks and their CONFIRMED reservations widened by `RESERVATION_BUFFER_MINUTES`; PENDING reservations occupy nothing; starts not after now are omitted. `startAt`/`endAt` are UTC and `localStart` is clinic time. Reservations and blocks are never exposed. A closed day lists the candidates with empty slots. Errors: unknown service 404; inactive service 409 (`SERVICE_INACTIVE`) for administrators and 404 for everyone else; unknown `employeeId` 404.
