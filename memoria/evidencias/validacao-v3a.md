# V.3a: concorrência real C1/C2 em vetcare_dev (2026-11-17)

Fonte: `S\v3a-results.json` (escrita incremental do executor, última atualização às 2026-11-17T23:02:48Z). Os scripts são `S\v3a-*.js`.
O executor parou no limite de 30 turnos, sem relatório, depois de completar os passos 1–6. O passo 7 (impressão digital) e este ficheiro foram feitos pelo orchestrator.
S = `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad`.

Método:
- duas ligações independentes (A e B), cada uma com pool max 1 e com a guarda vetcare_dev e host local;
- transações por `request.batch()`;
- uma 3.ª ligação só de leitura para observar bloqueios.

## Preflight e fixture (commit)
- Ausência confirmada antes de inserir: 22 tabelas verificadas, 0 colisões de IDs `C0000000-…`, 0 emails e 0 espécies existentes.
- Inseridas com autocommit: vc_species 1, vc_users 2, vc_employees 1, vc_animals 1 e vc_reservations 1 (C…01, CONFIRMED, `reason` NULL). Não houve visitas.

## Resultados

| Teste | Esperado | Obtido (literal) | Veredicto |
|---|---|---|---|
| C1 | B com `SET LOCK_TIMEOUT 5000` e o mesmo UPDATE dá 1222 em ~5 s; reserva intacta | SPID A 54 / B 59; A @@TRANCOUNT 1 depois do UPDATE; B: **ERRO 1222** "Lock request time out period exceeded." em **5015 ms**; B @@TRANCOUNT 0; LOCK_TIMEOUT -1 depois do reset; A @@TRANCOUNT 0 depois do ROLLBACK; final `CONFIRMED`, `reason` NULL (o original), `cancelled_at` NULL | OK |
| C2a (consulta primeiro) | (CONFIRMED, IN_PROGRESS) com B a dar 51107, ou (CANCELLED, sem visita) | SPID A 66 / B 67; A INSERT da visita C…07, @@TRANCOUNT 1; B continuava pendente aos 2 s; A COMMIT; B: **ERRO 51107** "A reservation with an IN_PROGRESS or COMPLETED clinical visit cannot become CANCELLED, NO_SHOW or PENDING." (total 2025 ms, terminou logo a seguir ao COMMIT de A); B @@TRANCOUNT 0; verificação: `CONFIRMED` / `IN_PROGRESS`, 1 visita ligada | ACEITÁVEL / OK |
| reset para C2b | só IDs da fixture | DELETE da visita C…07: 1; UPDATE da reserva C…01: 1; histórico de C…01: 0 linhas (DELETE não executado); depois: CONFIRMED, sem visitas, igual ao snapshot exceto `row_version` | OK |
| C2b (cancelamento primeiro) | A dá 51105 e faz ROLLBACK; (CANCELLED, sem visita) | SPID A 90 / B 91; B UPDATE para CANCELLED, @@TRANCOUNT 1; A continuava pendente aos 2 s; B COMMIT; A: **ERRO 51105** "A clinical visit can only be created for a CONFIRMED reservation." (total 2031 ms); A @@TRANCOUNT 0; verificação: `CANCELLED`, sem visita, 0 visitas ligadas | ACEITÁVEL / OK |

Nenhum resultado inaceitável: nunca houve CANCELLED, NO_SHOW ou PENDING com visita IN_PROGRESS ou COMPLETED.

Observação do bloqueio: `sys.dm_exec_requests` não devolveu linhas para o SPID da outra sessão, e `sys.dm_os_waiting_tasks` foi NEGADO ("The user does not have permission to perform this action."). A conta não tem VIEW SERVER STATE, por isso não há `blocking_session_id` direto. A prova é indireta:
- a sessão continuava pendente aos 2 s;
- terminou ao fim de 2025 e 2031 ms no total, ou seja, logo depois da espera de ~2 s que precedia o COMMIT da outra;
- terminou com o erro do trigger, que só é possível depois de ler a linha confirmada.
O campo `ms_apos_commit_*` = -1 é um artefacto da medição (a promessa de B resolveu antes de A registar o fim do COMMIT) e não foi usado como prova.

## Limpeza dirigida (uma transação, COMMIT)
- As FKs que referenciam as 6 tabelas foram descobertas por `sys.foreign_keys`. Contagem antes por FK: só há linhas em vc_animals.species_id (1), vc_employees.user_id (1) e vc_reservations.animal_id/client_id/employee_id (1). Todas as outras FKs (measurements, owners, blocked_times, breeds, clinical_visits, job_titles, schedules, services, reservation_history) deram 0.

| Tabela (ordem) | Antes | @@ROWCOUNT | Depois |
|---|---|---|---|
| vc_reservations | 1 | 1 | 0 |
| vc_animals | 1 | 1 | 0 |
| vc_employees | 1 | 1 | 0 |
| vc_species | 1 | 1 | 0 |
| vc_users | 2 | 2 | 0 |

- Estado: "COMMIT: todos os @@ROWCOUNT bateram com a contagem antes"; @@TRANCOUNT 0 depois do fecho.
- Depois: 0 linhas com IDs ou FKs `C0000000-…` em todas as 22 tabelas (incluindo migrations, vc_user_roles e vc_reservation_history). A ausência foi re-verificada: 0 colisões, 0 emails e 0 espécies.

## Impressão digital final (orchestrator)
```
$ node S/v-fingerprint.js compare memoria/evidencias/validacao-v0-fingerprint.json
IGUAL
tabelas=22 total_linhas=38
exit_node=0
```
O aviso DEP0123 do Node sobre TLS ServerName não tem relação com os testes.

## Conclusão
- C1 confirma o `LOCK_TIMEOUT` 5000 → 1222 em servidor real.
- C2a e C2b confirmam que, nas duas ordens da corrida "iniciar consulta × cancelar reserva", o trigger deixa sempre um estado válido. O perdedor recebe o erro de domínio (51107 ou 51105), que a aplicação mapeia para 409 (Fase 6.3).
- A BD voltou exatamente ao baseline da V.0.
