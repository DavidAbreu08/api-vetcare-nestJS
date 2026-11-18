# V.2b — seguimento da V.2: XACT_STATE após THROW de trigger, tentativa de COMMIT, T10 com fixture corrigida

Gravado pelo orchestrator a partir de `C:/Users/david/AppData/Local/Temp/claude/0c76d380998acb40/73509bb7-dbe4-4c89-9279-6ea8e428ea2d/scratchpad2b-results.json` (2.ª execução; a 1.ª, v2b-results-run1.json, deu os mesmos veredictos). Script v2b-run.js. Tudo em BEGIN TRAN…ROLLBACK; @@TRANCOUNT 0 e sobras 0 após cada teste. Fingerprint final IGUAL (22 tabelas, 38 linhas, exit 0; re-verificado pelo orchestrator).

| Teste | Esperado | Obtido (literal) | Veredicto |
|---|---|---|---|
| T6b | ERRO 51106; XACT_STATE=-1; COMMIT com erro 3930; nada confirmado (ROLLBACK) | ERROR_NUMBER=51106 | XACT_STATE=-1 | mensagem="A reservation can only become COMPLETED with a COMPLETED clinical visit." | estados depois do erro=["COMPLETED","COMPLETED"] | COMMIT: ERROR_NUMBER=3930 mensagem="The current transaction cannot be committed and cannot support operations that write to the log file. Roll back the transaction." | @@TRANCOUNT depois da tentativa=1 | OK |
| T6c | XACT_STATE=-1 (previsto pela hipótese); ROLLBACK sem erro; registo de Msg 3616 | erros do lote 1 (sem TRY): Msg 51106: A reservation can only become COMPLETED with a COMPLETED clinical visit. | Msg 3616: não | lote 2: XACT_STATE=1 @@TRANCOUNT=0 | ROLLBACK: sem erro | DIVERGE |
| T1 | ERROR_NUMBER=51105; XACT_STATE=-1 (sem COMMIT) | ERROR_NUMBER=51105 | XACT_STATE=-1 | OK |
| T2 | ERROR_NUMBER=51104; XACT_STATE=-1 (sem COMMIT) | ERROR_NUMBER=51104 | XACT_STATE=-1 | OK |
| T4 | ERROR_NUMBER=51106; XACT_STATE=-1 (sem COMMIT) | ERROR_NUMBER=51106 | XACT_STATE=-1 | OK |
| T5a | ERROR_NUMBER=51107; XACT_STATE=-1 (sem COMMIT) | ERROR_NUMBER=51107 | XACT_STATE=-1 | OK |
| T12 | ERROR_NUMBER=51106; XACT_STATE=-1 (sem COMMIT) | ERROR_NUMBER=51106 | XACT_STATE=-1 | OK |
| T10b | SEM ERRO nos dois UPDATE; @@ROWCOUNT=1 em cada; definicao_intersect=1; sem Msg 2601 | SEM ERRO | UPDATE 1 @@ROWCOUNT=1 | UPDATE 2 @@ROWCOUNT=1 | definicao_intersect=1 | OK |

## Conclusão (orchestrator)
- THROW dentro dos triggers condena a transação inteira: com TRY/CATCH, XACT_STATE() = -1 em 6/6 (T6b, T1, T2, T4, T5a, T12) e COMMIT recusado com 3930 (nada confirmado); sem TRY (caminho da aplicação), o servidor termina a transação (@@TRANCOUNT 0, linhas da fixture já inexistentes). As alterações da instrução falhada continuam visíveis no CATCH até ao ROLLBACK, mas nunca podem ser confirmadas. → T6 da V.2 era expectativa errada do procedimento (atomicidade por instrução), não defeito do trigger; coincide com o comentário da migration ("a THROW inside a trigger aborts the transaction") e com o ENOTBEGUN de C3c (V.3b).
- T6c: XACT_STATE() = 1 com @@TRANCOUNT = 0 no batch seguinte é incoerente e não é usado como prova; os factos decisivos são @@TRANCOUNT 0 e sobras 0.
- T10b: com a 2.ª visita no 2.º animal, os dois UPDATE null-safe passam (@@ROWCOUNT 1 cada, sem 2601) → T10 OK; o defeito era da fixture do procedimento.
