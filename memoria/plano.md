# Plano — Concluir migração backend VetCare (5B → 6 → 7)

Objetivo (/goal colado pelo utilizador em 2026-11-17): concluir 5B (horários/bloqueios/disponibilidade),
implementar fase 6 (integridade clínica), auditar fases 0–6 (fase 7), corrigir Crítico/Alto, validar, entregar.
Ordem obrigatória: recuperar → 5B → 6 → 7 → corrigir → validar → entregar.

Regras: sem reset/clean/force push; commits separados por fase (só ficheiros da fase — NÃO incluir `.claude/`,
`CLAUDE.md`, `memoria/`, que são alterações do utilizador/estado); **push só com autorização explícita**; não
mudar contratos sem aprovação; sem funcionalidades novas na fase 7; sem restrição de proximidade temporal ao iniciar
consulta. Distinguir: implementado / testado com mocks / validado em SQL Server real.

Plano anterior (teste do fluxo orchestrator) arquivado em `memoria/teste-orchestrator/plano-teste-fluxo.md`.
Evidências em `memoria/evidencias/`, relatórios de auditoria em `memoria/auditoria/`.

## 0. Recuperação — CONCLUÍDA ✅ (orchestrator)
- Branch `feat/reservations-clinical-visits`, HEAD `774fa91 "up mid implementation"` = código 5B (já em origin).
  Não dá para reescrever (exigiria force push) → o "commit específico" da 5B será um commit novo por cima.
- Baseline no tree atual (corrido hoje no teste do fluxo): tsc 0 erros; jest 48 suites / 456 testes OK.
- Migrations: 1794657600000 … 1795694400000 (SchedulesAndBlocks, THROW 51090–51099). Próxima: 1795780800000.
- TypeORM 0.3.20, mssql 10.0.5. Insert/update do TypeORM usam `OUTPUT … INTO @OutputTable` → compatível com
  triggers (erro 334 só ocorre com OUTPUT sem INTO; soft-delete usa OUTPUT sem INTO → verificar que reservas/consultas
  não usam soft-delete/`.returning()`).
- **Achado R3**: o TypeORM corre tudo via `request.query()` → tedious `execSql` → `sp_executesql`; um `SET` dentro
  de sp_executesql é revertido no fim da chamada. Logo `manager.query("SET LOCK_TIMEOUT …")` NÃO funciona; tem de ir
  como batch real (`queryRunner.databaseConnection.request().batch(...)`, o objeto Transaction do mssql). mssql não faz
  reset de sessão ao devolver a conexão ao pool → é obrigatório repor `SET LOCK_TIMEOUT -1` antes do fim.
- Docs da 5B em falta: SCHEMA_MIGRATION (1795694400000), API_ROUTES (availability, schedules; nota 7 obsoleta),
  API_ORGANIZATION (horários/bloqueios/disponibilidade + applocks na ordem de locks).
- 5B não tem testes unitários próprios para policy de horários, disponibilidade, bloqueios, substituição de horários.
- BD: só existe `vetcare_dev` local (dev, não "teste segura" declarada) → NÃO correr migrations sem autorização.
- Decisões 1–27: não encontradas numeradas no repo nem em `D:\my-own-projects\Projeto\docs` (RELATORIO_IMPLEMENTACAO.md
  referenciado mas inexistente) → auditar só as documentadas.

### Análise de locks 5B (orchestrator)
Ordem: linhas (reservation → animal → client account → service(S) → employee profile) → applock closures (Shared;
bloqueio global Exclusive) → applock do funcionário (Exclusive). Bloqueio individual: profile → applock funcionário.
PUT schedules: profile → applock funcionário. PATCH blocked-time: applocks → linha do bloqueio (nenhum fluxo espera por
applock segurando linha de bloqueio; DELETE só bloqueia a linha) → sem ciclo, mas a frase "applocks são sempre os
últimos locks" está imprecisa → corrigir na doc. Transferência de tutores não usa applocks e nunca espera por eles → sem
ciclo. Leituras simples de reservas sob applock: S compatível com UPDLOCK (U) → sem ciclo.

## Fase 5B — CONCLUÍDA ✅ (commit 8c66d8b)
| Etapa | O quê | Ficheiros | Pronto quando | Estado |
|---|---|---|---|---|
| 5B.1 | Doc migration SchedulesAndBlocks | docs/SCHEMA_MIGRATION.md | secção nova; códigos 51090–51099 batem 1:1 com o .ts (grep) | ✅ verificado (51090-93, 51099 iguais; +23/-0) |
| 5B.2 | Doc rotas 5B | docs/API_ROUTES.md | todas as rotas de availability/schedules/blocked-times dos controllers listadas com linha correta; nota 7 atualizada | ✅ verificado (99 linhas, todas → decorator certo; 99 decorators) |
| 5B.3 | Doc organização + ordem de locks | docs/API_ORGANIZATION.md | secção 5B + applocks na "Lock order" | ✅ verificado (5B.3-fix: end_at, frase RCSI e parágrafo obsoleto corrigidos; 5B.3-fix2: comentários re-quebrados ≤120 col, cabeçalho blocked-time corrigido — bloqueio individual salta o applock de encerramentos) |
| 5B.4 | Testes policy | specs novas employee-schedule-policy / availability-policy | ✅ verificado (46/46 passaram, re-corrido) |
| 5B.5 | Testes serviços | specs novas blocked-time.business / employee-schedules.business | ✅ verificado (15/15 re-corrido; asserts de ordem: lock:employee→applock→confirmed→save) |
| 5B.6 | Verificação + commit 5B | — | tsc 0, build OK, jest verde; commit só com ficheiros 5B | ✅ commit 8c66d8b (11 ficheiros, local; origin ainda 774fa91 — push aguarda autorização) |

## Fase 4 — decisões a verificar (read-only, paralelo)
| 4.1 | Evidência file:line para as 5 decisões + 2 pendentes | memoria/evidencias/decisoes.md | cada item com citação verificável | ✅ memoria/evidencias/decisoes.md (executor recusou gravar .md; orchestrator gravou e re-verificou itens 1 e 3) |

