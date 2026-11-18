# Validação V.1: verificação de schema (só leitura)

- Base: `vetcare_dev` (SQL Server local, configuração em `.env.mssql.local`). Os valores de ligação não aparecem neste relatório.
- Procedimento: `memoria/validacao-bd.md`, secção 3a (linhas 104-273), 3c (289-388), 3d (390-403) e verificação de triggers pedida pelo orquestrador.
- Migrations: as 14 já estavam aplicadas. Nenhuma foi corrida.
- Não usado: `migration:run`, `migration:revert`, `schema:sync`, `schema:drop`, `migration:generate`, e qualquer SQL que não seja SELECT/WITH.
- Guarda de runtime: antes de qualquer query, `DB_NAME()` = `vetcare_dev` e `SERVERPROPERTY('MachineName')` = nome deste computador (sem distinguir maiúsculas). Se falhar, o script aborta sem correr mais nada.
- Guarda estática: lista de palavras proibidas copiada de `step3-readonly-queries.js`, mais a regra de uma só instrução.

## Desvios e notas de método

- 3a-1 (`npm run db:migrations:show`) não foi corrido: não estava na lista pedida.
- Verificação de variáveis de ambiente: o comando pedido (`env | grep ... || echo nenhuma`) imprimiria os valores. Usei a mesma verificação mostrando só os nomes.
- 3a-5 inclui também a query de dependências da secção 5 do procedimento, numerada 3a-5b.
- 3c-Q8 repete a query 3a-2, como indica o procedimento.
- Triggers (item 4): SQL escrito tal como pedido. A comparação com a migração é feita por script, com CRLF→LF, espaços colapsados e trim em ambos os lados.
- As secções seguintes são geradas pelo script `v1-run.js` (SQL e saída literal). Os esperados e veredictos são acrescentados depois de cada execução.

**Guarda de runtime** (primeira query da ligação): DB_NAME() = vetcare_dev: OK; SERVERPROPERTY(MachineName) = nome deste computador (sem distinguir maiúsculas): OK.
## 3a

**Guarda de runtime** (primeira query da ligação): DB_NAME() = vetcare_dev: OK; SERVERPROPERTY(MachineName) = nome deste computador (sem distinguir maiúsculas): OK.

#### v1-3a-2

SQL:

```sql
SELECT [id], [timestamp], [name] FROM [dbo].[migrations] ORDER BY [timestamp];
```

Saída literal:

```
{"id":1,"timestamp":"1794657600000","name":"InitialSqlServer1794657600000"}
{"id":2,"timestamp":"1794744000000","name":"UniformSchemaAndAnimalCatalog1794744000000"}
{"id":3,"timestamp":"1794830400000","name":"AnimalMeasurementsAndMetadata1794830400000"}
{"id":4,"timestamp":"1794916800000","name":"ConfigurableMeasurementTypes1794916800000"}
{"id":5,"timestamp":"1795003200000","name":"UserRolesAndEmployees1795003200000"}
{"id":6,"timestamp":"1795089600000","name":"ReservationsAndClinicalVisits1795089600000"}
{"id":7,"timestamp":"1795176000000","name":"MeasurementsHardening1795176000000"}
{"id":8,"timestamp":"1795262400000","name":"HashedResetTokens1795262400000"}
{"id":9,"timestamp":"1795348800000","name":"IntegrityAndLifecycle1795348800000"}
{"id":10,"timestamp":"1795435200000","name":"AnimalOwners1795435200000"}
{"id":11,"timestamp":"1795521600000","name":"ReservationAuthorship1795521600000"}
{"id":12,"timestamp":"1795608000000","name":"ClinicServices1795608000000"}
{"id":13,"timestamp":"1795694400000","name":"SchedulesAndBlocks1795694400000"}
{"id":14,"timestamp":"1795780800000","name":"ClinicalIntegrity1795780800000"}
(14 linha(s))
```

#### v1-3a-3

SQL:

```sql
SELECT
     (SELECT COUNT(*) FROM [dbo].[vc_animal_measurements] WHERE [recorded_by] IS NULL) AS p51030_medicoes_sem_autor,
     (SELECT COUNT(*) FROM [dbo].[vc_measurement_types] WHERE NOT ([code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%')) AS p51031_codigos_fora_do_padrao,
     (SELECT COUNT(*) FROM (SELECT [animal_id] FROM [dbo].[vc_clinical_visits] WHERE [status] = N'IN_PROGRESS' GROUP BY [animal_id] HAVING COUNT(*) > 1) x) AS p51052_animais_com_varias_em_curso,
     (SELECT COUNT(*) FROM [dbo].[vc_clinical_visits] WHERE [voided_at] < [started_at]) AS p51053_anuladas_antes_de_iniciar,
     (SELECT COUNT(*) FROM [dbo].[vc_animals] a WHERE a.[owner_id] IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[vc_users] u WHERE u.[id] = a.[owner_id])) AS p51063_tutor_inexistente,
     (SELECT COUNT(*) FROM [dbo].[vc_reservation_history] WHERE [action] COLLATE Latin1_General_100_BIN2 NOT IN (N'CREATED', N'CONFIRMED', N'RESCHEDULED', N'EMPLOYEE_ASSIGNED', N'EMPLOYEE_CHANGED', N'CANCELLED', N'COMPLETED', N'NO_SHOW', N'CLIENT_CHANGED')) AS p51064_acoes_fora_da_lista,
     (SELECT COUNT(*) FROM (SELECT [reservation_id] FROM [dbo].[vc_reservation_history] WHERE [action] = N'CREATED' GROUP BY [reservation_id] HAVING COUNT(*) > 1) x) AS p51073_varios_CREATED,
     (SELECT COUNT(*) FROM [dbo].[vc_reservations] r WHERE r.[status] = N'COMPLETED' AND NOT EXISTS (SELECT 1 FROM [dbo].[vc_clinical_visits] v WHERE v.[reservation_id] = r.[id] AND v.[status] = N'COMPLETED')) AS p51102_concluidas_sem_visita,
     (SELECT COUNT(*) FROM [dbo].[vc_reservations] r WHERE r.[status] IN (N'CANCELLED', N'NO_SHOW', N'PENDING') AND EXISTS (SELECT 1 FROM [dbo].[vc_clinical_visits] v WHERE v.[reservation_id] = r.[id] AND v.[status] IN (N'IN_PROGRESS', N'COMPLETED'))) AS p51103_estado_incoerente,
     (SELECT COUNT(*) FROM [dbo].[vc_blocked_times] WHERE [end] <= [start]) AS p51093_bloqueio_fim_nao_posterior;
```

Saída literal:

```
{"p51030_medicoes_sem_autor":0,"p51031_codigos_fora_do_padrao":0,"p51052_animais_com_varias_em_curso":0,"p51053_anuladas_antes_de_iniciar":0,"p51063_tutor_inexistente":0,"p51064_acoes_fora_da_lista":0,"p51073_varios_CREATED":0,"p51102_concluidas_sem_visita":0,"p51103_estado_incoerente":0,"p51093_bloqueio_fim_nao_posterior":0}
(1 linha(s))
```

