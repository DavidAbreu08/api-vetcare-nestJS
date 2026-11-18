# Etapa 4.1 — Decisões verificadas (2026-11-17)

Relatório do executor (somente leitura) gravado pelo orchestrator; pontos marcados (✔) foram re-verificados pelo
orchestrator diretamente no código.

| # | Decisão | Estado | Evidência principal |
|---|---|---|---|
| 1 | serviceId obrigatório em novas reservas | CONFIRMADO ✔ | create-reservation.dto.ts:27-28 `@IsUUID() serviceId` sem @IsOptional; spec reservation.business.service.spec.ts:554; docs API_ORGANIZATION.md:213, API_ROUTES.md (nota 10) |
| 2 | Funcionário não habilitado 400; serviço inexistente 404 | CONFIRMADO | reservation.business.service.ts:404 (INVALID_VALUE, EMPLOYEE_NOT_QUALIFIED) e :366 (NOT_FOUND); error-metadata.enum.ts:19-32 (INVALID_VALUE→400, NOT_FOUND→404); specs :587 e :623 |
| 3 | Não-admin com createdBy de terceiro → lista vazia | CONFIRMADO ✔ | reservation.business.service.ts:102 `return []`; spec :531; docs API_ORGANIZATION.md:136 |
| 4 | Veterinário não aprova o próprio animal | CONFIRMADO | animal.business.service.ts:238-241, :290-291 (403); specs animal.business.service.spec.ts:79, :199, :214. Nuance: na criação compara só o tutor primário; em update/confirm qualquer tutor ativo (coberto pelo teste :199) |
| 5 | completed_by sem CHECK na BD | CONFIRMADO | nenhuma CHECK com completed_by nas migrations; 1795348800000-IntegrityAndLifecycle.ts:8-11 explica; SCHEMA_MIGRATION.md:185 |
| 6 | (pendente) movedReservationIds no DELETE de tutor | ESTADO ATUAL | animal-owners.business.service.ts:215 `return { movedReservationIds: moved }`; sem @ApiOkResponse/schema Swagger; só testes de serviço (spec :161, :190, :260); doc API_ORGANIZATION.md:193 |
| 7 | (pendente) habilitação ao iniciar consulta | ESTADO ATUAL: não exigida | clinical-visit.business.service.ts start() não lê vc_employee_services; doc API_ORGANIZATION.md:218 "Pending decision" |
| 8 | Lista de decisões 1–27 | NÃO ENCONTRADA | só "Correções 1–8" em D:\my-own-projects\Projeto\docs\IMPLEMENTACAO_API.md; specs citam "decision 4, 9–16, 26, 27" sem definição no repo (ex.: animal.business.service.spec.ts:152, clinical-visit spec :130) |

Divergências menores (para auditoria 7, Baixo):
- HTTP_RESPONSES.md:32 / API_ROUTES.md nota 10: "missing → 404" ambíguo (serviceId ausente no body = 400 de validação; 404 = id inexistente).
- API_ORGANIZATION.md:138 omite que não-admin recebe 404 para serviço inativo (está em :213).
- Título do teste animal-owners.business.service.spec.ts:190 diz "409 with the list" mas o corpo verifica que NÃO há lista.
- DELETE de tutor sem schema de resposta no Swagger (@ApiOkResponse).