## Fase 6 — integridade clínica (desenho do orchestrator)
- R1: confirm e reschedule → 409 se existir QUALQUER consulta (VOIDED incluída) da reserva; cancel/no-show mantêm a
  regra atual (só consulta ativa IN_PROGRESS/COMPLETED bloqueia). Check logo após lock da reserva.
- R2: em `start()`, `isUniqueViolationOf(error, "uq_vc_clinical_visits_reservation_id")` → 409 com
  `ClinicalVisitMessage.ReservationHasVisit` (2601 e 2627 testados).
- R3: helper `withLockTimeout` (SET LOCK_TIMEOUT 5000 por batch real dentro da transação; reposição -1 best-effort no
  finally, falha na reposição nunca mascara o erro original). PersistenceService: 1222 → 409 CONFLICT (1205 já existe).
  Aplicar às transações críticas: reservas, consultas (incl. medições via withWritableVisit), bloqueios, horários,
  tutores. Risco residual documentado: transação abortada pelo servidor (1205 / THROW em trigger) liberta a conexão
  antes da reposição → essa conexão fica com teto de 5 s até outra transação crítica repor (efeito: 409 "retry", sem
  impacto em dados).
- Migration `1795780800000-ClinicalIntegrity.ts`, códigos:
  - 51100 triggers já existem; 51101 pré-requisitos em falta (tabelas, colunas, uq_vc_clinical_visits_reservation_id)
  - 51102 dados: reserva COMPLETED sem consulta COMPLETED; 51103 dados: reserva CANCELLED/NO_SHOW/PENDING com consulta
    IN_PROGRESS/COMPLETED (sob TABLOCKX,HOLDLOCK: reservations → clinical_visits)
  - 51104 runtime: alteração de animal_id/reservation_id (ou id) em vc_clinical_visits
  - 51105 runtime: INSERT de consulta ligada a reserva não CONFIRMED (walk-in sem reserva continua permitido)
  - 51106 runtime: reserva passa a COMPLETED (insert ou mudança de status) sem consulta COMPLETED
  - 51107 runtime: reserva passa a CANCELLED/NO_SHOW/PENDING com consulta IN_PROGRESS/COMPLETED
  - 51108 reservado (não usado); 51109 verificação final (2 triggers AFTER, ativos, INSERT+UPDATE, tabela certa)
  - Triggers AFTER INSERT, UPDATE; SET NOCOUNT ON; set-based (multi-row); leituras cruzadas WITH (READCOMMITTEDLOCK)
    (correto também sob RCSI); regras de transição (LEFT JOIN deleted, d.id IS NULL OR status mudou), não de estado.
  - down(): DROP dos 2 triggers (sem perda de dados).
- PersistenceService mapeia 51104–51107 → 409 CONFLICT com mensagens próprias (sem detalhes SQL).
  ATENÇÃO: THROW dentro de trigger pode vir seguido de Msg 3616 (severity 16); o mssql devolve o ÚLTIMO erro e põe os
  anteriores em `precedingErrors` → o mapeamento tem de procurar o número em error + precedingErrors (todos os níveis).
- Trigger de reservas: `IF NOT UPDATE([status]) RETURN` (updates de client_id/employee_id/notas não leem consultas).
- Revisão 5B migration (orchestrator): OK; risco médio a validar em BD real — ALTER COLUMN das colunas legadas falha
  se houver default/índice/estatística nelas (não verificado nas preconditions).
- complete(): manter UPDATE da consulta antes da reserva (teste de ordem).

| Etapa | O quê | Ficheiros | Pronto quando | Estado |
|---|---|---|---|---|
| 6.1 | R1 | reservation.business.service.ts, reservation.messages.ts, spec | testes VOIDED confirm/reschedule 409; cancel/no-show OK | ✅ verificado (72/72 reservation re-corrido; diff revisto: hasAnyVisit em confirm/reschedule, cancel/no-show mantêm hasActiveVisit). Mudança a documentar em 6.6: reschedule com consulta IN_PROGRESS passa a devolver HAS_CLINICAL_VISIT (continua 409) |
| 6.2 | R2 + ordem complete() | clinical-visit.business.service.ts, entity, spec | 2601/2627 → 409 msg específica; teste de ordem | ✅ verificado (25/25 re-corrido; code RESERVATION_HAS_VISIT nos 2 caminhos; ordem via invocationCallOrder). Pendente p/ 6.5: teste antigo "keeps the generic duplicate message for other unique indexes" (spec ~l.161) usa uq_vc_clinical_visits_reservation_id → trocar para outro índice e afirmar Duplicate |
| 6.3 | Mapeamentos 1222 + 51104–51107 | persistence.service.ts, persistence.messages.ts, spec | spec verde | entregue e verificado (21/21; diff revisto). 6.3-fix ✅ verificado (24/24 re-corrido; diff revisto; mutação effectiveErrorNumber→driverErrorNumber derruba 4 testes). Baixo p/ auditoria 7: isUniqueViolationOf/isReferenceViolation só leem o número principal (irrelevante hoje: os triggers não fazem DML) |
| 6.4 | Migration + spec | migrations/1795780800000-ClinicalIntegrity.ts, database/clinical-integrity.migration.spec.ts | spec verde, códigos 51100–51109 | ✅ verificado (SQL lido na íntegra; specs database 5/42 re-corridas; THROW 51100–51107+51109 1x cada; OUTPUT INTO @OutputTable confirmado em Insert/UpdateQueryBuilder; único escritor de status = reservation service + complete(); corrida consulta×cancel → bloqueio mútuo/deadlock 409, nunca dados inválidos). SQL NÃO validado em motor real |
| 6.5 | Helper lock timeout + ligação | core/persistence/lock-timeout.ts (+spec), 5 serviços | spec verde, todos os serviços críticos usam | ✅ verificado pelo orchestrator (executor parou no limite de turnos sem relatório): lock-timeout.ts lido (JSDoc com risco residual; cita SqlServerQueryRunner.js:87 databaseConnection=pool.transaction() e :174 Request(databaseConnection), confirmados); lock-timeout.spec 13/13; ligado nos 5 serviços (grep); 1 teste de ordem SET 5000→queries→-1 em cada uma das 5 áreas; teste antigo da 6.2 corrigido (uq_vc_clinical_visits_id_animal + Duplicate sem code); reservation.sql.spec com stub queryRunner; jest src/app 36 suites/451 testes verdes; tsc 0; CRLF consistente. Desenho: batch via queryRunner.databaseConnection.request().batch (fora do QueryLock do TypeORM e do sp_executesql); mssql Transaction dá EREQINPROG se houver pedido pendente / ENOTBEGUN se abortada → reset best-effort engolido; documentar. Specs dos 5 serviços precisam de stub queryRunner. Medições sem consulta (measurement l.132/141) fora do âmbito |
| 6.6 | Docs fase 6 + Swagger | SCHEMA_MIGRATION, API_ORGANIZATION, HTTP_RESPONSES, controllers | doc coerente com código | ✅ verificado (diff revisto: confirm/reschedule/start/States em API_ORGANIZATION, bullets Lock waits + triggers, tabela SQL em HTTP_RESPONSES, secção ClinicalIntegrity e l.111/113 em SCHEMA_MIGRATION, Swagger confirm/reschedule/start só texto; nenhum DELETE de reservas/consultas na app). VISIT_STARTED mantém o texto (continua verdadeiro: consulta ativa também impede reschedule, via HAS_CLINICAL_VISIT) |
| 6.7 | Revisão orchestrator + verificação + commit 6 | — | tsc/build/jest verdes; commit | gate verde: tsc 0, build 0, jest 54 suites/575 testes (baseline 5B 52/517). ✅ commit abd56ae (25 ficheiros, 918+/34-, sem push). Executor pôs Co-Authored-By Haiku contra a instrução → orchestrator corrigiu só a mensagem com amend local (árvore idêntica a 6337c7a, diff vazio) |