#### v1-3a-4

SQL:

```sql
SELECT COUNT(*) AS total,
          SUM(CASE WHEN t.[user_id] IS NULL OR t.[expires_at] IS NULL THEN 1 ELSE 0 END) AS sem_user_ou_validade,
          SUM(CASE WHEN t.[expires_at] <= SYSUTCDATETIME() THEN 1 ELSE 0 END) AS expirados,
          SUM(CASE WHEN DATALENGTH(t.[reset_token]) <> 128 OR t.[reset_token] COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%' THEN 1 ELSE 0 END) AS formato_nao_hex_64,
          SUM(CASE WHEN t.[user_id] IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[vc_users] u WHERE u.[id] = t.[user_id]) THEN 1 ELSE 0 END) AS utilizador_inexistente
   FROM [dbo].[vc_reset_tokens] t;
```

Saída literal:

```
ERRO número=130 código=EREQUEST: Cannot perform an aggregate function on an expression containing an aggregate or a subquery.
```

#### v1-3a-5

SQL:

```sql
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'vc_blocked_times'
     AND COLUMN_NAME IN (N'date', N'time_start', N'time_end', N'start', N'end')
   ORDER BY COLUMN_NAME;
```

Saída literal:

```
{"COLUMN_NAME":"date","DATA_TYPE":"datetime","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES","COLUMN_DEFAULT":null}
{"COLUMN_NAME":"end","DATA_TYPE":"datetime","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES","COLUMN_DEFAULT":null}
{"COLUMN_NAME":"start","DATA_TYPE":"datetime","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES","COLUMN_DEFAULT":null}
{"COLUMN_NAME":"time_end","DATA_TYPE":"nvarchar","CHARACTER_MAXIMUM_LENGTH":255,"IS_NULLABLE":"YES","COLUMN_DEFAULT":null}
{"COLUMN_NAME":"time_start","DATA_TYPE":"nvarchar","CHARACTER_MAXIMUM_LENGTH":255,"IS_NULLABLE":"YES","COLUMN_DEFAULT":null}
(5 linha(s))
```

#### v1-3a-5b

SQL:

```sql
SELECT 'indice' AS tipo, i.[name] AS objeto, c.[name] AS coluna
   FROM sys.indexes i
   JOIN sys.index_columns ic ON ic.[object_id] = i.[object_id] AND ic.[index_id] = i.[index_id]
   JOIN sys.columns c ON c.[object_id] = ic.[object_id] AND c.[column_id] = ic.[column_id]
   WHERE i.[object_id] = OBJECT_ID(N'dbo.vc_blocked_times') AND c.[name] IN (N'date', N'time_start', N'time_end', N'start', N'end')
   UNION ALL
   SELECT 'default', dc.[name], c.[name]
   FROM sys.default_constraints dc
   JOIN sys.columns c ON c.[object_id] = dc.[parent_object_id] AND c.[column_id] = dc.[parent_column_id]
   WHERE dc.[parent_object_id] = OBJECT_ID(N'dbo.vc_blocked_times') AND c.[name] IN (N'date', N'time_start', N'time_end', N'start', N'end')
   UNION ALL
   SELECT 'check', cc.[name], cc.[definition]
   FROM sys.check_constraints cc WHERE cc.[parent_object_id] = OBJECT_ID(N'dbo.vc_blocked_times')
   UNION ALL
   SELECT 'dependente', OBJECT_NAME(d.[referencing_id]), NULL
   FROM sys.sql_expression_dependencies d WHERE d.[referenced_id] = OBJECT_ID(N'dbo.vc_blocked_times');
```

Saída literal:

```
{"tipo":"check","objeto":"ck_vc_blocked_times_interval","coluna":"([end_at]>[start_at])"}
(1 linha(s))
```

#### v1-3a-6

SQL:

```sql
SELECT (SELECT COUNT(*) FROM sys.check_constraints WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS checks_nao_confiaveis,
          (SELECT COUNT(*) FROM sys.foreign_keys WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS fks_nao_confiaveis,
          (SELECT COUNT(*) FROM sys.triggers WHERE [name] = N'tr_vc_reservation_history_append_only') AS trigger_historico_existe;
```

Saída literal:

```
{"checks_nao_confiaveis":0,"fks_nao_confiaveis":0,"trigger_historico_existe":1}
(1 linha(s))
```

#### v1-3a-7

SQL:

```sql
SELECT [name], [type_desc], [is_primary_key]
   FROM sys.indexes
   WHERE [object_id] = OBJECT_ID(N'dbo.vc_reset_tokens') AND [type] > 0;
```

Saída literal:

```
{"name":"pk_vc_reset_tokens","type_desc":"CLUSTERED","is_primary_key":true}
{"name":"uq_vc_reset_tokens_token_hash","type_desc":"NONCLUSTERED","is_primary_key":false}
{"name":"ix_vc_reset_tokens_user_id","type_desc":"NONCLUSTERED","is_primary_key":false}
(3 linha(s))
```

#### v1-3a-8a

SQL:

```sql
SELECT [name] FROM sys.time_zone_info WHERE [name] = N'GMT Standard Time';
```

Saída literal:

```
{"name":"GMT Standard Time"}
(1 linha(s))
```

#### v1-3a-8b

SQL:

