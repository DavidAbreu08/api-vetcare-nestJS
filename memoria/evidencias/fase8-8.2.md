# Fase 8.2 (documentação): evidência

Alteração única: `docs/API_ORGANIZATION.md` (4 linhas trocadas: (a) linha 147, (b) linha 220, (c) linha 264, (d) linha 265). Sem `git add` nem `commit`. Não foram tocados `src/`, `.claude/`, `CLAUDE.md` nem `memoria/plano.md`.

## 1. `git ls-files --eol` ANTES

Comando: `git ls-files --eol docs/API_ORGANIZATION.md docs/API_ROUTES.md docs/HTTP_RESPONSES.md`

```
i/lf    w/lf    attr/                 	docs/API_ORGANIZATION.md
i/lf    w/lf    attr/                 	docs/API_ROUTES.md
i/lf    w/lf    attr/                 	docs/HTTP_RESPONSES.md
```

## 2. `git ls-files --eol` DEPOIS

Comando: igual ao anterior. Resultado (w/mixed = 0; CR no ficheiro alterado = 0):

```
i/lf    w/lf    attr/                 	docs/API_ORGANIZATION.md
i/lf    w/lf    attr/                 	docs/API_ROUTES.md
i/lf    w/lf    attr/                 	docs/HTTP_RESPONSES.md
CR em docs/API_ORGANIZATION.md: 0
```

Aviso do git, não de conteúdo: "LF will be replaced by CRLF the next time Git touches it" vem de `core.autocrlf=true` em `C:/Program Files/Git/etc/gitconfig`. Não há `.gitattributes`, e o ficheiro continua LF na working copy.

## 3. Locks do perfil `vc_employees` (passo d)

Procura por `pessimistic_write` em `src/app/employees/` e `src/app/users/`, lida linha a linha.

Confirmados (entram na frase do doc):
- `src/app/employees/employees.business.service.ts:200`: `update()`, PATCH /api/vetcare/employees/:id (término/indisponibilidade).
- `src/app/employees/employees.business.service.ts:230`: `delete()`, DELETE /api/vetcare/employees/:id.
- `src/app/users/users.business.service.ts:261`: `delete()` da conta, DELETE /api/vetcare/users/:id (conta travada antes, em :259).
- `src/app/users/users.business.service.ts:283`: `assertNoOpenReservations()` sem perfil já travado, chamado por `update()` em :211 quando `isActive=false` e a conta estava ativa (PATCH /api/vetcare/users/:id).

Encontrados, fora da lista pedida (não entram na frase do doc):
- `src/app/employees/employees.business.service.ts:298`: `replaceServices()`, PUT /api/vetcare/employees/:id/services.
- `src/app/users/users.business.service.ts:366`: `assertEmployeeRoleMatchesProfile()`, PUT /api/vetcare/users/:id/roles (só quando muda o EMPLOYEE).

Sem lock do perfil (só conta ou role): `employees.business.service.ts:177`, `users.business.service.ts:206`, `:326`, `:380`.

Término e visitas IN_PROGRESS:
- `ClinicalVisit` em `src/app/employees/`: só `employees.business.service.ts:12` (import) e `:233` (contagem no DELETE do perfil). O `update()` do término não consulta visitas. `findOpenReservations` (`src/app/reservation/open-reservations.ts`) não referencia visitas. Logo "Termination still does not check IN_PROGRESS visits" mantém-se.

Início de visita (conferido antes de editar):
- `src/app/clinical-visits/clinical-visit.business.service.ts`: reserva travada :178, animal :193, `resolveEmployee` :197 (perfil travado :150, conta lida :151), `isQualifiedForService` :198 (só com `reservationServiceId`), insert :202.
- `src/app/employees/employee-status.ts:17-18`: `isActiveEmployee` exige conta ativa, não apagada e término ausente ou futuro.

## 4. Verificação (e), após a edição

Comando: `grep -n "EMPLOYEE_NOT_QUALIFIED\|Pending decision\|not re-check\|Known limitation" docs/*.md`