## Fase 7 — auditoria (read-only, paralelo) → memoria/auditoria/*.md
7.7 ✅ feito antecipadamente → memoria/auditoria/7.7-backlog.md (verificado pelo orchestrator: eslint.config.mjs:34
chave inválida "eslint-disable @typescript-eslint/no-unsafe-call"; master remoto 3298c7c à frente do origin/master local
3eff72d; remote canónico github.com/DavidAbreu08/api-vetcare-nestJS (301); npm audit 65 total / 29 prod; gh não instalado).

| 7.1 migrations 1795176000000–1795780800000 | 7.2 conformidade AGENTS.md | 7.3 rotas/Swagger vs docs |
| 7.4 inventário de locks por fluxo | 7.5 build/tsc/jest/eslint | 7.6 entidades vs diagrama ER | 7.7 backlog (remote, audit, eslint) |
Lançadas em paralelo (2026-11-17): 7.1a (migrations 1795176000000–1795435200000), 7.1b (1795521600000–1795780800000), 7.2, 7.3, 7.4, 7.5, 7.6 → relatórios memoria/auditoria/7.X-*.md. 7.3 esgotou 30 turnos sem relatório → relançada dividida: 7.3a (users/employees/catálogos, 49 rotas) e 7.3b (animais/reservas/consultas, 45 rotas), com escrita incremental.
Achados classificados pelo orchestrator (registo):
- 7.6 ✅ relatório (97 l.). #1-4 reclassificado Crítico→ALTO (synchronize off, sem efeito em runtime; mas schema:log/migration:generate propõem DROP/ADD de 8 FKs e SCHEMA_MIGRATION.md:66 diz que os nomes coincidem; confirmado com grep) → correção 7.F1 em curso (foreignKeyConstraintName nas 8 FKs + spec de regressão). Médio: #5 PKs sem primaryKeyConstraintName (PK_animal/PK_blocked_times legados), #6 ix_vc_animal_measurements_animal_date só na BD, #7 INCLUDE/DESC não descritos, #8 = doc (resolvido por 7.F1). Baixo: #9-12 diagrama desatualizado (vc_system_settings, owner_id, assigned_by/ended_by), typo bloked-times.entity.ts, colunas legadas.
- 7.2 ✅ relatório (94 l.). 0 Crítico/0 Alto. Médio → backlog/decisão do utilizador: A1 PUT /animal/confirm/:id é ação (mudar verbo = contrato, exige aprovação); A3 43 `{ code }` internos vs AGENTS.md R4 (não serializados; o /goal já manda "remoção de code interno → backlog"); A4 API_ROUTES.md:129 "409 SERVICE_INACTIVE" (convenção já explicada em API_ORGANIZATION.md:164/:202: nomes internos, não vão no corpo → aceitável); A5 seed-admin.ts:73 imprime error.message (só CLI). Baixo A2,A6-A11,E1 → backlog. Verificado OK: sem mensagens do driver expostas, tradução SQL centralizada, 94 rotas em API_ROUTES.md.
- 7.1a ✅ relatório (93 l.; THROW 5xxxx 57 ocorrências, 0 duplicados). #1 "Alto/Crítico" REJEITADO pelo orchestrator: sp_rename de constraint PRIMARY KEY renomeia automaticamente o índice associado (documentação do sp_rename, Remarks) → 51041 não dispara; acrescentar verificação sys.indexes ao procedimento de BD. #2/#3/#4 (measured_at, assigned_at←created_at GETDATE(), expires_at) reclassificados ALTO→MÉDIO: premissa "processo e servidor em UTC" está documentada (SCHEMA_MIGRATION.md:39, :109, :137, :204; comentários nas migrations) → pré-verificação de fuso do servidor (DATEDIFF(minute, SYSUTCDATETIME(), SYSDATETIME()) = 0) no procedimento de BD + nota no relatório final. Médio backlog: #5 51044 código morto, #6 sem specs de migration p/ MeasurementsHardening/HashedResetTokens/IntegrityAndLifecycle, #7 pk_vc_animal_owners não declarada (= família 7.6 #5), #8 df_* não declarados (sistémico). Baixo #9-14 backlog.
- 7.4 ✅ relatório (127 l.). 0 Crítico/0 Alto; sem ciclo de locks demonstrável; sobreposição CONFIRMED protegida por applock. Médio backlog: F1 start de consulta não trava perfil do funcionário (check-then-act; FK barra a exclusão), F2 changePassword compara senha antiga fora da tx, F3 replaceRoles U→ROLE→AO→P vs delete U→P→ROLE (sem ciclo: serializa no U). Baixo: F4 troca de tutor via PATCH /animal sem withLockTimeout, F5 replaceJobTitles sem lock nos cargos, F6 doc de ordem (API_ORGANIZATION.md:255/:263/:272) desatualizada.
- 7.5 ✅ relatório (256 l.). tsc EXIT 0; build EXIT 0; jest 54/54 suites, 575/575; cobertura linhas 84,28%; sem .only/.skip; sem specs boilerplate; lint EXIT 2 (eslint.config.mjs:34; `npm run lint` tem --fix → não corrido; com cópia da config sem a linha: 12510 problemas, 10286 prettier, 5377 só CRLF). #1 "Alto" bootstrap() sem catch (main.ts:47) reclassificado BAIXO pelo orchestrator: Node v20.17.0 termina o processo com código 1 em unhandled rejection (mesmo efeito do catch+exit). Médio backlog: #2 lint partido (já no backlog 7.7), #3 open-reservations.ts:25,28 chave sem allowlist (8 chamadas, todas literais), #4 13 comparações de enum, #5 availability.service.ts 0% de cobertura, #6 time-utils 23%, #7 1934 no-unsafe-*. Baixo #8-16 backlog. Nota do harness: o relatório mencionava .claude/settings.json (só como ficheiro com aviso LF→CRLF no git diff --check) → nada a fazer.
- 7.3b ✅ relatório (136 l.; 45 rotas batem com API_ROUTES.md; só GET /clinic/hours público; ParseUUIDPipe em todos os @Param). "Alto" A1/A2 (descrição Swagger de GET /animal/all e DELETE /animal/:id fala de tutores/funcionários, mas @Roles(ADMIN) — confirmado animal.controller.ts:33-34, :69-72) reclassificados MÉDIO: só texto, a rota é mais restritiva do que o descrito, sem risco. A3 (doc cancel "ADMIN or the reservation's client" vs @Roles com EMPLOYEE) reclassificado BAIXO: reservation.business.service.ts:314 devolve 403 a quem não é admin nem cliente → o comportamento efetivo bate com o doc. Médio backlog: A4 DELETE tutor sem @ApiOkResponse (= decisão pendente movedReservationIds), A5 36/45 rotas sem resposta Swagger, A6 doc POST /reservations omite 404 de serviço inativo p/ não-admin, A7 doc DELETE tutor omite 409 TUTOR_HAS_OPEN_RESERVATIONS. Baixo A8-A13 backlog.
- 7.3a ✅ relatório (130 l.; 49/49 rotas batem com API_ROUTES.md). F1 "Crítico" (GET /users/clients aceita EMPLOYEE e devolve nif/birthDate/phone/email de todos os clientes) reclassificado ALTO-PRÉ-EXISTENTE pelo orchestrator: confirmado em users.controller.ts:52 + users.business.service.ts:85-89, MAS idêntico no master 3eff72d (`@Roles(Role.ADMIN, Role.FUNCIONARIO)` + select com nif/dateBirth, commit 4ce91bd "endpoints missing for the form Reservation") → não é regressão; corrigir = mudar contrato (EMPLOYEE perde campos ou acesso) → DECISÃO DO UTILIZADOR (não alterar contratos sem aprovação). F2 (GET /employees/me e /:id sem @Roles) → BAIXO (service devolve 403/próprio; efeito = doc). F5 check-email público/enumeração → Médio, pré-existente (master igual), decisão. F4 Médio (Swagger sem respostas), F3 Baixo → backlog.
- 7.1b ✅ relatório (89 l.; 4 specs/35 testes; 57 THROW distintos). #1 "Alto" colunas legadas de vc_blocked_times não mapeadas (schema:log/sync proporiam DROP COLUMN) → MÉDIO: decisão documentada ("deliberately not mapped", tal como row_version em SCHEMA_MIGRATION.md:98), synchronize:false. #2 "Alto" 4 CHECKs de M3 não declarados nas entidades → MÉDIO: sem afirmação na doc de M3, padrão pré-existente (ck_vc_reservations_* também não declarados). Ambos → item de backlog "alinhamento de metadata para schema:log" (CHECKs, PKs, df_*, INCLUDE, colunas legadas, row_version; nunca correr schema:sync). #3 reserva COMPLETED→CONFIRMED sem bloqueio no trigger e #4 sem trigger DELETE → Médio, decisão pendente (junto com R9; 51108 livre). #5 doc SCHEMA_MIGRATION.md:276 sobrepromete cobertura dos triggers → Médio mas é defeito da doc da fase 6 → corrigir (7.F2). #7 doc :255 "created by UniformSchema…" e #8 :291 "row by row" → Baixo, corrigir em 7.F2 (mesma secção). #6, #9-12 Baixo backlog. N1 (premissa: [start]/[end] legados de vc_blocked_times são UTC): no master 3eff72d o service escrevia start = combineDateAndTime(date, timeStart) (hora local do processo) → premissa depende do fuso do processo antigo → ALTO CONDICIONAL: verificação só-leitura obrigatória antes de produção (comparar start com date+time_start no fuso da clínica) → acrescentar ao procedimento de BD (7.V2, depois do executor atual do mesmo ficheiro).
- 7.F1 ✅ verificado pelo orchestrator: diff = exatamente 8 linhas @JoinColumn (+foreignKeyConstraintName) nas 4 entidades; os 8 nomes existem nas migrations 1795003200000/1795089600000 (grep); spec nova src/database/entity-foreign-key-names.spec.ts 3/3 re-corrida; mutação (role_id sem nome) derruba 2 testes; executor: jest 55/578, tsc 0; índice git i/lf nos 4 (reservation-history w/crlf no disco, commit normaliza). schema:log não corrido (sem BD).
- 7.V1 ✅ verificado: validacao-bd.md 770→789 linhas, 0 linhas removidas (diff com cópia original), 3a-7 (sys.indexes vc_reset_tokens), nota de fuso da origem em 2.4, R17/R18, 2 itens de checklist; LF puro; ficheiro editado no repo principal (worktree auto-limpo: `git worktree list` só o principal). Lição: não usar isolation worktree para ficheiros não rastreados (memoria/).
- 7.V2 lançado (R19: premissa UTC de [start]/[end] legados de vc_blocked_times; §8/§9).
- 7.F2 ✅ verificado: só docs/SCHEMA_MIGRATION.md (305→305) e docs/API_ORGANIZATION.md (273→275), LF (0 CR, git ls-files i/lf w/lf), grep das 3 frases antigas vazio; replaceRoles (users.business.service.ts:326/336/338/339) e início de visita (clinical-visit.business.service.ts:165/179/143 sem lock) confirmados no código.
- 7.F2b ✅ verificado: API_ORGANIZATION.md:257 enumera os fluxos de conta (changePassword trava vc_users pelo UPDATE de setPasswordHash, auth.service.ts:122-124; reset/forgot por lockForUpdate :163/:199) e :275 inclui `id` no 51104; CR=0. Backlog Baixo: mensagem do THROW 51104 e HTTP_RESPONSES.md:44 citam só animal/reserva.
- 7.G ✅ gate: tsc exit 0, build exit 0, jest 55/55 suites, 578/578 testes; stage = exatamente 7 ficheiros. O executor parou antes do commit a perguntar pelo trailer (o harness dele indica Haiku). Decisão do orchestrator: manter "Claude Opus 5.5" (regra de atribuição da sessão; 8c66d8b, abd56ae, 8d5de80 e ec1c78b usam este trailer).
- 7.G2: o executor recusou de novo (a atribuição do harness dele indica Haiku). O commit foi criado pelo orchestrator, com um único `git commit -F` sobre o stage já verificado → **9dd0f7c** "fix: name entity foreign keys and correct lock and trigger docs (phase 7 audit)", 7 ficheiros (+80/−14), trailer "Co-Authored-By: Claude Opus 5.5". A branch fica ahead 3 do origin. Sem push.
- 7.V2 ✅ verificado: validacao-bd.md 789→866 linhas, 0 removidas e 77 acrescentadas, CR=0, linha 8 PENDENTE; §3a-8 (pré-condição sys.time_zone_info com 'GMT Standard Time', query de classificação utc/hora_local/ambas/nenhuma, critério de paragem), R19 §6, checklist §7, §8 item 10, §9. Colunas confirmadas no código: [date] datetime, time_start/time_end nvarchar (renomeadas de timeStart/timeEnd), [start]/[end] datetime. Query NÃO executada (sem BD).
- 7.S ✅ verificado: SKILL.md orchestrator-plan v2, com uma linha "Mudança v2", 11 lições, 0 placeholders, LF; o resto do ficheiro ficou intacto.
- **Fase 7: CONCLUÍDA.** Commits locais: 8c66d8b (5B), abd56ae (6), 9dd0f7c (7). A branch está ahead 3 do origin. Push AGUARDA AUTORIZAÇÃO. Validação em SQL Server real PENDENTE (sem BD de teste segura; procedimento em memoria/validacao-bd.md).