```sql
WITH parede AS (
     SELECT b.[start], b.[end],
            TRY_CONVERT(datetime2(0), CONVERT(char(10), b.[date], 23) + N'T' + b.[time_start] + N':00') AS ini_parede,
            TRY_CONVERT(datetime2(0), CONVERT(char(10), b.[date], 23) + N'T' + b.[time_end] + N':00') AS fim_parede
     FROM [dbo].[vc_blocked_times] b
   ),
   convertida AS (
     SELECT p.[start], p.[end], p.[ini_parede], p.[fim_parede],
            CAST(p.[ini_parede] AT TIME ZONE N'GMT Standard Time' AT TIME ZONE N'UTC' AS datetime2(0)) AS ini_utc,
            CAST(p.[fim_parede] AT TIME ZONE N'GMT Standard Time' AT TIME ZONE N'UTC' AS datetime2(0)) AS fim_utc,
            DATEPART(TZOFFSET, p.[ini_parede] AT TIME ZONE N'GMT Standard Time') AS desvio_ini,
            DATEPART(TZOFFSET, p.[fim_parede] AT TIME ZONE N'GMT Standard Time') AS desvio_fim
     FROM parede p
   ),
   classe AS (
     SELECT c.[ini_parede], c.[fim_parede], c.[desvio_ini], c.[desvio_fim],
            CASE WHEN c.[start] = c.[ini_utc] AND c.[start] = c.[ini_parede] THEN N'ambas'
                 WHEN c.[start] = c.[ini_utc] THEN N'utc'
                 WHEN c.[start] = c.[ini_parede] THEN N'hora_local'
                 ELSE N'nenhuma' END AS cls_ini,
            CASE WHEN c.[end] = c.[fim_utc] AND c.[end] = c.[fim_parede] THEN N'ambas'
                 WHEN c.[end] = c.[fim_utc] THEN N'utc'
                 WHEN c.[end] = c.[fim_parede] THEN N'hora_local'
                 ELSE N'nenhuma' END AS cls_fim
     FROM convertida c
   )
   SELECT N'start' AS campo, cls_ini AS classe, COUNT(*) AS linhas,
          SUM(CASE WHEN ini_parede IS NOT NULL THEN 1 ELSE 0 END) AS com_hora_valida,
          SUM(CASE WHEN desvio_ini <> 0 THEN 1 ELSE 0 END) AS em_datas_desvio_nao_0
   FROM classe GROUP BY cls_ini
   UNION ALL
   SELECT N'end', cls_fim, COUNT(*),
          SUM(CASE WHEN fim_parede IS NOT NULL THEN 1 ELSE 0 END),
          SUM(CASE WHEN desvio_fim <> 0 THEN 1 ELSE 0 END)
   FROM classe GROUP BY cls_fim
   UNION ALL
   SELECT N'total', N'todas', COUNT(*),
          SUM(CASE WHEN ini_parede IS NOT NULL THEN 1 ELSE 0 END),
          SUM(CASE WHEN desvio_ini <> 0 THEN 1 ELSE 0 END)
   FROM classe
   ORDER BY campo, classe;
```

Saída literal:

```
{"campo":"total","classe":"todas","linhas":0,"com_hora_valida":null,"em_datas_desvio_nao_0":null}
(1 linha(s))
```

#### Esperado e veredicto: 3a

| Item | Veredicto | Motivo |
|---|---|---|
| 3a-2 | N/A | Baseline pré-migração. Pós-migração, o critério é a Q8 (3c). O resultado tem as 14 linhas, com `ClinicalIntegrity1795780800000` no fim. |
| 3a-3 | OK | Esperado: 0 em todas as colunas. Real: 0 nas 10 colunas. |
| 3a-4 | N/A | A query é inválida no SQL Server, antes e depois da migração: `SUM(CASE ... EXISTS (SELECT ...))` é um agregado sobre subquery (erro 130). Além disso, lê `t.[reset_token]`, que a 1795262400000 remove (3c-Q6). Não corrigi a query, porque está fora do pedido. |
| 3a-5 | OK | Tipos esperados: `datetime` em `date`/`start`/`end` e `nvarchar(255)` em `time_start`/`time_end`. Real: tipos iguais. A nulidade passou a YES de propósito, porque a 1795694400000 deixa as colunas legadas NULL (3c-Q6). A paragem por tipo ou nulidade diferente aplicava-se antes da migração, por isso não se aplica agora. |
| 3a-5b | OK | Esperado (pré-migração): zero linhas. Real: uma linha, `check ck_vc_blocked_times_interval` com `([end_at]>[start_at])`. É o CHECK criado pela 1795694400000 (3c-Q3), e só envolve `start_at`/`end_at`. Não há índice, DEFAULT nem dependente nas colunas legadas. |
| 3a-6 | N/A | Valores: `checks_nao_confiaveis` = 0, `fks_nao_confiaveis` = 0, `trigger_historico_existe` = 1. O trigger do histórico existe, como esperado. Não há snapshot pré-migração registado no repositório, por isso o baseline não pode ser comparado. A Q2 (3c) dá 0 e 0 nos mesmos totais. |
| 3a-7 | OK | Esperado (pré-migração): 2 linhas. Real: 3 linhas: `pk_vc_reset_tokens` (PK), `uq_vc_reset_tokens_token_hash` e `ix_vc_reset_tokens_user_id`. A 1795262400000 acrescenta `uq_vc_reset_tokens_token_hash` (3c, linha 296). Os nomes do PK e do índice estão corretos e `PK_resetToken` não existe. |
| 3a-8a | OK | Esperado: 1 linha. Real: 1 linha, `GMT Standard Time`. |
| 3a-8b | OK (vazio) | Esperado: sem `hora_local`, sem `nenhuma` com hora válida, e `utc`+`ambas` a cobrir tudo. Real: `vc_blocked_times` está vazia (`total` = 0 linhas), por isso não há classes. A condição cumpre-se vacuamente, mas o teste de fuso (R19) não foi exercido: não há dados que provem a conversão. |
## 3c

**Guarda de runtime** (primeira query da ligação): DB_NAME() = vetcare_dev: OK; SERVERPROPERTY(MachineName) = nome deste computador (sem distinguir maiúsculas): OK.

#### v1-3c-Q1

SQL:

```sql
SELECT t.[name], OBJECT_NAME(t.[parent_id]) AS tabela, t.[is_disabled], t.[is_instead_of_trigger],
       STUFF((SELECT N',' + e.[type_desc] FROM sys.trigger_events e WHERE e.[object_id] = t.[object_id] FOR XML PATH(N'')), 1, 1, N'') AS eventos
FROM sys.triggers t
WHERE t.[name] IN (N'tr_vc_clinical_visits_reservation_integrity', N'tr_vc_reservations_visit_integrity', N'tr_vc_reservation_history_append_only')
ORDER BY t.[name];
```

Saída literal:

```
{"name":"tr_vc_clinical_visits_reservation_integrity","tabela":"vc_clinical_visits","is_disabled":false,"is_instead_of_trigger":false,"eventos":"INSERT,UPDATE"}
{"name":"tr_vc_reservation_history_append_only","tabela":"vc_reservation_history","is_disabled":false,"is_instead_of_trigger":true,"eventos":"UPDATE,DELETE"}
{"name":"tr_vc_reservations_visit_integrity","tabela":"vc_reservations","is_disabled":false,"is_instead_of_trigger":false,"eventos":"INSERT,UPDATE"}
(3 linha(s))
```

#### v1-3c-Q2

SQL:

```sql
SELECT (SELECT COUNT(*) FROM sys.check_constraints WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS checks_nao_confiaveis,
       (SELECT COUNT(*) FROM sys.foreign_keys WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS fks_nao_confiaveis;
```

Saída literal:

```
{"checks_nao_confiaveis":0,"fks_nao_confiaveis":0}
(1 linha(s))
```

#### v1-3c-Q3

SQL:

```sql
SELECT OBJECT_NAME(cc.[parent_object_id]) AS tabela, cc.[name], cc.[is_not_trusted], cc.[is_disabled]
FROM sys.check_constraints cc
WHERE cc.[name] IN (N'ck_vc_measurement_types_code', N'ck_vc_animal_measurements_deleted', N'ck_vc_animal_measurements_clinical_not_deleted',
  N'ck_vc_animal_owners_dates', N'ck_vc_animal_owners_ended', N'ck_vc_animal_owners_end_reason',
  N'ck_vc_clinical_visits_voided_dates', N'ck_vc_services_code', N'ck_vc_services_duration',
  N'ck_vc_employee_schedules_day_of_week', N'ck_vc_employee_schedules_time', N'ck_vc_employee_schedules_validity',
  N'ck_vc_blocked_times_interval', N'ck_vc_reservation_history_action')
ORDER BY cc.[name];
```

