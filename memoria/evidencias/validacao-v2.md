# V.2 — testes reais aos triggers (T0–T12 + 4.3) em vetcare_dev

Gravado pelo orchestrator a partir de `C:/Users/david/AppData/Local/Temp/claude/0c76d380998acb40/73509bb7-dbe4-4c89-9279-6ea8e428ea2d/scratchpad2-results.json` (gerado em 2026-11-17T22:43:01.478Z); o executor recusou escrever .md.
Scripts: v2-lib.js, v2-preflight.js, v2-run.js (mesmo scratchpad). Ligação única (pool max 1), SPIDs observados [73]; substituições de prefixo []; paragem null.
Cada teste: um batch com BEGIN TRAN → fixture F → passo → TRY/CATCH → IF @@TRANCOUNT>0 ROLLBACK; depois @@TRANCOUNT e sobras da fixture na mesma ligação.

| Teste | O que faz | Esperado | Obtido (literal) | @@TRANCOUNT | sobras | Veredicto |
|---|---|---|---|---|---|---|
| T0 | Controlo positivo: INSERT de consulta IN_PROGRESS ligada a reserva CONFIRMED | SEM ERRO | SEM ERRO | 0 | 0/0 | OK |
| T1 | INSERT de consulta IN_PROGRESS ligada a reserva PENDING | ERRO 51105 | ERRO 51105: A clinical visit can only be created for a CONFIRMED reservation. | 0 | 0/0 | OK |
| T2 | UPDATE de animal_id de uma consulta walk-in | ERRO 51104 | ERRO 51104: vc_clinical_visits.animal_id and reservation_id cannot be changed. | 0 | 0/0 | OK |
| T3 | UPDATE de reservation_id de uma consulta walk-in para uma reserva | ERRO 51104 | ERRO 51104: vc_clinical_visits.animal_id and reservation_id cannot be changed. | 0 | 0/0 | OK |
| T4 | UPDATE de reserva CONFIRMED para COMPLETED sem consulta COMPLETED | ERRO 51106 | ERRO 51106: A reservation can only become COMPLETED with a COMPLETED clinical visit. | 0 | 0/0 | OK |
| T5a | UPDATE de reserva para CANCELLED com consulta IN_PROGRESS | ERRO 51107 | ERRO 51107: A reservation with an IN_PROGRESS or COMPLETED clinical visit cannot become CANCELLED, NO_SHOW or PENDING. | 0 | 0/0 | OK |
| T5b | UPDATE de reserva para NO_SHOW com consulta IN_PROGRESS | ERRO 51107 | ERRO 51107: A reservation with an IN_PROGRESS or COMPLETED clinical visit cannot become CANCELLED, NO_SHOW or PENDING. | 0 | 0/0 | OK |
| T5c | UPDATE de reserva para PENDING com consulta IN_PROGRESS | ERRO 51107 | ERRO 51107: A reservation with an IN_PROGRESS or COMPLETED clinical visit cannot become CANCELLED, NO_SHOW or PENDING. | 0 | 0/0 | OK |
| T6 | UPDATE de duas reservas (A válida, B inválida) numa instrução | ERRO 51106; as duas reservas CONFIRMED depois do erro | ERRO 51106: A reservation can only become COMPLETED with a COMPLETED clinical visit. | estados depois do erro=["COMPLETED","COMPLETED"] | 0 | 0/0 | DIVERGE |
| T7 | Caminho válido: consulta COMPLETED e depois reserva COMPLETED | SEM ERRO; estado COMPLETED | SEM ERRO | estado="COMPLETED" | 0 | 0/0 | OK |
| T8 | UPDATE só de client_id (não dispara o trigger de reserva) | SEM ERRO; client_id = @uB | SEM ERRO | cliente="FA16FDDC-0598-4F2F-B663-4F9B30813CF2" | 0 | 0/0 | OK |
| T9a | INSERT de reserva com OUTPUT INSERTED.* INTO @tabela (padrão TypeORM) | SEM ERRO; 1 linha em @outI | SEM ERRO | linhas em @outI=1 | 0 | 0/0 | OK |
| T9b | UPDATE com OUTPUT INSERTED.* INTO @tabela (PENDING -> CONFIRMED) | SEM ERRO; 1 linha CONFIRMED em @outU | SEM ERRO | linhas em @outU=1 | 0 | 0/0 | OK |
| T10 | UPDATE com reservation_id e animal_id iguais (comparação null-safe) | SEM ERRO nas duas; definicao_intersect = 1 | SEM ERRO | erros do lote: Msg 2601: Cannot insert duplicate key row in object 'dbo.vc_clinical_visits' with unique index 'uq_vc_clinical_visits_animal_in_progress'. The duplicate key value is (1dfcfc96-7264-4a19-8c15-6c326518a653). | definicao_intersect=1 / erros do lote: {"numero":2601,"mensagem":"Cannot insert duplicate key row in object 'dbo.vc_clinical_visits' with unique index 'uq_vc_clinical_visits_animal_in_progress'. The duplicate key value is (1dfcfc96-7264-4a19-8c15-6c326518a653).","precedentes":[]} | 0 | 0/0 | DIVERGE |
| T11 | LACUNA: anular consulta COMPLETED de reserva COMPLETED | SEM ERRO; estado_reserva COMPLETED e estado_visita VOIDED (comportamento atual) | SEM ERRO | estado_reserva="COMPLETED" estado_visita="VOIDED" | 0 | 0/0 | OK |
| T12 | INSERT de reserva com status COMPLETED explícito, sem consulta | ERRO 51106 | ERRO 51106: A reservation can only become COMPLETED with a COMPLETED clinical visit. | 0 | 0/0 | OK |
| C4.3 | Controlo negativo: UPDATE com OUTPUT sem INTO, triggers ativos (sem TRY/CATCH) | Msg 334 | Msg 334: The target table 'dbo.vc_reservations' of the DML statement cannot have any enabled triggers if the statement contains an OUTPUT clause without INTO clause. / erros do lote: {"numero":334,"mensagem":"The target table 'dbo.vc_reservations' of the DML statement cannot have any enabled triggers if the statement contains an OUTPUT clause without INTO clause.","precedentes":[]} | 0 | 0/0 | OK |

Impressão digital no fim (executor, e re-corrida pelo orchestrator): `IGUAL`, tabelas=22, total_linhas=38, exit 0.

## Divergências (análise do orchestrator)
- **T6**: 51106 como esperado, mas no CATCH as duas reservas leem COMPLETED. Hipótese: XACT_ABORT ON por omissão dentro de triggers → THROW condena a transação (XACT_STATE() = -1): alterações visíveis até ao ROLLBACK, mas não confirmáveis (COMMIT → 3930). A expectativa do procedimento (atomicidade por instrução, CONFIRMED no CATCH) estaria errada, não o trigger. → V.2b mede XACT_STATE e tenta COMMIT.
- **T10**: defeito da fixture do procedimento (2.ª visita IN_PROGRESS no mesmo animal → 2601 em uq_vc_clinical_visits_animal_in_progress); só o ramo walk-in foi exercitado (OK). → V.2b repete com o 2.º animal.