## Medição do fuso na origem (R18/R19)
- 2026-11-17: o utilizador respondeu "3 Autorizo" ao item 3 do relatório: queries SÓ DE LEITURA na BD de origem (fuso, R18/R19). Continuam pendentes o push (item 1) e a BD de teste (item 2). Migrations, escrita, testes C e arranque da app continuam proibidos.
- Interpretação: a única origem acessível é `vetcare_dev`, o default de .env.mssql.local. Só avançar se o host for local; se não for, parar e perguntar.
- Atenção: hoje (novembro) o desvio de Lisboa é 0, por isso a query de desvio do §2.4 sozinha é inconclusiva. É preciso o nome do fuso do servidor (CURRENT_TIMEZONE, ou o fuso do Windows/contentor) e as contagens por datas em hora de verão.
- R.A (descoberta: host, fuso do servidor, estado do schema, colunas, contagens) → R.B (query 3a-8 adaptada + contagens R18 por datas em DST) → registo em memoria/evidencias/fuso-origem.md.
- R.A ✅ (verificado pelo orchestrator: evidência sem utilizador/password; script com guarda só SELECT): vetcare_dev local, SQL Server 2025 17.0.1000.7 Developer, fuso do servidor GMT Standard Time (com DST; desvio 0 em novembro), 14 migrations aplicadas, tabelas de R18/R19 com 0 linhas → R18/R19 NÃO mensuráveis nos dados (não há dados antigos); medir na origem real só se um dia houver dados legados. R.B cancelada. Colunas name/description/notes em vc_reset_tokens/vc_blocked_times = esperadas (1794830400000-AnimalMeasurementsAndMetadata.ts:24-31), falso alarme. Evidência: memoria/evidencias/fuso-origem.md.