Saída literal:

```
{"tabela":"vc_animal_measurements","name":"ck_vc_animal_measurements_clinical_not_deleted","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_animal_measurements","name":"ck_vc_animal_measurements_deleted","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_animal_owners","name":"ck_vc_animal_owners_dates","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_animal_owners","name":"ck_vc_animal_owners_end_reason","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_animal_owners","name":"ck_vc_animal_owners_ended","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_blocked_times","name":"ck_vc_blocked_times_interval","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_clinical_visits","name":"ck_vc_clinical_visits_voided_dates","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_employee_schedules","name":"ck_vc_employee_schedules_day_of_week","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_employee_schedules","name":"ck_vc_employee_schedules_time","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_employee_schedules","name":"ck_vc_employee_schedules_validity","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_measurement_types","name":"ck_vc_measurement_types_code","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_reservation_history","name":"ck_vc_reservation_history_action","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_services","name":"ck_vc_services_code","is_not_trusted":false,"is_disabled":false}
{"tabela":"vc_services","name":"ck_vc_services_duration","is_not_trusted":false,"is_disabled":false}
(14 linha(s))
```

#### v1-3c-Q4

SQL:

```sql
SELECT OBJECT_NAME(fk.[parent_object_id]) AS tabela, fk.[name], fk.[is_not_trusted], fk.[is_disabled], fk.[delete_referential_action_desc]
FROM sys.foreign_keys fk
WHERE fk.[name] IN (N'fk_vc_animal_measurements_recorder', N'fk_vc_animal_measurements_updated_by', N'fk_vc_animal_measurements_deleted_by',
  N'fk_vc_reset_tokens_user', N'fk_vc_animal_owners_animal', N'fk_vc_animal_owners_user', N'fk_vc_animal_owners_assigned_by', N'fk_vc_animal_owners_ended_by',
  N'fk_vc_clinical_visits_completed_by', N'fk_vc_reservations_created_by', N'fk_vc_reservations_service',
  N'fk_vc_employee_services_employee', N'fk_vc_employee_services_service', N'fk_vc_employee_schedules_employee',
  N'fk_vc_blocked_times_employee', N'fk_vc_blocked_times_created_by')
ORDER BY fk.[name];
```

Saída literal:

```
{"tabela":"vc_animal_measurements","name":"fk_vc_animal_measurements_deleted_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_animal_measurements","name":"fk_vc_animal_measurements_recorder","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_animal_measurements","name":"fk_vc_animal_measurements_updated_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_animal_owners","name":"fk_vc_animal_owners_animal","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_animal_owners","name":"fk_vc_animal_owners_assigned_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_animal_owners","name":"fk_vc_animal_owners_ended_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_animal_owners","name":"fk_vc_animal_owners_user","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_blocked_times","name":"fk_vc_blocked_times_created_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_blocked_times","name":"fk_vc_blocked_times_employee","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_clinical_visits","name":"fk_vc_clinical_visits_completed_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_employee_schedules","name":"fk_vc_employee_schedules_employee","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_employee_services","name":"fk_vc_employee_services_employee","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_employee_services","name":"fk_vc_employee_services_service","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_reservations","name":"fk_vc_reservations_created_by","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_reservations","name":"fk_vc_reservations_service","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
{"tabela":"vc_reset_tokens","name":"fk_vc_reset_tokens_user","is_not_trusted":false,"is_disabled":false,"delete_referential_action_desc":"NO_ACTION"}
(16 linha(s))
```

#### v1-3c-Q5

SQL:

```sql
SELECT OBJECT_NAME(i.[object_id]) AS tabela, i.[name], i.[is_unique], i.[has_filter], i.[filter_definition]
FROM sys.indexes i
WHERE i.[name] IN (N'ix_vc_animal_measurements_recorded_by', N'ix_vc_animal_measurements_updated_by', N'ix_vc_animal_measurements_deleted_by',
  N'uq_vc_reset_tokens_token_hash', N'ix_vc_reset_tokens_user_id',
  N'uq_vc_animal_owners_active', N'uq_vc_animal_owners_primary', N'ix_vc_animal_owners_user_active', N'ix_vc_animal_owners_animal_assigned',
  N'ix_vc_animal_owners_assigned_by', N'ix_vc_animal_owners_ended_by', N'ix_vc_animals_owner_id',
  N'uq_vc_clinical_visits_animal_in_progress', N'ix_vc_clinical_visits_completed_by',
  N'ix_vc_reservations_created_by', N'uq_vc_reservation_history_created',
  N'ix_vc_employee_services_service_id', N'ix_vc_reservations_service_id',
  N'ix_vc_employee_schedules_employee_day', N'ix_vc_blocked_times_start_end', N'ix_vc_blocked_times_employee_start')
ORDER BY i.[name];
```

Saída literal:

```
{"tabela":"vc_animal_measurements","name":"ix_vc_animal_measurements_deleted_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_measurements","name":"ix_vc_animal_measurements_recorded_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_measurements","name":"ix_vc_animal_measurements_updated_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_owners","name":"ix_vc_animal_owners_animal_assigned","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_owners","name":"ix_vc_animal_owners_assigned_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_owners","name":"ix_vc_animal_owners_ended_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_owners","name":"ix_vc_animal_owners_user_active","is_unique":false,"has_filter":true,"filter_definition":"([ended_at] IS NULL)"}
{"tabela":"vc_animals","name":"ix_vc_animals_owner_id","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_blocked_times","name":"ix_vc_blocked_times_employee_start","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_blocked_times","name":"ix_vc_blocked_times_start_end","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_clinical_visits","name":"ix_vc_clinical_visits_completed_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_employee_schedules","name":"ix_vc_employee_schedules_employee_day","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_employee_services","name":"ix_vc_employee_services_service_id","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_reservations","name":"ix_vc_reservations_created_by","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_reservations","name":"ix_vc_reservations_service_id","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_reset_tokens","name":"ix_vc_reset_tokens_user_id","is_unique":false,"has_filter":false,"filter_definition":null}
{"tabela":"vc_animal_owners","name":"uq_vc_animal_owners_active","is_unique":true,"has_filter":true,"filter_definition":"([ended_at] IS NULL)"}
{"tabela":"vc_animal_owners","name":"uq_vc_animal_owners_primary","is_unique":true,"has_filter":true,"filter_definition":"([ended_at] IS NULL AND [is_primary]=(1))"}
{"tabela":"vc_clinical_visits","name":"uq_vc_clinical_visits_animal_in_progress","is_unique":true,"has_filter":true,"filter_definition":"([status]=N'IN_PROGRESS')"}
{"tabela":"vc_reservation_history","name":"uq_vc_reservation_history_created","is_unique":true,"has_filter":true,"filter_definition":"([action]=N'CREATED')"}
{"tabela":"vc_reset_tokens","name":"uq_vc_reset_tokens_token_hash","is_unique":true,"has_filter":false,"filter_definition":null}
(21 linha(s))
```

