# Validação V.1b: classificação das 60 instruções do `schema:log` (só leitura)

- Base: `vetcare_dev`, ligação por `v-common.js`. Guarda antes de qualquer query: `Guarda OK: DB_NAME=vetcare_dev`. Credenciais não aparecem neste relatório.
- Fonte das instruções: `v1-3d-schema-log.txt` (S), linhas 6 a 65. Instrução n.º 1 = linha 6; n.º 60 = linha 65.
- Caminhos de entidades: `src/app/<pasta>/entities/<ficheiro>`. Migrations: `src/database/migrations/<ficheiro>`. Linhas indicadas são de leitura do ficheiro.
- Não executado: `schema:log`, `schema:sync`, `schema:drop`, `migration:*`, DDL, DML. Único ficheiro do repositório alterado: este relatório.
- `synchronize` = false (`src/database/database.config.ts:29`).
- Legenda de categorias: A = conhecido e documentado. B = objeto só nas migrations, que a entidade não declara (o TypeORM propõe DROP). C = ruído de comparação, definição equivalente. D = desvio real.
- Coluna "BD" vem de `v1b-1-definicoes.txt` e `v1b-2-df-nomes.txt`. Os SELECT estão nos scripts.

## 1. Tabela (60 linhas)

| n.º | instrução (linha do schema:log) | definição na BD | entidade (file:line) | migration (file:line) | categoria | nota |
|---|---|---|---|---|---|---|
| 1 | DROP CONSTRAINT fk_vc_animals_breed_species (L6) | FK composta vc_animals(breed_id, species_id) para vc_breeds(id, species_id); NO_ACTION; confiável; ativa | animal/entities/animal.entity.ts:44 (comentário: existe só na BD), :48 (@JoinColumn breed_id sem FK nomeada) | 1794744000000-UniformSchemaAndAnimalCatalog.ts:103 | A | FK composta documentada. Entidade não a declara por limitação do TypeORM. Sem efeito em runtime. |
| 2 | DROP CONSTRAINT fk_vc_clinical_visits_reservation_animal (L7) | FK composta vc_clinical_visits(reservation_id, animal_id) para vc_reservations(id, animal_id); NO_ACTION; confiável; ativa | clinical-visits/entities/clinical-visit.entity.ts:35 (comentário), :39 | 1795089600000-ReservationsAndClinicalVisits.ts:96 | A | Mesma situação da n.º 1. |
| 3 | DROP CONSTRAINT fk_vc_animal_measurements_clinical_visit (L8) | FK composta vc_animal_measurements(clinical_visit_id, animal_id) para vc_clinical_visits(id, animal_id); NO_ACTION; confiável; ativa | animal-measurements/entities/animal-measurement.entity.ts:53 (comentário), :59 | 1795089600000-ReservationsAndClinicalVisits.ts:153 | A | Mesma situação da n.º 1. |
| 4 | DROP INDEX ix_vc_employee_schedules_employee_day (L9) | NONCLUSTERED (employee_id, day_of_week, valid_from) ASC; INCLUDE (start_time, end_time, valid_until); sem filtro; não único | employee-schedules/entities/employee-schedule.entity.ts:25 (mesmas chaves, sem INCLUDE) | 1795694400000-SchedulesAndBlocks.ts:84-85 (com INCLUDE) | C | Chaves e filtro iguais. O TypeORM conta as colunas INCLUDE como colunas de chave (ver secção 3, mecanismo 1). Se for aplicado, o INCLUDE perde-se (só performance). |
| 5 | DROP INDEX ix_vc_blocked_times_start_end (L10) | NONCLUSTERED (start_at, end_at) ASC; INCLUDE (employee_id); sem filtro | blocked-times/entities/bloked-times.entity.ts:13 (sem INCLUDE) | 1795694400000-SchedulesAndBlocks.ts:122 (INCLUDE employee_id) | C | Mesmo mecanismo da n.º 4. |
| 6 | DROP INDEX ix_vc_blocked_times_employee_start (L11) | NONCLUSTERED (employee_id, start_at) ASC; INCLUDE (end_at); sem filtro | blocked-times/entities/bloked-times.entity.ts:14 | 1795694400000-SchedulesAndBlocks.ts:123 (INCLUDE end_at) | C | Mesmo mecanismo da n.º 4. |
| 7 | DROP INDEX ix_vc_animal_measurements_animal_date (L12) | NONCLUSTERED (animal_id ASC, measured_at DESC, created_at DESC, id DESC); sem INCLUDE; sem filtro; não único | ausente (a entidade declara só ix_vc_animal_measurements_animal_type_date, animal-measurements/entities/animal-measurement.entity.ts:16) | 1794830400000-AnimalMeasurementsAndMetadata.ts:56 (criação). Nenhuma migration o remove. | B | Índice antigo, nunca removido por migration, sem menção em docs/SCHEMA_MIGRATION.md. Sem efeito em runtime. Só sai se o sync correr. |
| 8 | DROP INDEX ix_vc_animal_owners_user_active (L13) | NONCLUSTERED (user_id, animal_id) ASC; INCLUDE (is_primary); filtro ([ended_at] IS NULL); não único | animal-owners/entities/animal-owner.entity.ts:21 (chaves e filtro iguais); comentário :16 diz que o INCLUDE não é expressível | 1795435200000-AnimalOwners.ts:103-104 (com INCLUDE) | C | Documentado no comentário :16. Mesmo mecanismo da n.º 4. |
| 9 | DROP CHECK ck_vc_roles_code (L14) | vc_roles: padrão BIN2 de código (A-Z inicial; A-Z0-9_); confiável; ativa | ausente (roles/entities/role.entity.ts:5 só tem @Unique uq_vc_roles_code) | 1795003200000-UserRolesAndEmployees.ts:79 (catalogCode, template em :65-66) | B | O nome não está escrito na migration: sai do template `ck_${table}_code`. Ativo na BD; sem efeito em runtime. |
| 10 | DROP CHECK ck_vc_job_titles_code (L15) | vc_job_titles: padrão BIN2 de código; confiável; ativa | ausente (job-titles/entities/job-title.entity.ts:5 só @Unique) | 1795003200000-UserRolesAndEmployees.ts:105 (template) | B | Igual à n.º 9. |
| 11 | DROP CHECK ck_vc_employees_dates (L16) | vc_employees: termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date | ausente (employees/entities/employee.entity.ts:7-8 só @Unique e @Index) | 1795003200000-UserRolesAndEmployees.ts:123 | B | Sem efeito em runtime. |
| 12 | DROP CHECK ck_vc_users_email_normalized (L17) | vc_users: datalength(email) = datalength(ltrim(rtrim(email))) AND email BIN2 = lower(email) | ausente (users/entities/users.entity.ts:21-22 só @Index) | 1795003200000-UserRolesAndEmployees.ts:54 | B | Sem efeito em runtime. |
| 13 | DROP CHECK ck_vc_users_nif (L18) | vc_users: nif IS NULL OR nif LIKE 9 dígitos | ausente (users.entity.ts:22 é o índice uq_vc_users_nif, não o CHECK) | 1795003200000-UserRolesAndEmployees.ts:58 | B | Sem efeito em runtime. |
| 14 | DROP CHECK ck_vc_system_settings_code (L19) | vc_system_settings: padrão BIN2 de código | ausente (system-settings/entities/system-setting.entity.ts:5 só @Unique) | 1795003200000-UserRolesAndEmployees.ts:147 (template) | B | Igual à n.º 9. |
| 15 | DROP CHECK ck_vc_reservations_interval (L20) | vc_reservations: end_at > start_at | ausente (reservation/entities/reservation.entity.ts sem @Check) | 1795089600000-ReservationsAndClinicalVisits.ts:61 | B | Sem efeito em runtime. |
| 16 | DROP CHECK ck_vc_reservations_status (L21) | vc_reservations: status em PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW (BIN2) | ausente (reservation.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:62 | B | Sem efeito em runtime. |
| 17 | DROP CHECK ck_vc_reservations_confirmed (L22) | vc_reservations: NOT (status em NO_SHOW, COMPLETED, CONFIRMED) OR (employee_id NOT NULL AND confirmed_at NOT NULL) | ausente (reservation.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:65 | B | Sem efeito em runtime. |
| 18 | DROP CHECK ck_vc_reservations_pending (L23) | vc_reservations: status <> PENDING OR confirmed_at IS NULL | ausente (reservation.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:67 | B | Sem efeito em runtime. |
| 19 | DROP CHECK ck_vc_reservations_cancelled (L24) | vc_reservations: (status = CANCELLED AND cancelled_at NOT NULL) OR (status <> CANCELLED AND cancelled_at NULL) | ausente (reservation.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:68 | B | Sem efeito em runtime. |
| 20 | DROP CHECK ck_vc_reservation_history_action (L25) | vc_reservation_history: action em 9 valores, incluindo CLIENT_CHANGED (BIN2) | ausente (reservation-history/entities/reservation-history.entity.ts sem @Check) | 1795089600000-ReservationsAndClinicalVisits.ts:132; recriado com CLIENT_CHANGED em 1795435200000-AnimalOwners.ts:136 | B | A versão da BD é a da migration AnimalOwners (confirmado). Sem efeito em runtime. |
| 21 | DROP CHECK ck_vc_reservation_history_old_data (L26) | vc_reservation_history: old_data IS NULL OR ISJSON(old_data) = 1 | ausente (reservation-history.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:134 | B | Sem efeito em runtime. |
| 22 | DROP CHECK ck_vc_reservation_history_new_data (L27) | vc_reservation_history: new_data IS NULL OR ISJSON(new_data) = 1 | ausente (reservation-history.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:135 | B | Sem efeito em runtime. |
| 23 | DROP CHECK ck_vc_employee_schedules_day_of_week (L28) | vc_employee_schedules: day_of_week >= 0 AND day_of_week <= 6 | ausente (employee-schedules/entities/employee-schedule.entity.ts sem @Check) | 1795694400000-SchedulesAndBlocks.ts:76 | B | Sem efeito em runtime. |
| 24 | DROP CHECK ck_vc_employee_schedules_time (L29) | vc_employee_schedules: end_time > start_time | ausente (employee-schedule.entity.ts) | 1795694400000-SchedulesAndBlocks.ts:77 | B | Sem efeito em runtime. |
| 25 | DROP CHECK ck_vc_employee_schedules_validity (L30) | vc_employee_schedules: valid_until IS NULL OR valid_until >= valid_from | ausente (employee-schedule.entity.ts) | 1795694400000-SchedulesAndBlocks.ts:78 | B | Sem efeito em runtime. |
| 26 | DROP CHECK ck_vc_clinical_visits_status (L31) | vc_clinical_visits: status em IN_PROGRESS, COMPLETED, VOIDED (BIN2) | ausente (clinical-visits/entities/clinical-visit.entity.ts:27 só declara ck_vc_clinical_visits_voided_dates) | 1795089600000-ReservationsAndClinicalVisits.ts:101 | B | Sem efeito em runtime. |
| 27 | DROP CHECK ck_vc_clinical_visits_dates (L32) | vc_clinical_visits: ended_at IS NULL OR ended_at >= started_at | ausente (clinical-visit.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:103 | B | Sem efeito em runtime. |
| 28 | DROP CHECK ck_vc_clinical_visits_in_progress (L33) | vc_clinical_visits: status <> IN_PROGRESS OR ended_at IS NULL | ausente (clinical-visit.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:104 | B | Sem efeito em runtime. |
| 29 | DROP CHECK ck_vc_clinical_visits_completed (L34) | vc_clinical_visits: status <> COMPLETED OR ended_at IS NOT NULL | ausente (clinical-visit.entity.ts) | 1795089600000-ReservationsAndClinicalVisits.ts:105 | B | Sem efeito em runtime. |
| 30 | DROP CHECK ck_vc_clinical_visits_voided (L35) | vc_clinical_visits: (status = VOIDED AND voided_at, voided_by e void_reason NOT NULL e void_reason não vazio) OR (status <> VOIDED AND os três NULL) | ausente (a entidade declara ck_vc_clinical_visits_voided_dates, :27, nome diferente) | 1795089600000-ReservationsAndClinicalVisits.ts:106; substituído por ck_vc_clinical_visits_voided_dates em 1795348800000-IntegrityAndLifecycle.ts:75 | B | Duas versões de CHECK coexistem na BD (esta e a _voided_dates). Sem efeito em runtime. |
| 31 | DROP CHECK ck_vc_blocked_times_interval (L36) | vc_blocked_times: end_at > start_at | ausente (blocked-times/entities/bloked-times.entity.ts:25 é só comentário) | 1795694400000-SchedulesAndBlocks.ts:119 | B | Sem efeito em runtime. |
| 32 | DROP COLUMN vc_reservations.row_version (L37) | rowversion (timestamp), NOT NULL; COUNT de valores não nulos = 0 (tabela com 0 linhas) | reservation/entities/reservation.entity.ts:11 (comentário: exists in SQL but is not mapped) | 1795089600000-ReservationsAndClinicalVisits.ts:55 | A | Documentado em docs/SCHEMA_MIGRATION.md:98 ("`row_version` is not mapped ... it remains available to external tools"). O sync removeria uma coluna que a documentação diz que fica. Sem efeito em runtime. |
| 33 | DROP COLUMN vc_blocked_times.date (L38) | datetime, NULL permitido; COUNT de não nulos = 0 | blocked-times/entities/bloked-times.entity.ts:9-10 ("deliberately not mapped") | 1794657600000-InitialSqlServer.ts:82 (blocked_times); legado em 1795694400000-SchedulesAndBlocks.ts:6-8 ("kept, never dropped here"); docs/SCHEMA_MIGRATION.md:270 | A | Coluna legada de propósito. A migration diz que o drop exige uma migration futura aprovada. Sem dados. |
| 34 | DROP COLUMN vc_blocked_times.time_start (L39) | nvarchar(255), NULL permitido; COUNT de não nulos = 0 | bloked-times.entity.ts:9-10 | criada como [timeStart] em InitialSqlServer.ts:83, renomeada em UniformSchemaAndAnimalCatalog.ts:32; legado em SchedulesAndBlocks.ts:8; docs:270 | A | Igual à n.º 33. |
| 35 | DROP COLUMN vc_blocked_times.time_end (L40) | nvarchar(255), NULL permitido; COUNT de não nulos = 0 | bloked-times.entity.ts:9-10 | criada como [timeEnd] em InitialSqlServer.ts:84, renomeada em UniformSchemaAndAnimalCatalog.ts:32; legado em SchedulesAndBlocks.ts:8; docs:270 | A | Igual à n.º 33. |
| 36 | DROP COLUMN vc_blocked_times.start (L41) | datetime, NULL permitido; COUNT de não nulos = 0 | bloked-times.entity.ts:9-10 | InitialSqlServer.ts:85 (NOT NULL); legado em SchedulesAndBlocks.ts:8; docs:270 | A | Igual à n.º 33. Os valores passaram para start_at/end_at na migration (ver docs:268). |
| 37 | DROP COLUMN vc_blocked_times.end (L42) | datetime, NULL permitido; COUNT de não nulos = 0 | bloked-times.entity.ts:9-10 | InitialSqlServer.ts:86 (NOT NULL); legado em SchedulesAndBlocks.ts:8; docs:270 | A | Igual à n.º 33. |
| 38 | DROP DEFAULT DF_af8f4b1d2bb3fa80e8b52dd31d2 em vc_users.created_at (L43) | df_vc_users_created_at = (sysdatetime()); o nome DF_af8f... não existe na BD (0 linhas) | users/entities/users.entity.ts:82 (@CreateDateColumn sem default) | 1795003200000-UserRolesAndEmployees.ts:48 (DEFAULT SYSDATETIME()) | D | A BD e a migration usam SYSDATETIME(); docs/SCHEMA_MIGRATION.md:39 define SYSDATETIME() como convenção. A entidade não declara default (as outras entidades de auditoria declaram). O TypeORM assume getdate(). Ver secção 2. |
| 39 | ADD DEFAULT DF_af8f4b1d2bb3fa80e8b52dd31d2 getdate() FOR created_at (L44) | pretendido: getdate(); BD: (sysdatetime()) | users.entity.ts:82 | UserRolesAndEmployees.ts:48 | D | Parte do par da n.º 38. |
| 40 | ALTER COLUMN vc_users.updated_at datetime2 NOT NULL (L45) | datetime2 NOT NULL (is_nullable = false); COUNT updated_at NULL = 0 de 1 linha | users.entity.ts:85 (@UpdateDateColumn sem nullable, logo NOT NULL) | UserRolesAndEmployees.ts:49 (NOT NULL) | C | A coluna já é NOT NULL: o ALTER não muda nada. Causa: onUpdate (ver secção 3.2). |
| 41 | DROP DEFAULT DF_1f868ec03fdba1695a65910c619 em vc_users.updated_at (L46) | df_vc_users_updated_at = (sysdatetime()); o nome DF_1f86... não existe (0) | users.entity.ts:85 | UserRolesAndEmployees.ts:49 (df_vc_users_updated_at DEFAULT SYSDATETIME()) | D | Igual à n.º 38. |
| 42 | ADD DEFAULT DF_1f868ec03fdba1695a65910c619 getdate() FOR updated_at (L47) | pretendido: getdate(); BD: (sysdatetime()) | users.entity.ts:85 | UserRolesAndEmployees.ts:49 | D | Parte do par da n.º 41. |
| 43 | DROP INDEX ix_vc_reservations_status_start (L48) | NONCLUSTERED (status, start_at) ASC; sem INCLUDE; sem filtro | reservation/entities/reservation.entity.ts:19 (idêntico) | 1795089600000-ReservationsAndClinicalVisits.ts:74 (idêntico) | C | Definição igual. Saiu porque a coluna status mudou de default (n.º 44): ver secção 3, mecanismo 2. Recriado na n.º 55. |
| 44 | DROP DEFAULT DF_cd41567e93d787ca0b9af42dd93 em vc_reservations.status (L49) | df_vc_reservations_status = (N'PENDING'); o nome DF_cd41... não existe (0) | reservation/entities/reservation.entity.ts:62 (default: ReservationStatus.PENDING = "PENDING") | ReservationsAndClinicalVisits.ts:47 (DEFAULT N'PENDING') | C | Mesmo valor. A diferença textual é N'' e parênteses: o TypeORM normaliza a entidade para 'PENDING' (SqlServerDriver.js:498-520). O nome DROP não existe na BD. |
| 45 | ADD DEFAULT DF_cd41567e93d787ca0b9af42dd93 'PENDING' FOR status (L50) | pretendido: 'PENDING'; BD: (N'PENDING') | reservation.entity.ts:62 | ReservationsAndClinicalVisits.ts:47 | C | Parte do par da n.º 44. |
| 46 | DROP DEFAULT DF_5049945e18bcc9efa64864a0a7a em vc_clinical_visits.status (L51) | df_vc_clinical_visits_status = (N'IN_PROGRESS'); o nome DF_5049... não existe (0) | clinical-visits/entities/clinical-visit.entity.ts:51 (default: ClinicalVisitStatus.IN_PROGRESS) | ReservationsAndClinicalVisits.ts:84 (DEFAULT N'IN_PROGRESS') | C | Igual à n.º 44 (N'' e parênteses). |
| 47 | ADD DEFAULT DF_5049945e18bcc9efa64864a0a7a 'IN_PROGRESS' FOR status (L52) | pretendido: 'IN_PROGRESS'; BD: (N'IN_PROGRESS') | clinical-visit.entity.ts:51 | ReservationsAndClinicalVisits.ts:84 | C | Parte do par da n.º 46. |
| 48 | DROP INDEX ix_vc_animal_measurements_animal_type_date (L53) | NONCLUSTERED (animal_id, measurement_type_id, measured_at DESC, created_at DESC, id DESC); sem INCLUDE; sem filtro | animal-measurements/entities/animal-measurement.entity.ts:16 (mesmas colunas, todas ASC) | ConfigurableMeasurementTypes.ts:85-86 (DESC nas três últimas) | C | Só difere a ordem DESC, que o TypeORM não expressa no @Index. Saiu porque created_at mudou de default (n.º 49): mecanismo 2. Recriado como ASC na n.º 59. |
| 49 | DROP DEFAULT DF_189d06ae2a4a4d421d97f696089 em vc_animal_measurements.created_at (L54) | df_vc_animal_measurements_created_at = (sysdatetime()); o nome DF_189d... não existe (0) | animal-measurement.entity.ts:67 (@CreateDateColumn sem default) | AnimalMeasurementsAndMetadata.ts:44 (DEFAULT SYSDATETIME()) | D | Igual à n.º 38. |
| 50 | ADD DEFAULT DF_189d06ae2a4a4d421d97f696089 getdate() FOR created_at (L55) | pretendido: getdate(); BD: (sysdatetime()) | animal-measurement.entity.ts:67 | AnimalMeasurementsAndMetadata.ts:44 | D | Parte do par da n.º 49. |
| 51 | ALTER COLUMN vc_animal_measurements.updated_at datetime2 NOT NULL (L56) | datetime2 NOT NULL (is_nullable = false); tabela com 0 linhas | animal-measurement.entity.ts:68 (@UpdateDateColumn sem nullable) | AnimalMeasurementsAndMetadata.ts:45 (NOT NULL) | C | Igual à n.º 40: já é NOT NULL. |
| 52 | DROP DEFAULT DF_b3ce9ce6f20c14934e31f5e2e45 em vc_animal_measurements.updated_at (L57) | df_vc_animal_measurements_updated_at = (sysdatetime()); o nome DF_b3ce... não existe (0) | animal-measurement.entity.ts:68 | AnimalMeasurementsAndMetadata.ts:45 (DEFAULT SYSDATETIME()) | D | Igual à n.º 38. |
| 53 | ADD DEFAULT DF_b3ce9ce6f20c14934e31f5e2e45 getdate() FOR updated_at (L58) | pretendido: getdate(); BD: (sysdatetime()) | animal-measurement.entity.ts:68 | AnimalMeasurementsAndMetadata.ts:45 | D | Parte do par da n.º 52. |
| 54 | CREATE UNIQUE INDEX REL_1d2b1396cdda9b098ea0295841 ON vc_employees (user_id) WHERE user_id IS NOT NULL (L59) | JÁ EXISTE unicidade: UNIQUE constraint uq_vc_employees_user_id, NONCLUSTERED, (user_id) ASC, sem filtro; user_id NOT NULL; COUNT = 1 linha, 0 repetidos | employees/entities/employee.entity.ts:7 (@Unique uq_vc_employees_user_id), :12-13 (@OneToOne + @JoinColumn user_id) | UserRolesAndEmployees.ts:121 (CONSTRAINT uq_vc_employees_user_id UNIQUE (user_id)) | C | Não é D: a unicidade existe com o nome uq_vc_employees_user_id, documentada em docs/SCHEMA_MIGRATION.md:62. O TypeORM espera o nome REL_ (relationConstraintName, DefaultNamingStrategy.js:73) e não o encontra. Aplicar criaria um segundo índice único redundante. |
| 55 | CREATE INDEX ix_vc_reservations_status_start (L60) | recriado com a mesma definição da n.º 43 | reservation.entity.ts:19 | ReservationsAndClinicalVisits.ts:74 | C | Recriação da n.º 43. |
| 56 | CREATE INDEX ix_vc_employee_schedules_employee_day ON (employee_id, day_of_week, valid_from) (L61) | recriado sem INCLUDE (start_time, end_time, valid_until), que a BD tem | employee-schedule.entity.ts:25 | SchedulesAndBlocks.ts:84-85 | C | Recriação da n.º 4. Aplicar perderia o INCLUDE. |
| 57 | CREATE INDEX ix_vc_blocked_times_employee_start ON (employee_id, start_at) (L62) | recriado sem INCLUDE (end_at), que a BD tem | bloked-times.entity.ts:14 | SchedulesAndBlocks.ts:123 | C | Recriação da n.º 6. |
| 58 | CREATE INDEX ix_vc_blocked_times_start_end ON (start_at, end_at) (L63) | recriado sem INCLUDE (employee_id), que a BD tem | bloked-times.entity.ts:13 | SchedulesAndBlocks.ts:122 | C | Recriação da n.º 5. |
| 59 | CREATE INDEX ix_vc_animal_measurements_animal_type_date ON (animal_id, measurement_type_id, measured_at, created_at, id) (L64) | recriado em ASC; a BD tem DESC nas três últimas | animal-measurement.entity.ts:16 | ConfigurableMeasurementTypes.ts:85-86 | C | Recriação da n.º 48. A ordem DESC perde-se (sem efeito de correção). |
| 60 | CREATE INDEX ix_vc_animal_owners_user_active ON (user_id, animal_id) WHERE ended_at IS NULL (L65) | recriado sem INCLUDE (is_primary), que a BD tem; filtro equivalente | animal-owner.entity.ts:21 | AnimalOwners.ts:103-104 | C | Recriação da n.º 8. |

## 2. Resumo por categoria

| Categoria | Instruções | n.º | Objetos |
|---|---|---|---|
| A | 9 | 1, 2, 3, 32, 33, 34, 35, 36, 37 | 3 FK compostas, row_version, 5 colunas legadas de vc_blocked_times |
| B | 24 | 7, 9 a 31 | 23 CHECK (todos existem na BD, nenhum declarado com @Check na entidade) e 1 índice (ix_vc_animal_measurements_animal_date) |
| C | 19 | 4, 5, 6, 8, 40, 43, 44, 45, 46, 47, 48, 51, 54, 55 a 60 | 13 índices (6 DROP, 6 CREATE recriados e REL_), 4 DEFAULT com N'' e parênteses, 2 ALTER de updated_at já NOT NULL |
| D | 8 | 38, 39, 41, 42, 49, 50, 52, 53 | 4 DEFAULT: created_at e updated_at de vc_users e de vc_animal_measurements (DROP + ADD) |
| Total | 60 | | 9 + 24 + 19 + 8 = 60 |

Contagem por tipo de instrução: FK 3, DROP INDEX 7, CREATE INDEX 7 (incluindo REL_), DROP CHECK 23, DROP COLUMN 6, DROP/ADD DEFAULT 12, ALTER COLUMN 2. Total 60.

### Lista dos D

Os 4 objetos são: `vc_users.created_at`, `vc_users.updated_at`, `vc_animal_measurements.created_at`, `vc_animal_measurements.updated_at`. Cada um tem um DROP DEFAULT com nome DF_hash e um ADD DEFAULT getdate().

Evidência (saída literal do `v1b-1-definicoes.txt`, secção DEFAULT):

```
{"tabela":"vc_users","coluna":"created_at","nome":"df_vc_users_created_at","definicao":"(sysdatetime())","nome_sistema":false}
{"tabela":"vc_users","coluna":"updated_at","nome":"df_vc_users_updated_at","definicao":"(sysdatetime())","nome_sistema":false}
{"tabela":"vc_animal_measurements","coluna":"created_at","nome":"df_vc_animal_measurements_created_at","definicao":"(sysdatetime())","nome_sistema":false}
{"tabela":"vc_animal_measurements","coluna":"updated_at","nome":"df_vc_animal_measurements_updated_at","definicao":"(sysdatetime())","nome_sistema":false}
```

Evidência de que os nomes do DROP não existem (saída literal do `v1b-2-df-nomes.txt`):

```
#### DF_DO_LOG_EXISTENTES
(0 linha(s))
```

Impacto em runtime:
- Hoje: nenhum que se veja no código. O INSERT do TypeORM no MSSQL manda `DEFAULT` quando o valor é `undefined` (`node_modules/typeorm/query-builder/InsertQueryBuilder.js:561`), por isso a BD aplica `sysdatetime()`. Não testei com um INSERT (não é permitido nesta etapa).
- Se o `schema:sync` correr: o primeiro DROP DEFAULT falha porque o nome `DF_<hash>` não existe na BD. Se os nomes existissem, o default passaria a `getdate()` (`datetime`, cerca de 3 ms) numa coluna `datetime2`, o que muda a precisão dos timestamps gravados.
- Causa do lado da entidade: `users.entity.ts:82, :85` e `animal-measurement.entity.ts:67, :68` não têm `default: () => "SYSDATETIME()"`, ao contrário de `clinical-visit.entity.ts:75-76`, `reservation.entity.ts:70-71`, `employee.entity.ts:24-25` e as outras entidades de auditoria.
- Nota de classificação: marquei D porque a BD, a migration e a documentação concordam em SYSDATETIME(), e a divergência é semântica (não só textual). A parte que está errada é a entidade. Se preferires tratá-la como B (objeto que a entidade não declara), a mudança é só de rótulo; o conteúdo do relatório não muda.

## 3. Respostas aos casos específicos

### 3.1 REL_1d2b1396cdda9b098ea0295841 (n.º 54): unicidade em vc_employees.user_id

- A BD tem unicidade, com outro nome: `uq_vc_employees_user_id`, UNIQUE constraint NONCLUSTERED, coluna `(user_id) ASC`, sem filtro. A migration `UserRolesAndEmployees.ts:121` cria-a e `docs/SCHEMA_MIGRATION.md:62` documenta-a.
- Saída literal (`v1b-1-definicoes.txt`, INDICE):

```
{"tabela":"vc_employees","indice":"uq_vc_employees_user_id","tipo":"NONCLUSTERED","unico":true,"e_unique_constraint":true,"pk":false,"desativado":false,"tem_filtro":false,"filtro":null,"incluida":false,"ordem":1,"pos_coluna":1,"descendente":false,"coluna":"user_id"}
```

- Duplicados: `{"linhas":1,"user_id_nao_nulos":1,"user_id_repetidos":0}`. Não há dois perfis para o mesmo utilizador.
- Por isso é C e não D. O TypeORM propõe o REL_ porque a relação `@OneToOne` gera um nome de unicidade `REL_<sha1>` (`node_modules/typeorm/naming-strategy/DefaultNamingStrategy.js:73`) e não o encontra na BD. A cláusula `WHERE user_id IS NOT NULL` é gerada pelo TypeORM; não investiguei a ramificação exata. Se fosse aplicado, ficaria um segundo índice único redundante.

### 3.2 ALTER COLUMN updated_at datetime2 NOT NULL (n.º 40 em vc_users, n.º 51 em vc_animal_measurements)

- Nulidade na BD: NOT NULL nas duas tabelas (`anulavel: false`).
- Migration: NOT NULL em `UserRolesAndEmployees.ts:49` (vc_users) e `AnimalMeasurementsAndMetadata.ts:45` (vc_animal_measurements).
- Entidade: `users.entity.ts:85` e `animal-measurement.entity.ts:68`, ambos `@UpdateDateColumn` sem `nullable`, logo NOT NULL.
- Linhas com updated_at NULL: vc_users = 0 (1 linha no total); vc_animal_measurements = 0 (tabela vazia).

```
{"linhas":1,"updated_at_nulos":0,"updated_at_nao_nulos":1}
{"linhas":0,"updated_at_nulos":null,"updated_at_nao_nulos":0}
```

- Causa do ALTER: em `node_modules/typeorm/metadata/ColumnMetadata.js:247-249`, uma coluna `@UpdateDateColumn` recebe `onUpdate = getdate()` no metadata. O loader do MSSQL não preenche `onUpdate` nas colunas (em `SqlServerQueryRunner.js` só há `onUpdate` de FKs, linhas 2096-2266). `BaseQueryRunner.js:301-338` compara `oldColumn.onUpdate !== newColumn.onUpdate` (linha 336), dá diferença, e `SqlServerQueryRunner.js:942` emite o ALTER. Para `created_at` (`isCreateDate`) não há `onUpdate`, por isso não aparece ALTER. Não há alteração real.

### 3.3 Os 7 pares DROP INDEX / CREATE INDEX

O pedido fala de 7 pares. Na saída há 7 DROP e 7 CREATE, mas só 6 pares com o mesmo nome. Há um DROP órfão (n.º 7, B) e um CREATE órfão (n.º 54, REL_, C). Os mecanismos são estes:

- Mecanismo 1: índices com INCLUDE (n.º 4, 5, 6, 8). `RdbmsSchemaBuilder.js:286` e `:319` comparam `indexMetadata.columns.length !== tableIndex.columnNames.length`. O loader do MSSQL (`SqlServerQueryRunner.js:1737-1744`) não filtra `is_included_column`, por isso as colunas INCLUDE entram em `columnNames`. Ex.: `ix_vc_blocked_times_start_end` tem 2 chaves + 1 INCLUDE = 3, a entidade tem 2, logo DROP. Depois `createNewIndices` recria sem INCLUDE. A comparação não olha para `where` nem para a ordem DESC.
- Mecanismo 2: índices que contêm uma coluna com default alterado (n.º 43 `status`, n.º 48 `created_at`). `RdbmsSchemaBuilder.js:596-610` (`updateExistColumns`) chama `dropColumnCompositeIndices` (`:610`, definição em `:818`), que larga todos os índices compostos com essa coluna. Por isso a definição é igual e mesmo assim sai. Depois `createNewIndices` recria.
- Mecanismo 3: n.º 7 (`ix_vc_animal_measurements_animal_date`) não está na entidade. `dropOldIndices` (`RdbmsSchemaBuilder.js:294`) larga qualquer índice cujo nome não esteja no metadata.
- Os 7 DROP INDEX, por ordem: n.º 4 (INCLUDE), n.º 5 (INCLUDE), n.º 6 (INCLUDE), n.º 7 (órfão, B), n.º 8 (INCLUDE), n.º 43 (default de status), n.º 48 (default de created_at).

### 3.4 Os 23 DROP CONSTRAINT de CHECK

- Todos os 23 existem na BD (saída `v1b-1-definicoes.txt`, CHECK). A definição de cada um bate, semanticamente, com a migration: 20 comparados diretamente com o texto (o `ck_vc_clinical_visits_voided` só na primeira parte da cláusula) e 3 (`ck_vc_*_code`) pelo template `catalogCode`, que usa o mesmo padrão BIN2.
- Nenhum tem `@Check` com o mesmo nome nas entidades. As entidades só declaram `ck_vc_animal_measurements_deleted`, `..._clinical_not_deleted`, `ck_vc_animal_owners_dates`, `..._ended`, `..._end_reason`, `ck_vc_services_code`, `ck_vc_services_duration`, `ck_vc_measurement_types_code` e `ck_vc_clinical_visits_voided_dates`. Nenhum desses está no DROP.
- Mecanismo: `RdbmsSchemaBuilder.js:333-` (`dropOldChecks`) larga todo CHECK da BD cujo nome não esteja em `metadata.checks`.
- Os três `ck_vc_*_code` (n.º 9, 10, 14) não aparecem pelo nome nas migrations: vêm do template `catalogCode` em `UserRolesAndEmployees.ts:65-66`, chamado em :79, :105 e :147.

### 3.5 row_version (n.º 32) e a frase "deliberately not mapped"

- A frase "deliberately not mapped" não existe em `docs/SCHEMA_MIGRATION.md` (0 ocorrências). Existe em `src/app/blocked-times/entities/bloked-times.entity.ts:10` (sobre as colunas legadas de vc_blocked_times) e também aparece em `memoria/plano.md` e `memoria/auditoria/7.1b-migrations.md`.
- Para row_version, o documento é `docs/SCHEMA_MIGRATION.md:98`: "`row_version` is not mapped: the API serializes changes with UPDLOCK ... it remains available to external tools." Também `reservation.entity.ts:11`.

## 4. Pontos de atenção (sem correções feitas)

1. `synchronize` = false, por isso nada disto corre hoje. Se o `schema:sync` ou `synchronize: true` forem usados, o TypeORM faria: (a) falhar nos 6 DROP DEFAULT com nomes que não existem na BD; (b) remover 23 CHECK de integridade que as migrations criaram e que a BD continua a impor (nenhuma entidade os declara); (c) remover row_version, que `docs/SCHEMA_MIGRATION.md:98` diz que fica; (d) remover as 5 colunas legadas de vc_blocked_times, que `docs/SCHEMA_MIGRATION.md:270` diz que só saem com migration aprovada; (e) remover ix_vc_animal_measurements_animal_date. Recomendação: manter `synchronize` false e não correr `schema:sync`.
2. Os 4 INCLUDE e o DESC perder-se-iam num sync, ainda que a correção não mude.
3. As entidades não declaram 23 CHECK. Se alguém quiser sincronizar no futuro, é preciso decidir se os CHECK ficam em migrations (com documentação) ou se passam a `@Check`.

## 5. SELECT e scripts usados

Scripts (só SELECT sobre catálogos e COUNT de colunas; guarda `connect()` ativa):
- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v1b-1-definicoes.js` (saída: `...\scratchpad\v1b-1-definicoes.txt`). Consultas: CHECK (`sys.check_constraints`), DEFAULT (`sys.default_constraints` + `sys.columns`), INDICE (`sys.indexes` + `sys.index_columns` + `sys.columns`), COLUNA (`sys.columns` + `sys.tables` + `sys.types`), CONTAGEM_USERS, CONTAGEM_MEDICOES, CONTAGEM_ROW_VERSION, CONTAGEM_BLOQUEIOS, CONTAGEM_EMPLOYEES_USER, FK_COMPOSTAS (`sys.foreign_keys` + `sys.foreign_key_columns`).
- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v1b-2-df-nomes.js` (saída: `...\scratchpad\v1b-2-df-nomes.txt`). Consultas: `sys.default_constraints` com `name IN (6 nomes do log)`, COUNT de nomes `DF%`, COUNT total.

Saída das contagens de colunas (literal, `v1b-1-definicoes.txt`):
```
{"linhas":0,"row_version_nao_nulos":0}
{"linhas":0,"date_nao_nulos":0,"time_start_nao_nulos":0,"time_end_nao_nulos":0,"start_nao_nulos":0,"end_nao_nulos":0,"start_at_nao_nulos":0,"end_at_nao_nulos":0}
```

Saída das FK compostas (literal, `v1b-1-definicoes.txt`):
```
{"nome":"fk_vc_animal_measurements_clinical_visit","tabela_filha":"vc_animal_measurements","tabela_pai":"vc_clinical_visits","nao_confiavel":false,"desativada":false,"acao_delete":"NO_ACTION","colunas_filhas":"clinical_visit_id,animal_id","colunas_pai":"id,animal_id"}
{"nome":"fk_vc_animals_breed_species","tabela_filha":"vc_animals","tabela_pai":"vc_breeds","nao_confiavel":false,"desativada":false,"acao_delete":"NO_ACTION","colunas_filhas":"breed_id,species_id","colunas_pai":"id,species_id"}
{"nome":"fk_vc_clinical_visits_reservation_animal","tabela_filha":"vc_clinical_visits","tabela_pai":"vc_reservations","nao_confiavel":false,"desativada":false,"acao_delete":"NO_ACTION","colunas_filhas":"reservation_id,animal_id","colunas_pai":"id,animal_id"}
```

## 6. Verificação

- `grep -c '^| [0-9]' memoria/evidencias/validacao-v1b.md` = 60 (ver secção 7).

## 7. Evidência da contagem

Comandos e saídas literais (raiz do repositório):

```
$ grep -c '^| [0-9]' memoria/evidencias/validacao-v1b.md
60
$ grep -c '^| [0-9]* | .* | A |' memoria/evidencias/validacao-v1b.md
9
$ grep -c '^| [0-9]* | .* | B |' memoria/evidencias/validacao-v1b.md
24
$ grep -c '^| [0-9]* | .* | C |' memoria/evidencias/validacao-v1b.md
19
$ grep -c '^| [0-9]* | .* | D |' memoria/evidencias/validacao-v1b.md
8
$ grep -o '^| [0-9]* |' memoria/evidencias/validacao-v1b.md | tr -d '| ' | tr '
' ' '
1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60
```

Resultado: 60 linhas classificadas; A 9, B 24, C 19, D 8 (soma 60).