## Decisões do utilizador (2026-11-17, resposta ao relatório final)
- 3: autorizado (queries só de leitura na origem, ver acima).
- 5: habilitação ao iniciar consulta → **NECESSÁRIA** (mudança de contrato aprovada).
- 6: GET /users/clients com nif/birthDate para EMPLOYEE → fica como está por agora.
- 7: falhas dos triggers (visita COMPLETED muda de estado, COMPLETED→CONFIRMED, sem trigger de DELETE) → ficam como estão por agora.
- 8: corrida entre início de consulta e término do funcionário → **CORRIGIR**.
- 9: check-email → o utilizador perguntou "é suposto?" (respondido no chat; a decisão continua aberta).
- 10: "ok" → verbo de PUT /animal/confirm e remoção do `code` ficam no backlog.
- 1 (2.ª ronda): push já feito pelo utilizador (branch = origin); **autorizado fazer push nos próximos** (push simples, nunca force).
- 2 (2.ª ronda): **vetcare_dev É a BD de testes** → validação real autorizada nela (Fase V). Continua: não destruir dados existentes.
- 4 (2.ª ronda): pediu mais contexto → explicar no chat (DELETE /animal/:id/owners/:userId devolve { movedReservationIds }; falta só o Swagger; opções manter+documentar / remover).
- 9: continua aberta (a/b/c).
- 4 (3.ª ronda): **a)** manter `movedReservationIds` e documentar no Swagger (DTO de resposta `movedReservationIds: string[]`, vazio quando nada mudou). Sem mudança de comportamento. → etapa 4a (depois do commit da Fase 8: mexe em API_ORGANIZATION.md).
- 9 (3.ª ronda): **c)** remover GET /api/vetcare/users/check-email; POST /users (registo) continua público; frontend será refeito (sem preocupação). Nota ao utilizador: o 409 ALREADY_EXISTS de POST /users continua a revelar duplicados; fechá-lo exigiria verificação por email (funcionalidade nova) → backlog. → etapa 9c (commit separado).