#### v1-3c-Q6

SQL:

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME = N'vc_blocked_times' AND COLUMN_NAME IN (N'employee_id', N'start_at', N'end_at', N'created_by', N'created_at', N'date', N'time_start', N'time_end', N'start', N'end'))
   OR (TABLE_NAME = N'vc_reset_tokens' AND COLUMN_NAME IN (N'id', N'token_hash', N'used_at', N'created_at', N'user_id', N'expires_at', N'reset_token'))
   OR (TABLE_NAME = N'vc_users' AND COLUMN_NAME = N'password_changed_at')
   OR (TABLE_NAME = N'vc_clinical_visits' AND COLUMN_NAME = N'completed_by')
   OR (TABLE_NAME = N'vc_reservations' AND COLUMN_NAME IN (N'created_by', N'service_id'))
   OR (TABLE_NAME = N'vc_animal_measurements' AND COLUMN_NAME IN (N'recorded_by', N'updated_by', N'deleted_at', N'deleted_by', N'delete_reason'))
ORDER BY TABLE_NAME, COLUMN_NAME;
```

Saída literal:

```
{"TABLE_NAME":"vc_animal_measurements","COLUMN_NAME":"delete_reason","DATA_TYPE":"nvarchar","CHARACTER_MAXIMUM_LENGTH":500,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_animal_measurements","COLUMN_NAME":"deleted_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_animal_measurements","COLUMN_NAME":"deleted_by","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_animal_measurements","COLUMN_NAME":"recorded_by","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_animal_measurements","COLUMN_NAME":"updated_by","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"created_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"created_by","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"date","DATA_TYPE":"datetime","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"employee_id","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"end","DATA_TYPE":"datetime","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"end_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"start","DATA_TYPE":"datetime","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"start_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"time_end","DATA_TYPE":"nvarchar","CHARACTER_MAXIMUM_LENGTH":255,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_blocked_times","COLUMN_NAME":"time_start","DATA_TYPE":"nvarchar","CHARACTER_MAXIMUM_LENGTH":255,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_clinical_visits","COLUMN_NAME":"completed_by","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_reservations","COLUMN_NAME":"created_by","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_reservations","COLUMN_NAME":"service_id","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_reset_tokens","COLUMN_NAME":"created_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_reset_tokens","COLUMN_NAME":"expires_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_reset_tokens","COLUMN_NAME":"id","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_reset_tokens","COLUMN_NAME":"token_hash","DATA_TYPE":"binary","CHARACTER_MAXIMUM_LENGTH":32,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_reset_tokens","COLUMN_NAME":"used_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
{"TABLE_NAME":"vc_reset_tokens","COLUMN_NAME":"user_id","DATA_TYPE":"uniqueidentifier","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"NO"}
{"TABLE_NAME":"vc_users","COLUMN_NAME":"password_changed_at","DATA_TYPE":"datetime2","CHARACTER_MAXIMUM_LENGTH":null,"IS_NULLABLE":"YES"}
(25 linha(s))
```

#### v1-3c-Q7

SQL:

```sql
SELECT OBJECT_ID(N'dbo.vc_employee_schedules', N'U') AS schedules,
       OBJECT_ID(N'dbo.vc_services', N'U') AS services,
       OBJECT_ID(N'dbo.vc_employee_services', N'U') AS employee_services,
       OBJECT_ID(N'dbo.vc_animal_owners', N'U') AS animal_owners;
```

Saída literal:

```
{"schedules":462624691,"services":222623836,"employee_services":366624349,"animal_owners":2130106629}
(1 linha(s))
```

#### v1-3c-Q8

SQL:

```sql
SELECT [id], [timestamp], [name] FROM [dbo].[migrations] ORDER BY [timestamp];
```

Saída literal:

```
{"id":1,"timestamp":"1794657600000","name":"InitialSqlServer1794657600000"}
{"id":2,"timestamp":"1794744000000","name":"UniformSchemaAndAnimalCatalog1794744000000"}
{"id":3,"timestamp":"1794830400000","name":"AnimalMeasurementsAndMetadata1794830400000"}
{"id":4,"timestamp":"1794916800000","name":"ConfigurableMeasurementTypes1794916800000"}
{"id":5,"timestamp":"1795003200000","name":"UserRolesAndEmployees1795003200000"}
{"id":6,"timestamp":"1795089600000","name":"ReservationsAndClinicalVisits1795089600000"}
{"id":7,"timestamp":"1795176000000","name":"MeasurementsHardening1795176000000"}
{"id":8,"timestamp":"1795262400000","name":"HashedResetTokens1795262400000"}
{"id":9,"timestamp":"1795348800000","name":"IntegrityAndLifecycle1795348800000"}
{"id":10,"timestamp":"1795435200000","name":"AnimalOwners1795435200000"}
{"id":11,"timestamp":"1795521600000","name":"ReservationAuthorship1795521600000"}
{"id":12,"timestamp":"1795608000000","name":"ClinicServices1795608000000"}
{"id":13,"timestamp":"1795694400000","name":"SchedulesAndBlocks1795694400000"}
{"id":14,"timestamp":"1795780800000","name":"ClinicalIntegrity1795780800000"}
(14 linha(s))
```

Correção de 3a-6: sem snapshot pré-migração registado, o baseline não existe. O veredicto é N/A. A Q2 (3c) dá os mesmos totais, 0 e 0.

Nota de 3a-4: a Q6 (3c) confirma que `reset_token` está ausente. Mesmo que o agregado inválido fosse corrigido, a query falharia por coluna inexistente.

#### Esperado e veredicto: 3c

| Item | Veredicto | Motivo |
|---|---|---|
| Q1 triggers | OK | 3 linhas, todas com `is_disabled` = false. Os dois triggers de integridade estão em `vc_clinical_visits` e `vc_reservations`, com `INSERT,UPDATE` e sem INSTEAD OF. O trigger do histórico é INSTEAD OF, com `UPDATE,DELETE`. |
| Q2 totais | OK | 0 CHECK não confiáveis e 0 FK não confiáveis. Não aumentou face a 3a-6 (0 e 0). |
| Q3 CHECK | OK | 14 linhas, com `is_not_trusted` = 0 e `is_disabled` = 0. Os 14 nomes esperados estão presentes. |
| Q4 FK | OK | 16 linhas, com `is_not_trusted` = 0, `is_disabled` = 0 e `NO_ACTION`. Os 16 nomes esperados estão presentes. |
| Q5 índices | OK | 21 linhas. Os cinco `uq_*` têm `is_unique` = 1. Têm filtro: `uq_vc_animal_owners_active`, `uq_vc_animal_owners_primary`, `ix_vc_animal_owners_user_active`, `uq_vc_clinical_visits_animal_in_progress` e `uq_vc_reservation_history_created`. `uq_vc_reset_tokens_token_hash` não tem filtro, como esperado. |
| Q6 colunas | OK | `start_at` e `end_at` são datetime2 NO. `employee_id` e `created_by` são YES. `date`, `time_start`, `time_end`, `start` e `end` são YES, com tipos inalterados. `token_hash` é binary(32) NO. `reset_token` está ausente (0 linhas). `recorded_by` é NO. Existem `password_changed_at`, `completed_by`, `created_by`, `service_id` e as colunas de medições. `vc_blocked_times.created_at` é NO: o procedimento não indica a nulidade, mas é coerente com a migração. |
| Q7 tabelas | OK | As quatro OBJECT_ID são não nulas. |
| Q8 migrations | OK | 14 linhas, ids 1 a 14. As oito do intervalo (ids 7 a 14, de `MeasurementsHardening1795176000000` a `ClinicalIntegrity1795780800000`) estão presentes. `ClinicalIntegrity1795780800000` é a última. |

Nenhuma divergência na secção 3c.

**Guarda de runtime** (primeira query da ligação): DB_NAME() = vetcare_dev: OK; SERVERPROPERTY(MachineName) = nome deste computador (sem distinguir maiúsculas): OK.

## 3d. schema:log (só lê o SQL que um schema:sync faria; não executa nada)

Comando, tal como no procedimento:

```
npx ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts 2>&1 | tail -80
```

O comando foi corrido duas vezes, ambas só de leitura. A segunda serviu para gravar a saída literal abaixo sem a transcrever à mão.

Saída literal:

```
(node:19500) [DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.
(Use `node --trace-deprecation ...` to show where the warning was created)
-----------------------------------------------------------------
-- Schema synchronization will execute following sql queries (60):
-----------------------------------------------------------------
ALTER TABLE "vc_animals" DROP CONSTRAINT "fk_vc_animals_breed_species";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "fk_vc_clinical_visits_reservation_animal";
ALTER TABLE "vc_animal_measurements" DROP CONSTRAINT "fk_vc_animal_measurements_clinical_visit";
DROP INDEX "ix_vc_employee_schedules_employee_day" ON "vc_employee_schedules";
DROP INDEX "ix_vc_blocked_times_start_end" ON "vc_blocked_times";
DROP INDEX "ix_vc_blocked_times_employee_start" ON "vc_blocked_times";
DROP INDEX "ix_vc_animal_measurements_animal_date" ON "vc_animal_measurements";
DROP INDEX "ix_vc_animal_owners_user_active" ON "vc_animal_owners";
ALTER TABLE "vc_roles" DROP CONSTRAINT "ck_vc_roles_code";
ALTER TABLE "vc_job_titles" DROP CONSTRAINT "ck_vc_job_titles_code";
ALTER TABLE "vc_employees" DROP CONSTRAINT "ck_vc_employees_dates";
ALTER TABLE "vc_users" DROP CONSTRAINT "ck_vc_users_email_normalized";
ALTER TABLE "vc_users" DROP CONSTRAINT "ck_vc_users_nif";
ALTER TABLE "vc_system_settings" DROP CONSTRAINT "ck_vc_system_settings_code";
ALTER TABLE "vc_reservations" DROP CONSTRAINT "ck_vc_reservations_interval";
ALTER TABLE "vc_reservations" DROP CONSTRAINT "ck_vc_reservations_status";
ALTER TABLE "vc_reservations" DROP CONSTRAINT "ck_vc_reservations_confirmed";
ALTER TABLE "vc_reservations" DROP CONSTRAINT "ck_vc_reservations_pending";
ALTER TABLE "vc_reservations" DROP CONSTRAINT "ck_vc_reservations_cancelled";
ALTER TABLE "vc_reservation_history" DROP CONSTRAINT "ck_vc_reservation_history_action";
ALTER TABLE "vc_reservation_history" DROP CONSTRAINT "ck_vc_reservation_history_old_data";
ALTER TABLE "vc_reservation_history" DROP CONSTRAINT "ck_vc_reservation_history_new_data";
ALTER TABLE "vc_employee_schedules" DROP CONSTRAINT "ck_vc_employee_schedules_day_of_week";
ALTER TABLE "vc_employee_schedules" DROP CONSTRAINT "ck_vc_employee_schedules_time";
ALTER TABLE "vc_employee_schedules" DROP CONSTRAINT "ck_vc_employee_schedules_validity";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "ck_vc_clinical_visits_status";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "ck_vc_clinical_visits_dates";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "ck_vc_clinical_visits_in_progress";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "ck_vc_clinical_visits_completed";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "ck_vc_clinical_visits_voided";
ALTER TABLE "vc_blocked_times" DROP CONSTRAINT "ck_vc_blocked_times_interval";
ALTER TABLE "vc_reservations" DROP COLUMN "row_version";
ALTER TABLE "vc_blocked_times" DROP COLUMN "date";
ALTER TABLE "vc_blocked_times" DROP COLUMN "time_start";
ALTER TABLE "vc_blocked_times" DROP COLUMN "time_end";
ALTER TABLE "vc_blocked_times" DROP COLUMN "start";
ALTER TABLE "vc_blocked_times" DROP COLUMN "end";
ALTER TABLE "vc_users" DROP CONSTRAINT "DF_af8f4b1d2bb3fa80e8b52dd31d2";
ALTER TABLE "vc_users" ADD CONSTRAINT "DF_af8f4b1d2bb3fa80e8b52dd31d2" DEFAULT getdate() FOR "created_at";
ALTER TABLE "vc_users" ALTER COLUMN "updated_at" datetime2 NOT NULL;
ALTER TABLE "vc_users" DROP CONSTRAINT "DF_1f868ec03fdba1695a65910c619";
ALTER TABLE "vc_users" ADD CONSTRAINT "DF_1f868ec03fdba1695a65910c619" DEFAULT getdate() FOR "updated_at";
DROP INDEX "ix_vc_reservations_status_start" ON "vc_reservations";
ALTER TABLE "vc_reservations" DROP CONSTRAINT "DF_cd41567e93d787ca0b9af42dd93";
ALTER TABLE "vc_reservations" ADD CONSTRAINT "DF_cd41567e93d787ca0b9af42dd93" DEFAULT 'PENDING' FOR "status";
ALTER TABLE "vc_clinical_visits" DROP CONSTRAINT "DF_5049945e18bcc9efa64864a0a7a";
ALTER TABLE "vc_clinical_visits" ADD CONSTRAINT "DF_5049945e18bcc9efa64864a0a7a" DEFAULT 'IN_PROGRESS' FOR "status";
DROP INDEX "ix_vc_animal_measurements_animal_type_date" ON "vc_animal_measurements";
ALTER TABLE "vc_animal_measurements" DROP CONSTRAINT "DF_189d06ae2a4a4d421d97f696089";
ALTER TABLE "vc_animal_measurements" ADD CONSTRAINT "DF_189d06ae2a4a4d421d97f696089" DEFAULT getdate() FOR "created_at";
ALTER TABLE "vc_animal_measurements" ALTER COLUMN "updated_at" datetime2 NOT NULL;
ALTER TABLE "vc_animal_measurements" DROP CONSTRAINT "DF_b3ce9ce6f20c14934e31f5e2e45";
ALTER TABLE "vc_animal_measurements" ADD CONSTRAINT "DF_b3ce9ce6f20c14934e31f5e2e45" DEFAULT getdate() FOR "updated_at";
CREATE UNIQUE INDEX "REL_1d2b1396cdda9b098ea0295841" ON "vc_employees" ("user_id") WHERE "user_id" IS NOT NULL;
CREATE INDEX "ix_vc_reservations_status_start" ON "vc_reservations" ("status", "start_at");
CREATE INDEX "ix_vc_employee_schedules_employee_day" ON "vc_employee_schedules" ("employee_id", "day_of_week", "valid_from");
CREATE INDEX "ix_vc_blocked_times_employee_start" ON "vc_blocked_times" ("employee_id", "start_at");
CREATE INDEX "ix_vc_blocked_times_start_end" ON "vc_blocked_times" ("start_at", "end_at");
CREATE INDEX "ix_vc_animal_measurements_animal_type_date" ON "vc_animal_measurements" ("animal_id", "measurement_type_id", "measured_at", "created_at", "id");
CREATE INDEX "ix_vc_animal_owners_user_active" ON "vc_animal_owners" ("user_id", "animal_id") WHERE [ended_at] IS NULL;
```

#### Esperado e veredicto: 3d

**Veredicto: DIVERGE.**

- Esperado: `Your schema is up to date` OU apenas as três `DROP CONSTRAINT` das FKs compostas (`fk_vc_animals_breed_species`, `fk_vc_clinical_visits_reservation_animal`, `fk_vc_animal_measurements_clinical_visit`).
- Real: `Schema synchronization will execute following sql queries (60)`, ou seja, 60 instruções. As três FKs esperadas estão nas linhas 1 a 3. Há 57 instruções que não estavam no esperado.

| Tipo de instrução | Nº | Objetos |
|---|---|---|
| DROP CONSTRAINT (FK esperadas) | 3 | `fk_vc_animals_breed_species`, `fk_vc_clinical_visits_reservation_animal`, `fk_vc_animal_measurements_clinical_visit` |
| DROP INDEX | 7 | `ix_vc_employee_schedules_employee_day`, `ix_vc_blocked_times_start_end`, `ix_vc_blocked_times_employee_start`, `ix_vc_animal_owners_user_active`, `ix_vc_animal_measurements_animal_date`, `ix_vc_reservations_status_start`, `ix_vc_animal_measurements_animal_type_date` |
| CREATE INDEX / CREATE UNIQUE INDEX | 7 | `REL_1d2b1396cdda9b098ea0295841` (`vc_employees.user_id`, único, filtrado), `ix_vc_reservations_status_start`, `ix_vc_employee_schedules_employee_day`, `ix_vc_blocked_times_employee_start`, `ix_vc_blocked_times_start_end`, `ix_vc_animal_owners_user_active`, `ix_vc_animal_measurements_animal_type_date` |
| DROP CONSTRAINT (CHECK) | 23 | `ck_vc_roles_code`, `ck_vc_job_titles_code`, `ck_vc_employees_dates`, `ck_vc_users_email_normalized`, `ck_vc_users_nif`, `ck_vc_system_settings_code`, `ck_vc_reservations_interval`, `ck_vc_reservations_status`, `ck_vc_reservations_confirmed`, `ck_vc_reservations_pending`, `ck_vc_reservations_cancelled`, `ck_vc_reservation_history_action`, `ck_vc_reservation_history_old_data`, `ck_vc_reservation_history_new_data`, `ck_vc_clinical_visits_status`, `ck_vc_clinical_visits_dates`, `ck_vc_clinical_visits_in_progress`, `ck_vc_clinical_visits_completed`, `ck_vc_clinical_visits_voided`, `ck_vc_employee_schedules_day_of_week`, `ck_vc_employee_schedules_time`, `ck_vc_employee_schedules_validity`, `ck_vc_blocked_times_interval` |
| DROP COLUMN | 6 | `vc_reservations.row_version`; `vc_blocked_times.date`, `time_start`, `time_end`, `start`, `end` |
| DROP + ADD DEFAULT | 12 (6 pares) | `DF_af8f4b1d2bb3fa80e8b52dd31d2` (`vc_users.created_at`), `DF_1f868ec03fdba1695a65910c619` (`vc_users.updated_at`), `DF_cd41567e93d787ca0b9af42dd93` (`vc_reservations.status`), `DF_5049945e18bcc9efa64864a0a7a` (`vc_clinical_visits.status`), `DF_189d06ae2a4a4d421d97f696089` (`vc_animal_measurements.created_at`), `DF_b3ce9ce6f20c14934e31f5e2e45` (`vc_animal_measurements.updated_at`) |
| ALTER COLUMN | 2 | `vc_users.updated_at` e `vc_animal_measurements.updated_at` para `datetime2 NOT NULL` |

Soma: 3 + 7 + 7 + 23 + 6 + 12 + 2 = 60.

Pontos de risco que o orquestrador tem de decidir. Não foram corrigidos.

- `schema:sync` (proibido nesta etapa) apagaria as colunas legadas `date`, `time_start`, `time_end`, `start` e `end` de `vc_blocked_times`, e a coluna `row_version` de `vc_reservations`. Se tiverem dados, essa informação perde-se.
- Cinco CHECK criados pelas migrations (3c-Q3) aparecem como DROP, porque as entidades não os declaram: `ck_vc_employee_schedules_day_of_week`, `ck_vc_employee_schedules_time`, `ck_vc_employee_schedules_validity`, `ck_vc_blocked_times_interval` e `ck_vc_reservation_history_action`.
- Os índices de `vc_blocked_times`, `vc_animal_owners`, `vc_reservations` e `vc_animal_measurements` que aparecem em DROP/CREATE podem ter definições diferentes das das entidades (colunas, ordem, filtro). O procedimento pede que isto seja reportado e que não se assuma que é inofensivo.
- `REL_1d2b1396cdda9b098ea0295841` (índice único filtrado em `vc_employees.user_id`) não existe na BD, mas as entidades pedem-no.

**Guarda de runtime** (primeira query da ligação): DB_NAME() = vetcare_dev: OK; SERVERPROPERTY(MachineName) = nome deste computador (sem distinguir maiúsculas): OK.

#### 4. Triggers (OBJECT_DEFINITION)

SQL:

```sql
SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.tr_vc_clinical_visits_reservation_integrity')) AS d1, OBJECT_DEFINITION(OBJECT_ID(N'dbo.tr_vc_reservations_visit_integrity')) AS d2
```

Saída literal:

```
{"d1":"\n      CREATE TRIGGER [dbo].[tr_vc_clinical_visits_reservation_integrity] ON [dbo].[vc_clinical_visits]\n      AFTER INSERT, UPDATE\n      AS\n      BEGIN\n        SET NOCOUNT ON;\n        IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;\n        IF EXISTS (SELECT 1 FROM deleted)\n        BEGIN\n          -- UPDATE: id, animal_id and reservation_id are immutable (null-safe comparison through INTERSECT).\n          IF (UPDATE([id]) OR UPDATE([animal_id]) OR UPDATE([reservation_id]))\n            AND EXISTS (SELECT 1 FROM deleted AS d WHERE NOT EXISTS (\n              SELECT 1 FROM inserted AS i WHERE i.[id] = d.[id] AND i.[animal_id] = d.[animal_id]\n                AND EXISTS (SELECT i.[reservation_id] INTERSECT SELECT d.[reservation_id])))\n            THROW 51104, 'vc_clinical_visits.animal_id and reservation_id cannot be changed.', 1;\n          RETURN;\n        END\n        -- INSERT: a visit linked to a reservation requires that reservation to be CONFIRMED (walk-ins have no reservation).\n        IF EXISTS (SELECT 1 FROM inserted AS i\n          JOIN [dbo].[vc_reservations] AS r WITH (READCOMMITTEDLOCK) ON r.[id] = i.[reservation_id]\n          WHERE r.[status] <> N'CONFIRMED')\n          THROW 51105, 'A clinical visit can only be created for a CONFIRMED reservation.', 1;\n      END\n    ","d2":"\n      CREATE TRIGGER [dbo].[tr_vc_reservations_visit_integrity] ON [dbo].[vc_reservations]\n      AFTER INSERT, UPDATE\n      AS\n      BEGIN\n        SET NOCOUNT ON;\n        -- Only status transitions are checked; on INSERT UPDATE([status]) is true.\n        IF NOT UPDATE([status]) RETURN;\n        IF EXISTS (SELECT 1 FROM inserted AS i LEFT JOIN deleted AS d ON d.[id] = i.[id]\n          WHERE i.[status] = N'COMPLETED' AND (d.[id] IS NULL OR d.[status] <> i.[status])\n            AND NOT EXISTS (SELECT 1 FROM [dbo].[vc_clinical_visits] AS v WITH (READCOMMITTEDLOCK)\n              WHERE v.[reservation_id] = i.[id] AND v.[status] = N'COMPLETED'))\n          THROW 51106, 'A reservation can only become COMPLETED with a COMPLETED clinical visit.', 1;\n        IF EXISTS (SELECT 1 FROM inserted AS i LEFT JOIN deleted AS d ON d.[id] = i.[id]\n          WHERE i.[status] IN (N'CANCELLED', N'NO_SHOW', N'PENDING') AND (d.[id] IS NULL OR d.[status] <> i.[status])\n            AND EXISTS (SELECT 1 FROM [dbo].[vc_clinical_visits] AS v WITH (READCOMMITTEDLOCK)\n              WHERE v.[reservation_id] = i.[id] AND v.[status] IN (N'IN_PROGRESS', N'COMPLETED')))\n          THROW 51107, 'A reservation with an IN_PROGRESS or COMPLETED clinical visit cannot become CANCELLED, NO_SHOW or PENDING.', 1;\n      END\n    "}
(1 linha(s))
```

Comparação d1 (VISIT_TRIGGER): IGUAL

Comparação d2 (RESERVATION_TRIGGER): IGUAL

## 4. Triggers de 1795780800000: definição na BD contra a migração

- Esperado: texto dos dois `CREATE TRIGGER` da BD igual ao do `up()` em `src/database/migrations/1795780800000-ClinicalIntegrity.ts`, depois de normalizar (CRLF→LF, espaços colapsados, trim).
- Real: `d1` (`tr_vc_clinical_visits_reservation_integrity`) IGUAL; `d2` (`tr_vc_reservations_visit_integrity`) IGUAL.
- **Veredicto: OK** (ambos IGUAL).

## Quadro-resumo

| Item | Veredicto | Motivo curto |
|---|---|---|
| 3a-1 `npm run db:migrations:show` | N/A | Não estava na lista pedida; não corrido. |
| 3a-2 registo de migrations | N/A | Baseline pré-migração. O critério pós-migração é a Q8, que dá OK. |
| 3a-3 pré-verificação de dados | OK | 0 nas 10 colunas. |
| 3a-4 `vc_reset_tokens` | N/A | Query inválida no SQL Server (erro 130: agregado sobre subquery). Também lê `reset_token`, que a Q6 confirma removida. Não corrigida. |
| 3a-5 tipos de `vc_blocked_times` | OK | Tipos inalterados. Nulidade YES por desenho da migração. |
| 3a-5b dependências | OK | Única linha: CHECK `ck_vc_blocked_times_interval`, criado pela migração, sobre `start_at`/`end_at`. |
| 3a-6 totais CHECK/FK/trigger | N/A | Sem snapshot pré-migração para comparar. Valores: 0, 0, 1. |
| 3a-7 índices de `vc_reset_tokens` | OK | `pk_vc_reset_tokens` e `ix_vc_reset_tokens_user_id`, mais `uq_vc_reset_tokens_token_hash` criado pela migração. |
| 3a-8a fuso `GMT Standard Time` | OK | 1 linha. |
| 3a-8b classificação de fusos | OK (vazio) | `vc_blocked_times` sem linhas. O teste de fuso (R19) não foi exercido. |
| 3c Q1 triggers | OK | 3 linhas, como esperado. |
| 3c Q2 totais não confiáveis | OK | 0 e 0. Não aumentou. |
| 3c Q3 CHECK | OK | 14 de 14, trusted e não desativados. |
| 3c Q4 FK | OK | 16 de 16, trusted, NO_ACTION. |
| 3c Q5 índices | OK | 21 linhas; unicidade e filtros conforme o esperado. |
| 3c Q6 colunas e nulidades | OK | Confere. `reset_token` ausente. |
| 3c Q7 tabelas novas | OK | 4 de 4 não nulas. |
| 3c Q8 registo de migrations | OK | 14 linhas, ClinicalIntegrity no fim. |
| 3d schema:log | **DIVERGE** | 60 instruções em vez de "up to date" ou 3 DROP CONSTRAINT. Ver secção 3d. Nada foi corrigido. |
| 4 triggers (definição) | OK | d1 IGUAL, d2 IGUAL. |

**DIVERGE: 1 item (3d).** As 3 FKs esperadas estão presentes, mas há 57 instruções extra. A lista completa e a saída literal estão na secção 3d.