```
docs/API_ORGANIZATION.md:140:| POST /api/vetcare/reservations | ADMIN, EMPLOYEE, CLIENT | always PENDING; `createdBy` = caller (never accepted in the body: 400); `serviceId` required (404 unknown, 409 `SERVICE_INACTIVE`); `endAt` = startAt + service `durationMinutes` (optional in the body: the same value is accepted from anyone, a different one only from ADMIN, 400 `END_AT_MISMATCH` otherwise); `employeeId` (pre-assignment, CREATED + EMPLOYEE_ASSIGNED) only for ADMIN (403 otherwise) and qualified for the service (400 `EMPLOYEE_NOT_QUALIFIED`), like PATCH /employee |
docs/API_ORGANIZATION.md:141:| PATCH /api/vetcare/reservations/:id/employee | ADMIN | PENDING only; bookable employee qualified for the reservation's service (400 `EMPLOYEE_NOT_QUALIFIED`; not checked when `serviceId` is null); EMPLOYEE_ASSIGNED or EMPLOYEE_CHANGED; never confirms |
docs/API_ORGANIZATION.md:147:| POST /api/vetcare/clinical-visits | ADMIN, EMPLOYEE | from a CONFIRMED reservation without any visit (VOIDED included; same animal), started only by the employee assigned to the reservation or ADMIN; or without reservation (animalId). Responsible = caller (reservation's employee by default), or any active employee chosen by ADMIN. From a reservation with a service, that responsible employee must hold the service (400 `EMPLOYEE_NOT_QUALIFIED`); walk-ins and reservations without `service_id` are not checked. At most one IN_PROGRESS visit per animal (409 IN_USE, message only; find the visit with GET /api/vetcare/clinical-visits?animalId=...&status=IN_PROGRESS); a concurrent start that violates `uq_vc_clinical_visits_reservation_id` gets the same 409 (`RESERVATION_HAS_VISIT`) |
docs/API_ORGANIZATION.md:164:Nothing is ever cancelled or reassigned automatically: changes that would strand open reservations return 409 so the caller can cancel or reassign them first. "Open reservation" = PENDING or CONFIRMED whose `end_at` is still in the future (UTC); a stale reservation whose end has passed does not block. Known limitation (accepted): an overdue CONFIRMED reservation (end passed, never completed, cancelled or marked NO_SHOW) is therefore not counted as open and does not block these changes; administrators should close such reservations (no-show/cancel). Conflict responses are the global error envelope only (`status` 409, `errorMetadata` IN_USE or CONFLICT, `friendlyMessage`, `result: null`): they never carry id lists or count fields. When useful the number of affected records is part of the readable message (e.g. "The client has 2 open reservations (pending or confirmed, not yet finished); cancel them before deactivating or deleting the account."); clients find the records through GET /api/vetcare/reservations (filters `clientId`, `employeeId`, `animalId`, `status`, `from`) or GET /api/vetcare/clinical-visits. The internal names in the table below identify each rule in code and tests; they are not part of the HTTP body.
docs/API_ORGANIZATION.md:217:- Qualification: when the reservation has a service, the employee (pre-assignment on creation, PATCH /employee, confirm, reschedule) must hold it in `vc_employee_services` (400 `EMPLOYEE_NOT_QUALIFIED`, "The employee is not qualified for this service"), checked inside the transaction after the employee profile lock and before the applock. Reservations created before the catalog (`service_id` NULL) are not checked. An inactive service blocks only new reservations: assign, confirm and reschedule of existing ones do not read the service.
docs/API_ORGANIZATION.md:220:- Visit start (POST /api/vetcare/clinical-visits from a reservation with a service): the responsible employee — the reservation's employee by default, or the one an administrator names — must hold that service (400 `EMPLOYEE_NOT_QUALIFIED`, same message), checked after the employee profile lock and before the visit insert. Walk-ins (no reservation) and reservations with `service_id` NULL are not checked.
```

`docs/HTTP_RESPONSES.md` e `docs/API_ROUTES.md` não enumeram `EMPLOYEE_NOT_QUALIFIED`, logo não receberam alteração. Na tabela de rotas de `API_ORGANIZATION.md`, a linha de `POST /api/vetcare/clinical-visits` recebeu a regra (alínea a). O bullet de qualificação das reservas (linha 217) ficou inalterado: a regra da visita está no bullet da linha 220.

## 5. `git diff --stat -- docs/`

```
 docs/API_ORGANIZATION.md | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)
```

## 6. `git diff -- docs/` (completo)