## Fase 8 — início de consulta: lock do perfil + habilitação (decisões 5 e 8)
Desenho (orchestrator):
- start(): reserva (UPDLOCK) → animal (UPDLOCK) → leitura de IN_PROGRESS → perfil do responsável (UPDLOCK, sem relations) → leitura da conta em separado → isActiveEmployee → se a reserva tiver service_id: isQualifiedForService(perfil resolvido, service_id), senão 400 INVALID_VALUE `EMPLOYEE_NOT_QUALIFIED` com a mesma mensagem das reservas → insert. É o padrão de requireBookableEmployee (reservation.business.service.ts:402-411).
- Sem verificação: visitas sem reserva (walk-in; a visita não tem service_id) e reservas legadas com service_id NULL.
- Locks: reserva → animal → perfil, a mesma direção da criação, atribuição, confirmação e remarcação. O término, a conta, os horários, os bloqueios e os serviços do funcionário seguram o perfil sem esperar por reserva/animal (só leituras simples) → sem ciclo.
- O término continua a NÃO verificar visitas IN_PROGRESS (comportamento pré-existente, sem corrida: a sequência é serializada).
- 8.1 código + testes (executor) → 8.2 docs (executor) → gate → commit (stage feito pelo executor, commit pelo orchestrator).
- 8.1 ✅ código+spec (executor parou por limite de uso; verificado pelo orchestrator: diff correto, perfil com lock: pessimistic_write sem relations, conta lida depois, habilitação após conta e antes do save; mensagem igual à das reservas; jest clinical-visits 35/35; tsc 0). Falta: mutações M1/M2, Swagger do POST, jest completo, build → 8.1b.
- 8.1b ✅ M1 5 falhas, M2 1, M3 1 (testes certos); sha reposto = original (re-verificado); Swagger do POST com 400 EMPLOYEE_NOT_QUALIFIED; gate executor tsc 0, build 0, jest 55/587. Evidência: memoria/evidencias/fase8-8.1b.md.
- 8.2 ✅ API_ORGANIZATION.md :147, :220, :264, :265 (locks citados re-verificados pelo orchestrator: employees.business.service.ts:200/:230/:298, users.business.service.ts:261/:283/:366). Lacunas aceites p/ 8.2b: repor "serializes with animal deletion", acrescentar PUT /employees/:id/services à lista, cadeia do início de consulta na ordem global :255. Evidência: memoria/evidencias/fase8-8.2.md.
- 8.2b ✅ verificado pelo orchestrator: diff :147/:220/:255/:264/:265 (cadeia do início de consulta na ordem global; PUT /employees/:id/services na lista; "serializes with animal deletion" reposto); w/lf, CR=0; sem "Known limitation"/"Pending decision" do início de consulta (a única "Known limitation" restante, :164, é das CONFIRMED vencidas). Depois: gate final (orchestrator corre tsc/build/jest) → stage com caminhos explícitos → commit → push (autorizado).
- 8.3 ✅ gate do orchestrator: tsc 0, build 0, jest 55/587, sha do serviço = 8b30367f…; stage (executor) só 5 caminhos, --check limpo. **COMMIT c3469c6** (trailer Opus 5.5 conferido) + **push** 9dd0f7c..c3469c6 (sem force). FASE 8 CONCLUÍDA.
- Próximo: 9c (remover check-email) → commit/push → 4a (Swagger movedReservationIds) → commit/push. Sequenciais: ambos mexem em src/routing.spec.ts.
- Correções em curso/fila: 7.V1 (validacao-bd.md: índice do PK reset_tokens + fuso da origem; a correr — lançado com isolation worktree por engano, ficheiro não rastreado → conferir onde escreveu); 7.F2 docs (SCHEMA_MIGRATION :255/:276/:291; API_ORGANIZATION :263/:272 = 7.4 F6); 7.V2 (N1 no procedimento).
Classificação Crítico/Alto/Médio/Baixo pelo orchestrator; corrigir Crítico/Alto no âmbito aprovado; commit.

