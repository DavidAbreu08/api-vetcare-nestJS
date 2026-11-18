# Fase 8.1b — mutações, Swagger, gate (2026-11-17)

Executor não gravou o ficheiro (disse que as suas regras o impedem); resumo gravado pelo orchestrator a partir do relatório, com re-verificação direta.

- sha256 original de clinical-visit.business.service.ts: 8b30367ffc060945dbda5bdceb064c929fdeb2f417c64cc8fcabbc036bdc625b (re-verificado pelo orchestrator depois das 3 reposições: igual).
- M1 (sem o bloco de habilitação): 5 falhas / 35 — inclui "rejects a reservation whose responsible employee is not qualified..." e "checks the employee the administrator names...".
- M2 (perfil sem lock: WRITE_LOCK): 1 falha / 35 — "reads the responsible profile with the write lock and no relations..." (spec :215).
- M3 (perfil com relations: { user: true }): 1 falha / 35 — o mesmo teste.
- Swagger: description do POST /clinical-visits + "400 EMPLOYEE_NOT_QUALIFIED when the reservation has a service that the responsible employee does not hold (walk-ins and reservations without a service are not checked)." (mesma linha; EOL w/crlf inalterado).
- Gate do executor: tsc exit 0; nest build exit 0; jest 55 suites / 587 testes, todos verdes (578 + 9 novos).
- Re-verificação do orchestrator: jest src/app/clinical-visits 35/35, tsc 0 (antes do Swagger); linha 150 com lock, linha 198 com isQualifiedForService.