```diff
diff --git a/docs/API_ORGANIZATION.md b/docs/API_ORGANIZATION.md
index e33a5cd..9d6d181 100644
--- a/docs/API_ORGANIZATION.md
+++ b/docs/API_ORGANIZATION.md
@@ -144,7 +144,7 @@ Instants (`startAt`, `endAt`, `confirmedAt`, `cancelledAt`, `startedAt`, `endedA
 | POST /api/vetcare/reservations/:id/cancel | ADMIN or the reservation's client | PENDING/CONFIRMED without an IN_PROGRESS/COMPLETED visit; the client only before startAt (409 `CANCEL_AFTER_START`), ADMIN at any time; sets cancelledAt |
 | POST /api/vetcare/reservations/:id/no-show | ADMIN | CONFIRMED, without an IN_PROGRESS/COMPLETED visit, after startAt + `RESERVATION_NO_SHOW_TOLERANCE_MINUTES` |
 | GET /api/vetcare/clinical-visits, GET /api/vetcare/clinical-visits/:id | authenticated roles | clinical access below |
-| POST /api/vetcare/clinical-visits | ADMIN, EMPLOYEE | from a CONFIRMED reservation without any visit (VOIDED included; same animal), started only by the employee assigned to the reservation or ADMIN; or without reservation (animalId). Responsible = caller (reservation's employee by default), or any active employee chosen by ADMIN. At most one IN_PROGRESS visit per animal (409 IN_USE, message only; find the visit with GET /api/vetcare/clinical-visits?animalId=...&status=IN_PROGRESS); a concurrent start that violates `uq_vc_clinical_visits_reservation_id` gets the same 409 (`RESERVATION_HAS_VISIT`) |
+| POST /api/vetcare/clinical-visits | ADMIN, EMPLOYEE | from a CONFIRMED reservation without any visit (VOIDED included; same animal), started only by the employee assigned to the reservation or ADMIN; or without reservation (animalId). Responsible = caller (reservation's employee by default), or any active employee chosen by ADMIN. From a reservation with a service, that responsible employee must hold the service (400 `EMPLOYEE_NOT_QUALIFIED`); walk-ins and reservations without `service_id` are not checked. At most one IN_PROGRESS visit per animal (409 IN_USE, message only; find the visit with GET /api/vetcare/clinical-visits?animalId=...&status=IN_PROGRESS); a concurrent start that violates `uq_vc_clinical_visits_reservation_id` gets the same 409 (`RESERVATION_HAS_VISIT`) |
 | PATCH /api/vetcare/clinical-visits/:id | ADMIN or responsible | IN_PROGRESS only (clinicalNotes, description) |
 | POST /api/vetcare/clinical-visits/:id/complete | ADMIN or responsible | IN_PROGRESS -> COMPLETED (endedAt, completedBy = caller's account); its reservation CONFIRMED -> COMPLETED + COMPLETED event |
 | POST /api/vetcare/clinical-visits/:id/void | ADMIN | IN_PROGRESS -> VOIDED with mandatory reason (voidedAt never before startedAt, voidedBy) |
@@ -217,7 +217,7 @@ Bookable services live in `vc_services` (migration `1795608000000`; module `src/
 - Qualification: when the reservation has a service, the employee (pre-assignment on creation, PATCH /employee, confirm, reschedule) must hold it in `vc_employee_services` (400 `EMPLOYEE_NOT_QUALIFIED`, "The employee is not qualified for this service"), checked inside the transaction after the employee profile lock and before the applock. Reservations created before the catalog (`service_id` NULL) are not checked. An inactive service blocks only new reservations: assign, confirm and reschedule of existing ones do not read the service.
 - Responses: `serviceId` and `service { id, code, name, durationMinutes }` (same for every caller; current catalog values, null for legacy reservations). `service` is always present: every reservation loader (detail, list, write responses) joins the relation, and the serializer fails instead of silently omitting it.
 - Referenced ids in a body follow one rule: a missing service is 404 and an inactive service being newly referenced is 409 `SERVICE_INACTIVE` (POST /reservations, PUT /employees/:id/services).
-- Pending decision: starting a clinical visit does not re-check the employee's qualification for the reservation's service (left for a future decision).
+- Visit start (POST /api/vetcare/clinical-visits from a reservation with a service): the responsible employee — the reservation's employee by default, or the one an administrator names — must hold that service (400 `EMPLOYEE_NOT_QUALIFIED`, same message), checked after the employee profile lock and before the visit insert. Walk-ins (no reservation) and reservations with `service_id` NULL are not checked.
 - Deactivating an employee or a service keeps the qualifications; deleting an employee profile (only possible without reservations or visits) removes its qualifications together with its job titles.
 
 ## Employee schedules, blocked times and availability
@@ -261,8 +261,8 @@ Exception: PUT /api/vetcare/users/:id/roles takes the administrator role lock an
 
 - Reservation creation (animal -> client account -> service (shared) -> employee profile -> qualification read -> applock), confirmation and reschedule (reservation -> animal -> client account -> employee profile -> qualification read -> applock) and assignment (reservation -> employee profile -> qualification read -> applock). The employee profile is locked without relations and its account is read in a separate statement after the lock is granted, so it sees changes committed by whoever held the lock (also under READ_COMMITTED_SNAPSHOT).
 - Services and qualifications: creation reads the service with `pessimistic_read` (`HOLDLOCK, ROWLOCK`, held until commit) so a concurrent deactivation or deletion (which takes `UPDLOCK` on the service and nothing else) either commits first and is seen, or waits; shared locks of concurrent bookings are compatible with each other. The qualification check (`vc_employee_services`, plain read) runs right after the employee profile lock and before the applock, like the account re-read; PUT /api/vetcare/employees/:id/services first reads the current qualifications without locks, derives the services to add and reads them with `pessimistic_read` in id order (validating existence and `isActive` in that read), and only then locks the profile: the order service (shared) -> profile is the one of reservation creation, and PATCH/DELETE /services/:id lock only the service, so no cycle forms (the previous order profile -> service read/FK check could deadlock with a service update waiting behind a booking). Under the profile lock the diff is recomputed; if a service that was not locked must now be added (qualifications changed meanwhile) the request fails with 409 `QUALIFICATIONS_CHANGED` instead of reading an unlocked service while holding the profile. It changes qualifications only while holding the profile lock and then reads the open reservations without lock hints, so removing a qualification and assigning/confirming a reservation for that employee serialize (check-then-act). Assign, confirm and reschedule never read the service row, so an inactive service never blocks them.
-- Visit start: reservation -> animal (then the visit insert); complete/void: reservation -> visit; measurements: visit -> measurement.
-- Employee termination/unavailability locks the profile and then *reads* the open reservations without lock hints. Account deactivation/deletion locks the account and then the profile; animal deletion locks the animal (animal update and confirm lock only the animal) and then *reads* the open reservations and the IN_PROGRESS visits without lock hints. Creation with an employee, assignment, confirmation and reschedule lock the profile before they write, so they serialize with termination (check-then-act); because those readers never lock reservations, no cycle can form. Starting a visit locks the reservation (if any) and the animal, not the profile. It serializes with animal deletion (same animal row), but not with termination or with deletion of the employee profile. Profile deletion stays protected by the foreign key: a visit that references the profile blocks the DELETE. Known limitation (accepted for now): a visit can start for an employee whose profile is being terminated at the same instant.
+- Visit start: reservation -> animal -> employee profile (then the account and qualification reads and the visit insert); complete/void: reservation -> visit; measurements: visit -> measurement.
+- Employee termination/unavailability locks the profile and then *reads* the open reservations without lock hints. Account deactivation/deletion locks the account and then the profile; animal deletion locks the animal (animal update and confirm lock only the animal) and then *reads* the open reservations and the IN_PROGRESS visits without lock hints. Creation with an employee, assignment, confirmation and reschedule lock the profile before they write, so they serialize with termination (check-then-act); because those readers never lock reservations, no cycle can form. Starting a visit locks the reservation (if any), the animal and then the responsible employee profile, and reads the account and the qualification after the profile lock (the pattern of the reservation writes). It therefore serializes with termination or unavailability (PATCH /api/vetcare/employees/:id), account deactivation (PATCH /api/vetcare/users/:id with `isActive=false`), account deletion (DELETE /api/vetcare/users/:id) and profile deletion (DELETE /api/vetcare/employees/:id): a start that waited sees the committed result (terminated or deleted profile, inactive account: 400). Termination still does not check IN_PROGRESS visits: a visit started before the termination stays IN_PROGRESS.
 - Schedule and block applocks (`sp_getapplock`, transaction-owned, 5 s timeout): the clinic closures resource `vc_blocked_times:global` and the employee resource `vc_reservations:employee:<employeeId>`. A timeout, a cancellation or a deadlock victim returns 409 (retry); any other result, or no active transaction, returns 503. Per operation:
   - Global block (`employeeId` NULL): create and update take the closures applock Exclusive; an update then locks the block row (UPDLOCK); both then read the overlapping CONFIRMED reservations without lock hints.
   - Individual block: the employee profile (UPDLOCK), then the employee applock (Exclusive), then the read of that employee's overlapping CONFIRMED reservations.
```

## 8.2b

Etapa 8.2b: três correções pequenas em `docs/API_ORGANIZATION.md`, único ficheiro de documentação alterado nesta etapa. Esta secção foi acrescentada no fim deste ficheiro. Sem `git add` nem `commit`.

### 1. `git ls-files --eol` ANTES

Comando: `git ls-files --eol docs/API_ORGANIZATION.md` (capturado no início da etapa)

```
i/lf    w/lf    attr/                 	docs/API_ORGANIZATION.md
```

### 2. `git ls-files --eol` DEPOIS e contagem de bytes CR

Comando: `git ls-files --eol docs/API_ORGANIZATION.md`

```
i/lf    w/lf    attr/                 	docs/API_ORGANIZATION.md
```

Contagem de bytes CR (node, byte 13) em `docs/API_ORGANIZATION.md`:

```
bytes_CR=0 total_bytes=74578
```

O ficheiro continua LF (`i/lf w/lf`, sem CR). O aviso "LF will be replaced by CRLF" é de `core.autocrlf=true` (ver secção 2 acima) e não é alteração de conteúdo.

### 3. Confirmação de `replaceServices` antes da edição 1

Ficheiro `src/app/employees/employees.business.service.ts`:
- :280 `replaceServices(id, dto)` abre a transação.
- :283 `findOne(EmployeeEntity)` sem lock; :285 `currentServiceIds` sem lock (qualificações atuais).
- :289 `find(ClinicServiceEntity)` com `pessimistic_read`, só para os serviços a adicionar (ordem `id ASC`).
- :298 `findOne(EmployeeEntity)` com `lock: { mode: "pessimistic_write" }` (trava o perfil).
- :312 `delete(EmployeeServiceEntity)` em `vc_employee_services` (só se houver serviços removidos).
- :314 `insert(EmployeeServiceEntity)` em `vc_employee_services`.

Confirmado: o lock do perfil (:298) acontece antes de todas as escritas em `vc_employee_services` (:312 e :314).

Código do erro da frase nova: `src/app/clinical-visits/clinical-visit.business.service.ts:199` lança `INVALID_VALUE` (400) com `code: "EMPLOYEE_NOT_QUALIFIED"`. O spec `clinical-visit.business.service.spec.ts:152` espera status 400. Confirmado.

### 4. Edições

- Passo 2, linha 255: inserido, logo após o primeiro "; " (depois de `vc_animal_measurements`), o segmento "`vc_reservations` -> `vc_animals` -> `vc_employees` -> reads of the employee's `vc_users` row and `vc_employee_services` -> insert into `vc_clinical_visits` (visit start); ". O resto da linha ficou igual.
- Passo 1, linha 265: a frase "It therefore serializes ... (terminated or deleted profile, inactive account: 400)." foi substituída pela versão pedida. Acrescentam-se PUT /api/vetcare/employees/:id/services (400 `EMPLOYEE_NOT_QUALIFIED`) e "It also serializes with animal deletion (same animal row)." O resto da linha ficou igual.

### 5. Verificação do passo 3: `grep -n "Known limitation\|Pending decision" docs/API_ORGANIZATION.md`

```
164:Nothing is ever cancelled or reassigned automatically: changes that would strand open reservations return 409 so the caller can cancel or reassign them first. "Open reservation" = PENDING or CONFIRMED whose `end_at` is still in the future (UTC); a stale reservation whose end has passed does not block. Known limitation (accepted): an overdue CONFIRMED reservation (end passed, never completed, cancelled or marked NO_SHOW) is therefore not counted as open and does not block these changes; administrators should close such reservations (no-show/cancel). Conflict responses are the global error envelope only (`status` 409, `errorMetadata` IN_USE or CONFLICT, `friendlyMessage`, `result: null`): they never carry id lists or count fields. When useful the number of affected records is part of the readable message (e.g. "The client has 2 open reservations (pending or confirmed, not yet finished); cancel them before deactivating or deleting the account."); clients find the records through GET /api/vetcare/reservations (filters `clientId`, `employeeId`, `animalId`, `status`, `from`) or GET /api/vetcare/clinical-visits. The internal names in the table below identify each rule in code and tests; they are not part of the HTTP body.
```

A única ocorrência (linha 164, "Known limitation (accepted)") trata de reservas CONFIRMED vencidas e de desativação ou eliminação de conta. Não tem relação com o início de consulta e não foi alterada. Não sobra "Pending decision" nem "Known limitation" sobre o início de consulta.

### 6. `git diff -U0 -- docs/API_ORGANIZATION.md` (completo)

```diff
diff --git a/docs/API_ORGANIZATION.md b/docs/API_ORGANIZATION.md
index e33a5cd..e4db838 100644
--- a/docs/API_ORGANIZATION.md
+++ b/docs/API_ORGANIZATION.md
@@ -147 +147 @@ Instants (`startAt`, `endAt`, `confirmedAt`, `cancelledAt`, `startedAt`, `endedA
-| POST /api/vetcare/clinical-visits | ADMIN, EMPLOYEE | from a CONFIRMED reservation without any visit (VOIDED included; same animal), started only by the employee assigned to the reservation or ADMIN; or without reservation (animalId). Responsible = caller (reservation's employee by default), or any active employee chosen by ADMIN. At most one IN_PROGRESS visit per animal (409 IN_USE, message only; find the visit with GET /api/vetcare/clinical-visits?animalId=...&status=IN_PROGRESS); a concurrent start that violates `uq_vc_clinical_visits_reservation_id` gets the same 409 (`RESERVATION_HAS_VISIT`) |
+| POST /api/vetcare/clinical-visits | ADMIN, EMPLOYEE | from a CONFIRMED reservation without any visit (VOIDED included; same animal), started only by the employee assigned to the reservation or ADMIN; or without reservation (animalId). Responsible = caller (reservation's employee by default), or any active employee chosen by ADMIN. From a reservation with a service, that responsible employee must hold the service (400 `EMPLOYEE_NOT_QUALIFIED`); walk-ins and reservations without `service_id` are not checked. At most one IN_PROGRESS visit per animal (409 IN_USE, message only; find the visit with GET /api/vetcare/clinical-visits?animalId=...&status=IN_PROGRESS); a concurrent start that violates `uq_vc_clinical_visits_reservation_id` gets the same 409 (`RESERVATION_HAS_VISIT`) |
@@ -220 +220 @@ Bookable services live in `vc_services` (migration `1795608000000`; module `src/
-- Pending decision: starting a clinical visit does not re-check the employee's qualification for the reservation's service (left for a future decision).
+- Visit start (POST /api/vetcare/clinical-visits from a reservation with a service): the responsible employee — the reservation's employee by default, or the one an administrator names — must hold that service (400 `EMPLOYEE_NOT_QUALIFIED`, same message), checked after the employee profile lock and before the visit insert. Walk-ins (no reservation) and reservations with `service_id` NULL are not checked.
@@ -255 +255 @@ Every transaction acquires row locks (`UPDLOCK`, via `pessimistic_write`) in thi
-`vc_reservations` -> `vc_animals` -> `vc_clinical_visits` -> `vc_animal_measurements`; `vc_reservations` -> `vc_animals` -> `vc_users` -> `vc_services` (shared lock, creation only) -> `vc_employees` -> read of `vc_employee_services` -> clinic closures applock (`vc_blocked_times:global`, Shared) -> employee schedule applock (Exclusive, `sp_getapplock`) -> reads under the applocks (schedules, blocks, overlapping CONFIRMED reservations); `vc_services` (shared lock on the services to add, by id) -> `vc_employees` -> writes to `vc_employee_services` (PUT /employees/:id/services; same service -> profile order as reservation creation; reads open reservations without lock hints); `vc_services` alone (service update/deletion; deletion then counts references without lock hints); `vc_reservations` (by id) -> `vc_animals` -> `vc_users` (accounts, by id) -> writes to `vc_animal_owners`/`vc_reservations` (tutorship changes); `vc_users` -> `vc_reset_tokens`; `vc_users` -> `vc_employees` -> `vc_roles` (last-administrator check); `vc_users` -> `vc_animal_owners` (account deletion / CLIENT removal: read primary rows, close secondary rows); `vc_system_settings` -> `vc_job_titles` (setting update; job-title deactivation/deletion locks only the job title and then reads the settings without lock hints).
+`vc_reservations` -> `vc_animals` -> `vc_clinical_visits` -> `vc_animal_measurements`; `vc_reservations` -> `vc_animals` -> `vc_employees` -> reads of the employee's `vc_users` row and `vc_employee_services` -> insert into `vc_clinical_visits` (visit start); `vc_reservations` -> `vc_animals` -> `vc_users` -> `vc_services` (shared lock, creation only) -> `vc_employees` -> read of `vc_employee_services` -> clinic closures applock (`vc_blocked_times:global`, Shared) -> employee schedule applock (Exclusive, `sp_getapplock`) -> reads under the applocks (schedules, blocks, overlapping CONFIRMED reservations); `vc_services` (shared lock on the services to add, by id) -> `vc_employees` -> writes to `vc_employee_services` (PUT /employees/:id/services; same service -> profile order as reservation creation; reads open reservations without lock hints); `vc_services` alone (service update/deletion; deletion then counts references without lock hints); `vc_reservations` (by id) -> `vc_animals` -> `vc_users` (accounts, by id) -> writes to `vc_animal_owners`/`vc_reservations` (tutorship changes); `vc_users` -> `vc_reset_tokens`; `vc_users` -> `vc_employees` -> `vc_roles` (last-administrator check); `vc_users` -> `vc_animal_owners` (account deletion / CLIENT removal: read primary rows, close secondary rows); `vc_system_settings` -> `vc_job_titles` (setting update; job-title deactivation/deletion locks only the job title and then reads the settings without lock hints).
@@ -264,2 +264,2 @@ Exception: PUT /api/vetcare/users/:id/roles takes the administrator role lock an
-- Visit start: reservation -> animal (then the visit insert); complete/void: reservation -> visit; measurements: visit -> measurement.
-- Employee termination/unavailability locks the profile and then *reads* the open reservations without lock hints. Account deactivation/deletion locks the account and then the profile; animal deletion locks the animal (animal update and confirm lock only the animal) and then *reads* the open reservations and the IN_PROGRESS visits without lock hints. Creation with an employee, assignment, confirmation and reschedule lock the profile before they write, so they serialize with termination (check-then-act); because those readers never lock reservations, no cycle can form. Starting a visit locks the reservation (if any) and the animal, not the profile. It serializes with animal deletion (same animal row), but not with termination or with deletion of the employee profile. Profile deletion stays protected by the foreign key: a visit that references the profile blocks the DELETE. Known limitation (accepted for now): a visit can start for an employee whose profile is being terminated at the same instant.
+- Visit start: reservation -> animal -> employee profile (then the account and qualification reads and the visit insert); complete/void: reservation -> visit; measurements: visit -> measurement.
+- Employee termination/unavailability locks the profile and then *reads* the open reservations without lock hints. Account deactivation/deletion locks the account and then the profile; animal deletion locks the animal (animal update and confirm lock only the animal) and then *reads* the open reservations and the IN_PROGRESS visits without lock hints. Creation with an employee, assignment, confirmation and reschedule lock the profile before they write, so they serialize with termination (check-then-act); because those readers never lock reservations, no cycle can form. Starting a visit locks the reservation (if any), the animal and then the responsible employee profile, and reads the account and the qualification after the profile lock (the pattern of the reservation writes). It therefore serializes with termination or unavailability (PATCH /api/vetcare/employees/:id), account deactivation (PATCH /api/vetcare/users/:id with `isActive=false`), account deletion (DELETE /api/vetcare/users/:id), profile deletion (DELETE /api/vetcare/employees/:id) and qualification changes (PUT /api/vetcare/employees/:id/services): a start that waited sees the committed result (terminated or deleted profile, inactive account: 400; qualification removed: 400 `EMPLOYEE_NOT_QUALIFIED`). It also serializes with animal deletion (same animal row). Termination still does not check IN_PROGRESS visits: a visit started before the termination stays IN_PROGRESS.
```

O diff inclui também alterações de passos anteriores que já estavam no working tree (hunks das linhas 147 e 220, e a linha 264 "Visit start"). Nesta etapa são acrescentados o hunk da linha 255 e a nova redação da linha 265.

### 7. Ficheiros alterados nesta etapa

- `docs/API_ORGANIZATION.md`: linhas 255 e 265.
- `memoria/evidencias/fase8-8.2.md`: esta secção 8.2b (acrescentada no fim).