## Fase V — validação real em vetcare_dev (decisão 2 do utilizador, 2026-11-17)
Regras: guarda DB_NAME()='vetcare_dev' + host local antes de cada lote; credenciais só em memória (nunca impressas); PROIBIDO migration:run/revert, schema:sync/drop, migration:generate, DDL, RESTORE DATABASE; testes T só em BEGIN TRAN…ROLLBACK; testes C1/C2 com fixture de IDs fixos C0000000-… em commit e limpeza dirigida SÓ desses IDs; linhas existentes nunca tocadas; impressão digital (COUNT_BIG + CHECKSUM_AGG(BINARY_CHECKSUM(*)) por tabela) antes e no fim → tem de bater.
- V.0 segurança: guarda 2.4, impressão digital (script reutilizável), BACKUP COPY_ONLY para ficheiro novo + RESTORE VERIFYONLY, db:migrations:show. Pronto: evidencias/validacao-v0.md + fingerprint JSON.
- V.1 leitura: 3a aplicável, 3c Q1–Q8, 3d schema:log, definição dos 2 triggers = texto da migration 1795780800000. Pronto: evidencias/validacao-v1.md com saídas literais e veredicto por item.
- V.2 triggers T0–T12 + 4.3 (rollback). Depois do V.0. Pronto: tabela esperado/obtido + fingerprint igual.
- V.3a C1/C2 (fixture com commit + limpeza). Depois do V.2. V.3b C3 (pool de 1 ligação, reset de LOCK_TIMEOUT) + C4 novo (UPDLOCK do TypeORM em vc_employees bloqueia 2.º pedido → 1222 em ~5 s: primitiva da Fase 8; sem escrita). Fingerprint final.
- V.0 ✅ guarda OK; §2.4 compat 170, desvio 0; migrations:show 14 [X] (última ClinicalIntegrity1795780800000); fingerprint 22 tabelas/38 linhas (compare IGUAL re-verificado, exit 0); sem fugas de credenciais. **BACKUP negado (3013/262, sem permissão)** → sem backup; avança porque nenhum teste toca linhas existentes (T rollback; C só IDs próprios) e fingerprint antes/depois tem de bater. Dizer ao utilizador.
- V.1 ✅ executado (evidencias/validacao-v1.md): 3c Q1–Q8 OK (3 triggers, 14 CHECK e 16 FK confiáveis, 21 índices, 14 migrations), triggers d1/d2 IGUAIS ao texto da migration. **3d DIVERGE**: schema:log = 60 instruções (esperado só 3 FK). Expectativa do procedimento estava incompleta: já era conhecido (7.1b) que colunas legadas não mapeadas (vc_blocked_times date/time_start/time_end/start/end; vc_reservations row_version) geram DROP COLUMN; synchronize:false → sem efeito em runtime. Por classificar: 23 DROP CHECK, 7 DROP/CREATE INDEX (incl. CREATE UNIQUE em vc_employees.user_id), 6 pares DEFAULT, 2 ALTER COLUMN updated_at NOT NULL → V.1b (só leitura). Defeito do procedimento: query 3a-4 inválida (erro 130).
- V.1b classificar as 60 instruções (só leitura): A conhecido/documentado, B objeto só nas migrations, C ruído de comparação do TypeORM (definição igual), D desvio real (BD ≠ intenção da migration ou entidade). Pronto: evidencias/validacao-v1b.md com tabela por instrução + definição na BD + declaração na entidade/migration (file:line).
- V.2 ✅ executado (evidencias/validacao-v2.md, gravado pelo orchestrator a partir de v2-results.json): 17 testes, 15 OK; @@TRANCOUNT 0 e sobras 0 em todos; fingerprint IGUAL (re-verificado). DIVERGE T6 (no CATCH as 2 reservas leem COMPLETED; hipótese XACT_ABORT ON em triggers → transação condenada, não confirmável) e T10 (defeito da fixture: 2601 no índice de IN_PROGRESS por animal). → V.2b (XACT_STATE + tentativa de COMMIT; T10 com o 2.º animal) lançado.
- V.1b ✅ (executor parou no limite de 30 turnos, mas o relatório ficou completo: evidencias/validacao-v1b.md, 60 linhas, A 9 / B 24 / C 19 / D 8). D verificados pelo orchestrator: users.entity.ts:82/:85 e animal-measurement.entity.ts:67/:68 sem `default: () => "SYSDATETIME()"` (as outras entidades têm; BD e migration têm SYSDATETIME) → sem efeito em runtime; BAIXO, recomendação (não corrigir sem decisão). Unicidade de vc_employees.user_id existe (uq_vc_employees_user_id) → REL_ é ruído. 23 CHECK só nas migrations; 4 índices com INCLUDE que o TypeORM não representa. Conclusão: schema:log nunca fica vazio por desenho; nunca correr schema:sync/migration:generate às cegas.
- V.3b ✅ (evidencias/validacao-v3b.md, gravado pelo orchestrator; sem fugas): C3a/C3b -1 no mesmo SPID; **C3c: após THROW de trigger (51105) a reposição dá ENOTBEGUN e a ligação fica com 5000** = risco residual já documentado em lock-timeout.ts:30-36 e aceite pelo critério §7 ("ou risco residual registado com o valor observado") → MÉDIO/BAIXO, reportar ao utilizador como melhoria possível; C4 1222 em 5029 ms com `WITH (UPDLOCK, ROWLOCK)`, controlo 4 ms. Fingerprint IGUAL.
- 9c ✅ verificado pelo orchestrator (diff staged, 0 unstaged, EOL iguais, inventário 98, grep só nota 6 + teste novo; gate tsc 0 / build 0 / jest 55/587). **COMMIT 8bfcc2b + push**. Achado lateral (Baixo, pré-existente): eslint.config.mjs:34 com chave "eslint-disable @typescript-eslint/no-unsafe-call" impede o eslint de carregar.
- V.2b ✅ (evidencias/validacao-v2b.md, gravado pelo orchestrator a partir de v2b-results.json; 8 testes): T6b XACT_STATE -1 e COMMIT → 3930 → o THROW do trigger condena a transação inteira; a leitura COMPLETED no CATCH é só a vista da transação ainda não revertida → **T6 era expectativa errada do procedimento** (assumia atomicidade por instrução), trigger correto. T1/T2/T4/T5a/T12 XACT_STATE -1 (mesmo padrão). T10b OK com o 2.º animal (ROWCOUNT 1 em cada UPDATE) → T10 era defeito da fixture. T6c incoerente (XACT_STATE 1 com TRANCOUNT 0) → não usado como prova. Fingerprint IGUAL (re-verificado pelo orchestrator, exit 0).
- 4a ✅ verificado pelo orchestrator (diff staged = 6 ficheiros +21/−8, 0 unstaged, EOL iguais, `--check` 0; mutação sem @ApiOkResponse derruba "documents every route"; links DELETE :42 / transfer :57 conferidos; gate meu tsc 0 / build 0 / jest 55/587). **COMMIT 9085464 + push** (trailer Opus 5.5 conferido). Notas: `format: "uuid"` no array e não em items (padrão do projeto); Example Value mostra `result: {}` (igual aos outros DTOs).
- V.3a ✅ (executor parou no limite de 30 turnos sem relatório, depois dos passos 1–6; passo 7 e evidencias/validacao-v3a.md feitos pelo orchestrator a partir de v3a-results.json): C1 1222 em 5015 ms, reserva intacta; C2a (consulta primeiro) → B 51107, estado (CONFIRMED, IN_PROGRESS); C2b (cancelamento primeiro) → A 51105, estado (CANCELLED, sem visita); bloqueio só provado de forma indireta (pendente aos 2 s; DMVs negadas sem VIEW SERVER STATE). Limpeza: 1/1/1/1/2 = @@ROWCOUNT, COMMIT, 0 sobras nas 22 tabelas. **Fingerprint final IGUAL** (22 tabelas/38 linhas, exit 0, corrido pelo orchestrator).
- V.4a ✅ verificado (diff 866→885 linhas, só os 5 trechos, CR 0 por Node, §5 igual à cópia): 3a-4 com CROSS APPLY + nota, 3d esperado = 60 instruções/lista V.1b, T6 transação condenada, T10 com @an2, checklist T1–T6. Pendentes → V.4a2 (lançado): provar a query 3a-4 numa variável de tabela (+ controlo 130 com a forma antiga), corrigir redação do D ("getdate() pretendido" → entidade sem default; BD/migration SYSDATETIME), 1.1 ponto 3 e checklist 3d contraditórios, frase INCLUDE, XACT_STATE só medido em T1/T2/T4/T5a/T6/T12, "T13" inexistente → 4.3.
- V.4a2 ✅ verificado (T13 0 ocorrências, CR 0, §5 igual ao original): query 3a-4 com CROSS APPLY **validada em SQL Server** numa variável de tabela (4/1/1/3/1 = esperado), forma antiga → 130; D reescrito; 1.1-3 e checklist 3d alinhados; XACT_STATE só nos testes medidos (T6b); T13 → 4.3. Desvio aceite: frase INCLUDE ficou "o TypeORM não representa o INCLUDE, e a comparação do schema:log não olha para o where" (as entidades declaram `where`, animal-owner.entity.ts:19-21 — o meu texto estaria errado).
- V.4b ✅ verificado (2 hunks, §1 e §2.2; 886→898 linhas; CR 0): §1 Estado = EXECUTADO em vetcare_dev, sem backup (3013/262) → impressão digital, resultados V.0–V.4 com links. As secções 2–6 continuam a descrever o procedimento genérico (para outra BD), de propósito.
- Skill orchestrator-plan v2→v3 ✅ (2 lições ajustadas, 5 novas).
- **FASE V CONCLUÍDA.** Commits na origin: 8c66d8b, abd56ae, 9dd0f7c, c3469c6, 8bfcc2b, 9085464 (HEAD = origin). Falta só o relatório final ao utilizador.
- V.4b (depois da V.3a e da V.4a): §1 Estado → EXECUTADO em vetcare_dev (autorizada, sem backup por falta de permissão, resultados V.0–V.3 com links para evidencias/). Docs commitados: SCHEMA_MIGRATION.md "not executed against any database during this work" continua literalmente verdadeiro (as 14 migrations já estavam aplicadas em vetcare_dev antes da Fase V; não corremos migrations) → não mexer; mencionar no relatório.
- Ordem: V.0 ∥ V.1 → V.2 ∥ V.3b → V.3a.

## Validação em BD real (histórico)
Pendente de autorização (só existe vetcare_dev). Procedimento ✅ escrito em memoria/validacao-bd.md (770 linhas; verificado: sem valores de credenciais, secções 1–9, riscos R0–R16 com file:line). Pontos para o relatório final: R0 default .env.mssql.local aponta para vetcare_dev (forçar VETCARE_ENV_FILE); schema:log NÃO fica vazio (3 FKs compostas só na BD, createForeignKeyConstraints:false); R9 = lacuna COMPLETED→VOIDED no trigger (decisão em aberto; 51108 livre); C3 (reset LOCK_TIMEOUT em conexão reutilizada) exige script Node com pool.

## Registo
- 2026-11-17: recuperação feita pelo orchestrator; plano escrito.
- 2026-11-17: 5B docs+testes verificados; baseline 5B: tsc 0, build 0, jest 52/517. Fase 6: 6.2/6.3/6.4 lançadas em paralelo.
- 2026-11-17: 6.1 ✅, 6.3-fix ✅; 6.5 lançada (inclui correção do teste antigo da 6.2). 6.6 e memoria/validacao-bd.md (procedimento, PENDENTE) lançadas em paralelo.
- 2026-11-17: 6.5 ✅ (verificação direta: jest src/app 451/451, tsc 0).
- 2026-11-17: FASE 6 CONCLUÍDA ✅ commit abd56ae (gate: tsc 0, build 0, jest 54/575). Fase 7: 7 auditorias lançadas.
- Lição p/ skill: tarefas read-only grandes (>~40 itens) esgotam 30 turnos sem relatório → dividir e exigir escrita incremental desde o turno 3.
- Lição p/ skill: executor pode trocar a linha Co-Authored-By pela do próprio modelo; conferir trailer após cada commit.
- Nota p/ auditoria 7 (Médio, fora do âmbito do /goal): trigger de consultas não impede COMPLETED→outro estado numa consulta cuja reserva está COMPLETED (a app já impede: só IN_PROGRESS muda).
- 2026-11-17: 4a commit 9085464 + push; V.2b/V.3a/V.4a/V.4a2/V.4b ✅; fingerprint final IGUAL; skill v3. /goal concluído salvo relatório.
