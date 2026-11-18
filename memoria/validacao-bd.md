# Validação das migrations em SQL Server (1795176000000 a 1795780800000)

Repositório: `D:\my-own-projects\Projeto\api-vetcare-angular` (branch `feat/reservations-clinical-visits`).
Elaborado em 2026-11-17, apenas com leitura de código.

## 1. Estado

**EXECUTADO em `vetcare_dev` (2026-11-17), fases V.0 a V.4.** O utilizador autorizou `vetcare_dev` como BD de testes (decisão 2, 2026-11-17). As 14 migrations já estavam aplicadas antes da validação. Nenhuma migration nem comando `schema:sync`/`migration:generate` foi corrido, e não houve DDL.

- **Sem backup:** `BACKUP DATABASE ... COPY_ONLY` foi negado (erro 3013/262, a conta não tem permissão). Em substituição, foi tirada uma impressão digital por tabela (`COUNT_BIG` + `CHECKSUM_AGG(BINARY_CHECKSUM(*))`, 22 tabelas, 38 linhas) antes e no fim. Deu IGUAL depois de cada fase: V.2, V.2b, V.3b e V.3a.
- **Regras seguidas:**
  - Os testes T correram só em `BEGIN TRAN ... ROLLBACK`.
  - Os testes C1/C2 usaram uma fixture com IDs fixos `C0000000-…`, em commit, e uma limpeza dirigida em que a contagem batia com o `@@ROWCOUNT`.
  - As linhas existentes nunca foram tocadas.
- **Resultados** (evidências em `memoria/evidencias/`):
  - V.0 (`validacao-v0.md`): guarda OK; compatibilidade 170; desvio UTC 0; 14 migrations `[X]`.
  - V.1 (`validacao-v1.md`): 3c Q1–Q8 OK; os triggers coincidem com o texto da migration. A 3d dá 60 instruções, classificadas na V.1b (`validacao-v1b.md`: A 9 / B 24 / C 19 / D 8).
  - V.2 e V.2b (`validacao-v2.md`, `validacao-v2b.md`): T0–T12 e 4.3 conforme o esperado corrigido. O THROW dos triggers condena a transação (`XACT_STATE()` = -1, COMMIT → 3930).
  - V.3b (`validacao-v3b.md`): C3a/C3b repõem `LOCK_TIMEOUT -1`. C3c: depois de um THROW de trigger, a reposição dá ENOTBEGUN e a ligação fica com 5000, que é o risco residual documentado em `src/app/core/persistence/lock-timeout.ts:30-36`. C4: `WITH (UPDLOCK, ROWLOCK)` → 1222 em 5029 ms.
  - V.3a (`validacao-v3a.md`): C1 → 1222 em 5015 ms. C2a → 51107, (CONFIRMED, IN_PROGRESS). C2b → 51105, (CANCELLED, sem visita).
  - V.4a/V.4a2: expectativas corrigidas neste documento (3a-4, 3d, T6, T10 e checklist).
- **Para outra BD (produção ou cópia):** antes de executar, continuam a ser necessárias uma autorização explícita e um backup verificado.

Cada afirmação deste documento tem referência file:linha na secção 9.

### 1.1 Desvios face ao pedido original (ler antes de executar)

1. **O ambiente por omissão aponta para `vetcare_dev`.** `.env.mssql.local` é o ficheiro usado quando `VETCARE_ENV_FILE` não está definida (`src/database/database.config.ts:5`) e tem `TYPEORM_DATABASE` igual a `vetcare_dev`. O procedimento força `VETCARE_ENV_FILE` para um ficheiro de teste fora do repositório.
2. **Variáveis herdadas do shell ganham ao ficheiro.** `dotenv` (`package.json:42`) não sobrescreve variáveis já definidas: `node_modules/dotenv/lib/main.js:340` mostra `override` desligado por omissão. Antes de qualquer comando, limpar as `TYPEORM_*` do shell (passo 3.0).
3. **`schema:log` não dá saída vazia por desenho.** Três FKs compostas existem só na BD (`docs/SCHEMA_MIGRATION.md:139` e `:187`) e as entidades declaram `createForeignKeyConstraints: false`. O TypeORM propõe o `DROP` dessas FKs. Na prática dá 60 instruções, todas classificadas na V.1b (passo 3d); só uma instrução fora dessa lista é divergência.
4. **Não há verificação entre migrations.** `migration:run` aplica todas as pendentes numa só transação (`--transaction all`). A verificação por migration é feita pelos `THROW` finais de cada ficheiro e pelas queries da secção 3c. Parar numa migration intermédia exigiria outra estratégia, que fica para decisão do orquestrador.
5. **"Conexão reutilizada" não se verifica no sqlcmd.** Cada sessão nova começa com `LOCK_TIMEOUT -1`. Este teste exige o pool da aplicação (secção 5, C3).
6. **Lacuna de regra na BD.** Uma visita `COMPLETED` pode passar a `VOIDED` sem bloqueio da BD, deixando a reserva `COMPLETED` sem visita concluída (teste T11). A regra depende da aplicação. Decisão em aberto (secção 6, R9).

## 2. Pré-requisitos

### 2.1 Base de dados de teste isolada

- Nome dedicado (por exemplo `vetcare_validacao_<AAAAMMDD>`), **diferente de `vetcare_dev`**.
- Servidor dedicado: contentor `mcr.microsoft.com/mssql/server` ou host local de teste. O contentor exige variáveis da própria imagem (aceitação da licença e palavra-passe de administrador); são da imagem, não do projeto, e não se escrevem aqui.
- Obtida por restauro de uma cópia (com `MOVE` para caminhos novos) ou por contentor novo.
- Nível de compatibilidade `>= 130`: as migrations usam `ISJSON` (`docs/SCHEMA_MIGRATION.md:88`).
- Processo Node e servidor no mesmo fuso, UTC (`src/database/data-source.ts:1-2`, `docs/SCHEMA_MIGRATION.md:39` e `:109`).

### 2.2 Backup ou snapshot antes de começar
> Na execução de 2026-11-17 em `vetcare_dev`, o BACKUP foi negado por falta de permissão (3013/262) e foi substituído pela impressão digital por tabela (secção 1). Para outra BD, este passo continua obrigatório.

Fazer o backup **antes** da primeira migration. Serve para repetir os testes e para voltar ao baseline. As migrations não fazem backup (`docs/SCHEMA_MIGRATION.md:7`) e as `down()` do intervalo, exceto a de 1795780800000 (que só remove os triggers), não permitem reverter; por isso o backup é o caminho de volta.

```sql
BACKUP DATABASE [<BD_TESTE>] TO DISK = N'<CAMINHO_BACKUP_BASELINE>' WITH COPY_ONLY, INIT, CHECKSUM;
```

Para repor o baseline:

```sql
RESTORE DATABASE [<BD_TESTE>] FROM DISK = N'<CAMINHO_BACKUP_BASELINE>' WITH REPLACE, CHECKSUM;
```

`WITH REPLACE` apaga a BD com o mesmo nome. Confirmar que `<BD_TESTE>` é diferente de `vetcare_dev` antes de cada restauro.

### 2.3 Variáveis de ambiente (apenas nomes; nunca valores)

Lidas pelo caminho de migrations (`data-source.ts` → `environment.ts` → `database.config.ts`):

| Nome | Onde é lida | Obrigatória | Notas |
|---|---|---|---|
| `VETCARE_ENV_FILE` | `src/database/database.config.ts:5`, `src/database/environment.ts:5` | Não (default `.env.mssql.local`) | **Obrigatória neste procedimento**: caminho absoluto de um ficheiro fora do repositório |
| `TYPEORM_CONNECTION` | `database.config.ts:9` | Sim | Tem de ser `mssql` |
| `TYPEORM_HOST` | `database.config.ts:12`, `:21` | Sim | Host de teste |
| `TYPEORM_PORT` | `database.config.ts:15` | Não | Default 1433 |
| `TYPEORM_USERNAME` | `database.config.ts:12`, `:23` | Sim | Utilizador de teste, com permissões de DDL só na BD de teste |
| `TYPEORM_PASSWORD` | `database.config.ts:12`, `:24` | Sim | Não escrever em comandos, logs nem relatórios |
| `TYPEORM_DATABASE` | `database.config.ts:12`, `:25` | Sim | Tem de ser a BD de teste |
| `TYPEORM_ENCRYPT` | `database.config.ts:32` | Não | Default ligado; só o valor `false` desliga |
| `TYPEORM_TRUST_SERVER_CERTIFICATE` | `database.config.ts:33` | Não | Só o valor `true` ativa; apenas para certificado autoassinado de desenvolvimento (`.env.mssql.example:9-10`) |

As restantes variáveis de `.env.mssql.example` (`JWT_SECRET_KEY`, `FRONTEND_URL`, `TRUST_PROXY`, `SWAGGER_ENABLED`, `EMAIL_USER`, `EMAIL_PASSWORD`, `SEED_ADMIN_*`) não são lidas por este caminho.

O ficheiro de ambiente de teste deve ficar fora do repositório, ou ser acrescentado ao `.gitignore` (só `.env.mssql.local` está lá, `.gitignore:44`). Não copiar `.env.mssql.local` para esse ficheiro.

### 2.4 Confirmação de que o host não é produção

Fazer antes de cada execução. Se qualquer item falhar, parar.

1. Ligar à BD de teste e correr:

   ```sql
   SELECT DB_NAME() AS bd, @@SERVERNAME AS servidor, SERVERPROPERTY('MachineName') AS maquina,
          DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS collation,
          (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS nivel_compat,
          DATEDIFF(MINUTE, SYSUTCDATETIME(), SYSDATETIME()) AS desvio_minutos_local_utc;
   ```

   Esperado: `bd` é o nome de teste (diferente de `vetcare_dev`); `servidor` e `maquina` são o contentor ou host de teste; `nivel_compat >= 130`; `desvio_minutos_local_utc = 0`. Se o desvio não for 0, registar e parar: as migrations assumem o mesmo fuso do processo (`docs/SCHEMA_MIGRATION.md:39`).

   **Nota sobre a origem da cópia.** Esta query mede o fuso da BD de teste, não o do servidor de onde vieram os dados antigos. A mesma query do desvio tem de ser corrida no servidor de origem (de onde vem a cópia), só em leitura e só com autorização explícita. Se o desvio na origem for diferente de 0, ou se a origem tiver mudado de fuso ou de horário de verão (a query só mostra o desvio do momento em que corre), os valores antigos de `measured_at` (`1795176000000-MeasurementsHardening.ts:9`), de `expires_at` (`1795262400000-HashedResetTokens.ts:72`) e de `vc_animals.created_at` (`1794744000000-UniformSchemaAndAnimalCatalog.ts:68`), copiado para `vc_animal_owners.assigned_at` (`1795435200000-AnimalOwners.ts:115`), ficam desfasados pelo desvio. Registar e decidir antes de migrar produção.

2. Comparar o servidor e a BD com `TYPEORM_HOST` e `TYPEORM_DATABASE` do ficheiro de teste, sem colar esses valores num relatório.
3. Confirmar com a equipa que o servidor não é de produção. O procedimento não o consegue inferir sozinho.

## 3. Passo a passo

### 3.0 Preparação do shell (PowerShell, na raiz do repositório)

```powershell
# Remove TYPEORM_* e VETCARE_ENV_FILE herdadas (o dotenv não as sobrescreve)
Get-ChildItem Env: | Where-Object { $_.Name -like 'TYPEORM_*' -or $_.Name -eq 'VETCARE_ENV_FILE' } | ForEach-Object { Remove-Item "Env:$($_.Name)" }
# Aponta para o ficheiro de teste, fora do repositório
$env:VETCARE_ENV_FILE = '<CAMINHO_ABSOLUTO_FORA_DO_REPO>\vetcare-validacao.env'
Test-Path $env:VETCARE_ENV_FILE
```

Esperado: `Test-Path` devolve `True`. O comando `Get-ChildItem Env: | Where-Object { $_.Name -like 'TYPEORM_*' }` não deve devolver nada antes deste passo ser repetido.

### 3a. Baseline (apenas leitura)

1. Estado das migrations pelo TypeORM (`package.json:11`). Guardar a saída:

   ```powershell
   npm run db:migrations:show
   ```

   O TypeORM cria a tabela de controlo se ainda não existir (`node_modules/typeorm/migration/MigrationExecutor.js:342`).

2. Tabela de controlo, diretamente:

   ```sql
   SELECT [id], [timestamp], [name] FROM [dbo].[migrations] ORDER BY [timestamp];
   ```

   Nome da tabela: `migrations`, o default do TypeORM (`MigrationExecutor.js:33-35`), no schema `dbo` (`database.config.ts:26`). Colunas `timestamp` e `name` (`MigrationExecutor.js:368-377`); `id` (`MigrationExecutor.js:407`).
   Esperado: se o baseline estiver em `1795089600000-ReservationsAndClinicalVisits`, as pendentes são as oito do intervalo. Se faltar alguma anterior, o `migration:run` aplica-a também. Decidir antes de continuar.

3. Pré-verificação de dados. Esperado: 0 em todas as colunas. Cada uma corresponde a uma pré-condição `THROW` das migrations:

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

   Os valores de 51102 e 51103 só contam de facto quando a migration 1795780800000 correr; no baseline servem de sinal. Se a tabela `vc_blocked_times` já não tiver `start`/`end`, a query falha; isso indica um baseline posterior a 1795694400000 e deve ser registado.

4. Estado de `vc_reset_tokens`, que é o que a migration 1795262400000 apaga (`1795262400000-HashedResetTokens.ts:70-75`):

   ```sql
   SELECT COUNT(*) AS total,
          SUM(x.[sem_user_ou_validade]) AS sem_user_ou_validade,
          SUM(x.[expirados]) AS expirados,
          SUM(x.[formato_nao_hex_64]) AS formato_nao_hex_64,
          SUM(x.[utilizador_inexistente]) AS utilizador_inexistente
   FROM [dbo].[vc_reset_tokens] t
   CROSS APPLY (
     SELECT CASE WHEN t.[user_id] IS NULL OR t.[expires_at] IS NULL THEN 1 ELSE 0 END AS [sem_user_ou_validade],
            CASE WHEN t.[expires_at] <= SYSUTCDATETIME() THEN 1 ELSE 0 END AS [expirados],
            CASE WHEN DATALENGTH(t.[reset_token]) <> 128 OR t.[reset_token] COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%' THEN 1 ELSE 0 END AS [formato_nao_hex_64],
            CASE WHEN t.[user_id] IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[vc_users] u WHERE u.[id] = t.[user_id]) THEN 1 ELSE 0 END AS [utilizador_inexistente]
   ) x;
   ```

   **Defeito conhecido (V.1, 2026-11-17).**
   - A versão anterior desta query dava erro 130 no SQL Server, porque `SUM(CASE ... EXISTS (SELECT ...))` é um agregado sobre uma subquery.
   - A query lê `t.[reset_token]`, que a 1795262400000 remove. Por isso só se aplica antes dessa migration.
   - Forma corrigida validada em SQL Server (V.4a2, variável de tabela com 4 linhas: total 4, sem_user_ou_validade 1, expirados 1, formato_nao_hex_64 3, utilizador_inexistente 1); a forma antiga dá 130 no mesmo esquema.

   Registar os valores. O gerador atual produz 64 hexadecimais minúsculos (`src/app/core/generated/generate-reset-token.ts:16`), por isso só tokens antigos de outro formato seriam apagados. A validade é de 1 hora (`generate-reset-token.ts:4`), e o impacto é só em links de recuperação pendentes.

5. Tipos reais das colunas legadas de `vc_blocked_times` (risco R1). Esperado pela história de migrations: `date datetime NOT NULL`, `time_start nvarchar(255) NOT NULL`, `time_end nvarchar(255) NOT NULL`, `start datetime NOT NULL`, `end datetime NOT NULL` (`1794657600000-InitialSqlServer.ts:80-88`; a renomeação de `timeStart`/`timeEnd` está em `1794744000000-UniformSchemaAndAnimalCatalog.ts:32`):

   ```sql
   SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'vc_blocked_times'
     AND COLUMN_NAME IN (N'date', N'time_start', N'time_end', N'start', N'end')
   ORDER BY COLUMN_NAME;
   ```

   **Se o tipo ou a nulidade diferirem do esperado: parar.** A migration re-declara estes tipos no `ALTER COLUMN` (`1795694400000-SchedulesAndBlocks.ts:113`). Se o tipo real for outro, o `ALTER` muda-o.

   Dependências que impedem o `ALTER COLUMN` (índices, DEFAULT, CHECK, dependentes). Esperado: zero linhas.

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

   Na história de migrations lida não há índice, DEFAULT nem CHECK sobre estas colunas (`1794657600000-InitialSqlServer.ts:80-88`). A verificação real é esta query, porque a BD pode ter divergido.

6. Totais de CHECK e FK não confiáveis, para comparar depois (3c-Q2):

   ```sql
   SELECT (SELECT COUNT(*) FROM sys.check_constraints WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS checks_nao_confiaveis,
          (SELECT COUNT(*) FROM sys.foreign_keys WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS fks_nao_confiaveis,
          (SELECT COUNT(*) FROM sys.triggers WHERE [name] = N'tr_vc_reservation_history_append_only') AS trigger_historico_existe;
   ```

7. Índices de `vc_reset_tokens` antes da migration 1795262400000 (risco R17). O PK foi renomeado de `PK_resetToken` para `pk_vc_reset_tokens` em `1795003200000-UserRolesAndEmployees.ts:182`, e o índice de `user_id` de `IDX_RESET_TOKEN` para `ix_vc_reset_tokens_user_id` em `:183`. A precondição 51041 (`1795262400000-HashedResetTokens.ts:43-51`) só aceita estes dois nomes:

   ```sql
   SELECT [name], [type_desc], [is_primary_key]
   FROM sys.indexes
   WHERE [object_id] = OBJECT_ID(N'dbo.vc_reset_tokens') AND [type] > 0;
   ```

   Esperado: exatamente 2 linhas, `pk_vc_reset_tokens` (`is_primary_key = 1`) e `ix_vc_reset_tokens_user_id`. **Se aparecer `PK_resetToken` ou outro nome: parar**, porque a 51041 vai abortar a 1795262400000, com rollback de tudo (3b). Se faltar um dos dois, a 51040 aborta (`1795262400000-HashedResetTokens.ts:39-42`).

8. Fuso dos bloqueios antigos (risco R19). Correr **antes** de `1795694400000`, sobre a cópia que se vai migrar. A migração copia `[start]`/`[end]` como instantes UTC (`1795694400000-SchedulesAndBlocks.ts:18` e `:98-101`). O fuso da clínica é `Europe/Lisbon` (`src/app/reservation/reservation-policy.ts:9`), e o nome Windows que o SQL Server aceita em `AT TIME ZONE` é `GMT Standard Time`. Não há variável de fuso em `.env.mssql.example`. Confirmar primeiro que o nome existe (esperado: 1 linha; se não aparecer, parar, porque a query seguinte falha):

   ```sql
   SELECT [name] FROM sys.time_zone_info WHERE [name] = N'GMT Standard Time';
   ```

   Query de leitura. Classifica cada linha em vez de comparar a tabela inteira. `TRY_CONVERT` devolve `NULL` para um `time_start` ou `time_end` nulo ou fora de `HH:mm`, em vez de rebentar a query:

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

   É só leitura porque é um `SELECT` com CTEs, sem `INTO`, `INSERT`, `UPDATE`, `DELETE`, variáveis, `SET` de sessão nem DDL, por isso não altera dados nem objetos. O resultado também não depende do fuso do servidor onde corre, porque o fuso está explícito em `AT TIME ZONE`: depende só dos valores gravados.

   Leitura (classe ausente = 0 linhas):
   - `utc`: `[start]` ou `[end]` é o instante UTC de Lisboa. É a premissa da migração.
   - `hora_local`: `[start]` ou `[end]` é a data mais a hora de parede (09:00 para um bloqueio das 09:00). A migração trata-o como UTC e desloca-o pelo desvio.
   - `ambas`: desvio 0 nessa data (inverno em Lisboa), por isso as duas contagens coincidem e a linha não distingue nada.
   - `nenhuma`: não bate com nenhuma das duas. Com `com_hora_valida` = 0 é `time_start` ou `time_end` nulo ou fora do formato. Com `com_hora_valida` > 0 é dado misto, ou um processo antigo que correu noutro fuso. A migração copia `[start]` sem ler `time_start`, por isso estas linhas passam sem erro.
   - `em_datas_desvio_nao_0`: linhas em datas com `DATEPART(TZOFFSET, ...) <> 0`. Só nelas `utc` e `hora_local` se distinguem. Se for 0 em todas as linhas com hora válida, o resultado é inconclusivo: repetir com dados de hora de verão ou decidir com a equipa.

   Esperado: `hora_local` ausente; `nenhuma` com `com_hora_valida` = 0; `utc` mais `ambas` cobre todas as linhas com hora válida.

   **Paragem:** se existir `hora_local` (em `start` ou `end`), ou `nenhuma` com `com_hora_valida` > 0, parar e registar. Não migrar produção sem decisão. A migração não falha nesse caso: o `THROW` 51093 só verifica `end_at > start_at` (R19).

   Sintaxe escrita para SQL Server 2016+ (compatibilidade 130), não executada: confirmar no ensaio, incluindo `TZOFFSET`.

### 3b. Migrations pendentes

```powershell
npm run db:migrate -- --transaction all
```

Comando de `package.json:10`. `--transaction all` é o valor efetivo por omissão (`node_modules/typeorm/commands/MigrationRunCommand.js:50-56`); passa-se explicitamente para não depender do default.

- Aplica todas as pendentes numa única transação. Se qualquer migration lançar `THROW` ou erro, o TypeORM faz rollback de tudo e nada fica aplicado. O erro indica a migration e o código (51020–51109).
- **Não usar `-f` / `--fake`** (`MigrationRunCommand.js:29-35`): marca migrations como aplicadas sem as executar.
- **Não usar `migration:revert`.** As `down()` lançam erro em 1795176000000 (`:92-94`), 1795262400000 (`:142-144`), 1795348800000 (`:108-110`), 1795435200000 (`:158-160`), 1795521600000 (`:111-113`), 1795608000000 (`:114-116`) e 1795694400000 (`:148-150`). A única com `down()` executável é 1795780800000, que só remove os dois triggers (`:129-133`). Para voltar atrás, restaurar o backup (2.2).
- O `migration:run` liga `logging: ["query", "error", "schema"]` (`MigrationRunCommand.js:46`). O output contém o SQL executado. Não traz valores de credenciais, mas rever antes de colar no relatório.

Depois do run, repetir `npm run db:migrations:show`. Deve estar tudo `[X]`, com `ClinicalIntegrity1795780800000` no fim.

### 3c. Verificação após a migration (apenas leitura)

Objetos esperados por migration (fonte: os ficheiros indicados na secção 9):

| Migration | Objetos e efeitos a confirmar | Códigos THROW |
|---|---|---|
| 1795176000000 MeasurementsHardening | `vc_animal_measurements.recorded_by` NOT NULL; colunas `updated_by`, `deleted_at`, `deleted_by`, `delete_reason`; `fk_vc_animal_measurements_updated_by`, `fk_vc_animal_measurements_deleted_by`; `ix_vc_animal_measurements_updated_by`, `ix_vc_animal_measurements_deleted_by`; `ck_vc_animal_measurements_deleted`, `ck_vc_animal_measurements_clinical_not_deleted`; `ck_vc_measurement_types_code` | 51030–51034 |
| 1795262400000 HashedResetTokens | `vc_reset_tokens`: `id` (`pk_vc_reset_tokens`), `token_hash` binary(32) NOT NULL (`uq_vc_reset_tokens_token_hash`), `used_at`, `created_at`; `reset_token` removido; `fk_vc_reset_tokens_user` trusted sem cascade; `vc_users.password_changed_at` | 51040–51049 |
| 1795348800000 IntegrityAndLifecycle | `vc_clinical_visits.completed_by` e `fk_vc_clinical_visits_completed_by`; `ck_vc_clinical_visits_voided_dates`; `ix_vc_clinical_visits_completed_by`; `uq_vc_clinical_visits_animal_in_progress` (filtrado); definição `VETERINARIAN_JOB_TITLE_ID` | 51050–51059 |
| 1795435200000 AnimalOwners | `vc_animal_owners` (4 FK, 3 CK, 2 únicos filtrados, 4 índices); `ix_vc_animals_owner_id`; `ck_vc_reservation_history_action` com `CLIENT_CHANGED` | 51060–51069 |
| 1795521600000 ReservationAuthorship | `vc_reservations.created_by`; `fk_vc_reservations_created_by`; `ix_vc_reservations_created_by`; `uq_vc_reservation_history_created` (filtrado) | 51070–51079 |
| 1795608000000 ClinicServices | `vc_services` (`uq_vc_services_code`, `ck_vc_services_code`, `ck_vc_services_duration`); `vc_employee_services` (PK, 2 FK, `ix_vc_employee_services_service_id`); `vc_reservations.service_id`, `fk_vc_reservations_service`, `ix_vc_reservations_service_id` | 51080–51089 |
| 1795694400000 SchedulesAndBlocks | `vc_employee_schedules` (3 CK, `fk_vc_employee_schedules_employee`, `ix_vc_employee_schedules_employee_day`); `vc_blocked_times`: `employee_id`, `start_at`/`end_at` NOT NULL, `created_by`, `created_at`, `ck_vc_blocked_times_interval`, `fk_vc_blocked_times_employee`, `fk_vc_blocked_times_created_by`, `ix_vc_blocked_times_start_end`, `ix_vc_blocked_times_employee_start`; colunas legadas NULL | 51090–51093, 51099 |
| 1795780800000 ClinicalIntegrity | triggers `tr_vc_clinical_visits_reservation_integrity` (AFTER INSERT, UPDATE em `vc_clinical_visits`) e `tr_vc_reservations_visit_integrity` (AFTER INSERT, UPDATE em `vc_reservations`) | 51100–51109 (51108 reservado) |

Queries de verificação. O valor entre parênteses é o esperado.

**Q1. Triggers** (3 linhas; `is_disabled = 0`; as duas de integridade com `INSERT,UPDATE` e `is_instead_of_trigger = 0`; o trigger do histórico é `INSTEAD OF`, com `UPDATE,DELETE`, de 1795089600000):

```sql
SELECT t.[name], OBJECT_NAME(t.[parent_id]) AS tabela, t.[is_disabled], t.[is_instead_of_trigger],
       STUFF((SELECT N',' + e.[type_desc] FROM sys.trigger_events e WHERE e.[object_id] = t.[object_id] FOR XML PATH(N'')), 1, 1, N'') AS eventos
FROM sys.triggers t
WHERE t.[name] IN (N'tr_vc_clinical_visits_reservation_integrity', N'tr_vc_reservations_visit_integrity', N'tr_vc_reservation_history_append_only')
ORDER BY t.[name];
```

**Q2. Totais de CHECK e FK não confiáveis.** Comparar com 3a-6: o número não pode aumentar.

```sql
SELECT (SELECT COUNT(*) FROM sys.check_constraints WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS checks_nao_confiaveis,
       (SELECT COUNT(*) FROM sys.foreign_keys WHERE [is_not_trusted] = 1 OR [is_disabled] = 1) AS fks_nao_confiaveis;
```

**Q3. CHECK criados pelas migrations** (14 linhas; `is_not_trusted = 0`; `is_disabled = 0`):

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

**Q4. FK criadas pelas migrations** (16 linhas; `is_not_trusted = 0`; `is_disabled = 0`; `NO_ACTION`):

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

**Q5. Índices** (21 linhas; `is_unique = 1` nos cinco `uq_*`; `has_filter = 1` em `uq_vc_animal_owners_active`, `uq_vc_animal_owners_primary`, `ix_vc_animal_owners_user_active`, `uq_vc_clinical_visits_animal_in_progress` e `uq_vc_reservation_history_created`):

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

**Q6. Colunas novas e nulidade** (esperado: `vc_blocked_times.start_at` e `end_at` com `IS_NULLABLE = NO` e tipo `datetime2`; `employee_id` e `created_by` com `YES`; `date`, `time_start`, `time_end`, `start`, `end` com `YES` e tipos inalterados; `vc_reset_tokens.token_hash` binary(32) `NO`; `reset_token` **ausente**, zero linhas):

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

**Q7. Tabelas novas** (quatro valores não nulos):

```sql
SELECT OBJECT_ID(N'dbo.vc_employee_schedules', N'U') AS schedules,
       OBJECT_ID(N'dbo.vc_services', N'U') AS services,
       OBJECT_ID(N'dbo.vc_employee_services', N'U') AS employee_services,
       OBJECT_ID(N'dbo.vc_animal_owners', N'U') AS animal_owners;
```

**Q8. Registo de migrations.** Repetir a query de 3a-2. Devem existir as oito do intervalo, com `ClinicalIntegrity1795780800000` no fim.

### 3d. schema:log (apenas leitura de SQL; não executa nada)

```powershell
npx ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts
```

- Não existe script npm para `schema:log` em `package.json`; só `db:migrate` e `db:migrations:show`. Usa-se o CLI do TypeORM diretamente, com o mesmo `-d`.
- Liga à BD para ler o schema, mas só calcula o SQL que um `schema:sync` executaria (`node_modules/typeorm/commands/SchemaLogCommand.js:35-42`). **Nunca usar `schema:sync`, `schema:drop` nem `migration:generate`** (este último escreve ficheiros).
- Esperado, conforme a V.1 e a V.1b:
  - O `schema:log` nunca fica vazio por desenho. Com as 14 migrations aplicadas, `vetcare_dev` dá **60 instruções** (V.1, `evidencias/validacao-v1.md`, secção 3d).
  - Classificação da V.1b (`evidencias/validacao-v1b.md`, secção 2):
    - **A 9**: 3 FK compostas, `row_version` e 5 colunas legadas de `vc_blocked_times`.
    - **B 24**: 23 CHECK que as entidades não declaram e 1 índice que a entidade não tem.
    - **C 19**: 13 índices recriados (incluindo `REL_`), 4 DEFAULT com `N''` e parênteses, 2 `ALTER` de `updated_at` já `NOT NULL`.
    - **D 8**: DEFAULT de `created_at` e `updated_at` em `vc_users` e `vc_animal_measurements`, desvio real entre entidade e BD: as entidades não declaram `default: () => "SYSDATETIME()"` (`users.entity.ts:82`/`:85`, `animal-measurement.entity.ts:67`/`:68`), por isso o TypeORM propõe `getdate()`; a BD e as migrations têm `SYSDATETIME()`, que é a convenção (`docs/SCHEMA_MIGRATION.md:39`); sem efeito em runtime (`synchronize: false`).
  - Critério: comparar com a lista classificada de `evidencias/validacao-v1b.md` (secção 1, 60 linhas). Só uma instrução fora dessa lista é divergência a reportar. Não corrigir a BD nem as entidades sem decisão.
  - Mantém-se o aviso: nunca correr `schema:sync` nem `migration:generate`.
- Porquê: as entidades declaram `createForeignKeyConstraints: false` nessas relações (`src/app/animal/entities/animal.entity.ts:47`, `src/app/clinical-visits/entities/clinical-visit.entity.ts:38`, `src/app/animal-measurements/entities/animal-measurement.entity.ts:58`). Sem essa flag o TypeORM não cria metadados de FK (`node_modules/typeorm/metadata-builder/RelationJoinColumnBuilder.js:55`). Depois, `dropOldForeignKeys` propõe o `DROP` de qualquer FK da BD sem correspondência por nome nas entidades (`node_modules/typeorm/schema-builder/RdbmsSchemaBuilder.js:187-201`).
- Índices com `INCLUDE` ou filtro: o TypeORM não representa o `INCLUDE`, e a comparação do `schema:log` não olha para o `where` (V.1b, secção 3.3). A V.1b confirmou 4 índices com `INCLUDE` que o TypeORM não representa: `ix_vc_employee_schedules_employee_day`, `ix_vc_blocked_times_start_end`, `ix_vc_blocked_times_employee_start` e `ix_vc_animal_owners_user_active` (`evidencias/validacao-v1b.md`, n.º 4, 5, 6 e 8).

## 4. Testes dirigidos aos triggers de 1795780800000

### 4.0 Como montar cada script

Cada teste é um script independente e a sua estrutura é sempre a mesma:

```
H  (cabeçalho e guarda de BD)
F  (fixture, bloco 4.1)
S  (snippets S1–S5, bloco 4.1, se o teste os usar)
P  (preparação, fora do TRY)
A  (ação esperada, dentro do TRY)
R  (rollback)
```

**Cabeçalho H:**

```sql
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
SET XACT_ABORT OFF;
IF DB_NAME() <> N'<BD_TESTE>' THROW 60000, 'Base de dados errada: parar.', 1;
BEGIN TRAN;
```

**Modelo do TRY/CATCH** (volta a envolver a ação A):

```sql
BEGIN TRY
  <A>
  SELECT N'SEM ERRO' AS resultado;
END TRY
BEGIN CATCH
  SELECT N'ERRO' AS resultado, ERROR_NUMBER() AS erro, ERROR_MESSAGE() AS mensagem;
END CATCH;
```

**Rodapé R:**

```sql
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
```

Ligação: `sqlcmd -S <HOST_TESTE>,<PORTA_TESTE> -d <BD_TESTE> -U <UTILIZADOR_TESTE> -N -C` (a palavra-passe é pedida, não se escreve). Se o lote falhar antes do `R`, correr `IF @@TRANCOUNT > 0 ROLLBACK TRAN;` manualmente.

Regra de interpretação: uma recusa de CHECK (erro 547) em vez do código esperado indica que a fixture não satisfaz os CHECK de `vc_reservations` ou `vc_clinical_visits`, porque os CHECK são avaliados antes dos triggers AFTER. Não é uma falha do trigger.

### 4.1 Bloco F (fixture) e snippets S

**Antes de F, confirmar as colunas obrigatórias sem valor por omissão** (se aparecer alguma além das indicadas, acrescentá-la a F):

```sql
SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME IN (N'vc_animals', N'vc_users', N'vc_employees') AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL
ORDER BY TABLE_NAME, COLUMN_NAME;
```

Esperado: `vc_animals` com `name`, `species_id`, `color`, `sex` (`src/app/animal/entities/animal.entity.ts:24`, `:31`, `:56-60`); `vc_users` com `name`, `email`, `password_hash`; `vc_employees` com `user_id`.

**Bloco F** (variáveis únicas por execução; tudo fica dentro da transação):

```sql
DECLARE @tag nvarchar(36) = LOWER(CONVERT(nvarchar(36), NEWID()));
DECLARE @sp uniqueidentifier = NEWID(), @uA uniqueidentifier = NEWID(), @uB uniqueidentifier = NEWID(), @uV uniqueidentifier = NEWID();
DECLARE @emp uniqueidentifier = NEWID(), @an1 uniqueidentifier = NEWID(), @an2 uniqueidentifier = NEWID();
INSERT INTO [dbo].[vc_species] ([id], [name]) VALUES (@sp, N'TESTE-' + @tag);
INSERT INTO [dbo].[vc_users] ([id], [name], [email], [password_hash]) VALUES
  (@uA, N'Cliente A', N'cliente-a-' + @tag + N'@teste.invalid', N'x'),
  (@uB, N'Cliente B', N'cliente-b-' + @tag + N'@teste.invalid', N'x'),
  (@uV, N'Veterinario', N'vet-' + @tag + N'@teste.invalid', N'x');
INSERT INTO [dbo].[vc_employees] ([id], [user_id]) VALUES (@emp, @uV);
INSERT INTO [dbo].[vc_animals] ([id], [name], [species_id], [color], [sex]) VALUES
  (@an1, N'Animal 1', @sp, N'Castanho', N'M'),
  (@an2, N'Animal 2', @sp, N'Preto', N'F');
```

**Snippets** (usam as variáveis `@res`, `@vis`, `@an1`, `@uA`, `@emp` de F; declarar `@res` e `@vis` com `DECLARE ... = NEWID()` antes de os usar):

S1, reserva `CONFIRMED`:

```sql
INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [employee_id], [start_at], [end_at], [status], [confirmed_at])
  VALUES (@res, @an1, @uA, @emp, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'CONFIRMED', '2030-05-31T12:00:00');
```

S2, reserva `PENDING`:

```sql
INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [start_at], [end_at], [status])
  VALUES (@res, @an1, @uA, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'PENDING');
```

S3, visita `IN_PROGRESS` ligada a `@res`:

```sql
INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at])
  VALUES (@vis, @res, @an1, @emp, N'IN_PROGRESS', '2030-06-01T09:05:00');
```

S4, visita `IN_PROGRESS` sem reserva (walk-in):

```sql
INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at])
  VALUES (@vis, NULL, @an1, @emp, N'IN_PROGRESS', '2030-06-01T09:05:00');
```

S5, visita `COMPLETED` ligada a `@res` (só válida com reserva `CONFIRMED`):

```sql
INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at], [ended_at])
  VALUES (@vis, @res, @an1, @emp, N'COMPLETED', '2030-06-01T09:05:00', '2030-06-01T09:50:00');
```

### 4.2 Testes T0 a T12

Cada teste indica P (preparação), A (ação dentro do TRY) e o resultado esperado. O script é `H + F + S (se usado) + P + TRY(A) + R`.

**T0. Controlo positivo: visita numa reserva CONFIRMED passa.**
- P: `DECLARE @res uniqueidentifier = NEWID(), @vis uniqueidentifier = NEWID();` + S1.
- A: S3.
- Esperado: **SEM ERRO.** Se falhar, a fixture está errada e os testes seguintes não valem.

**T1. INSERT de consulta numa reserva PENDING → 51105.**
- P: `DECLARE @res ..., @vis ...;` + S2.
- A: S3.
- Esperado: **ERRO 51105** (`tr_vc_clinical_visits_reservation_integrity`, `1795780800000-ClinicalIntegrity.ts:88-91`). O SQL Server pode devolver também **Msg 3616** logo a seguir. A aplicação procura 51105 em `precedingErrors` (`src/app/core/persistence/persistence.service.ts:24`, `:30`, `:38`).

**T2. UPDATE de `animal_id` de uma consulta → 51104.**
- P: `DECLARE @vis uniqueidentifier = NEWID();` + S4.
- A: `UPDATE [dbo].[vc_clinical_visits] SET [animal_id] = @an2 WHERE [id] = @vis;`
- Esperado: **ERRO 51104** (`1795780800000-ClinicalIntegrity.ts:80-84`).

**T3. UPDATE de `reservation_id` de uma consulta → 51104.**
- P: `DECLARE @res ..., @vis ...;` + S1 + S4.
- A: `UPDATE [dbo].[vc_clinical_visits] SET [reservation_id] = @res WHERE [id] = @vis;`
- Esperado: **ERRO 51104.** A FK composta `(reservation_id, animal_id)` é satisfeita (mesmo animal), por isso o erro vem do trigger.

**T4. UPDATE de reserva para COMPLETED sem consulta COMPLETED → 51106.**
- P: `DECLARE @res ...;` + S1.
- A: `UPDATE [dbo].[vc_reservations] SET [status] = N'COMPLETED' WHERE [id] = @res;`
- Esperado: **ERRO 51106** (`1795780800000-ClinicalIntegrity.ts:104-108`).

**T5a. Reserva para CANCELLED com consulta IN_PROGRESS → 51107.**
- P: `DECLARE @res ..., @vis ...;` + S1 + S3.
- A: `UPDATE [dbo].[vc_reservations] SET [status] = N'CANCELLED', [cancelled_at] = '2030-06-01T08:00:00' WHERE [id] = @res;`
- Esperado: **ERRO 51107** (`1795780800000-ClinicalIntegrity.ts:110-113`).

**T5b. Reserva para NO_SHOW com consulta IN_PROGRESS → 51107.**
- P: igual a T5a.
- A: `UPDATE [dbo].[vc_reservations] SET [status] = N'NO_SHOW' WHERE [id] = @res;`
- Esperado: **ERRO 51107.**

**T5c. Reserva para PENDING com consulta IN_PROGRESS → 51107.**
- P: igual a T5a.
- A: `UPDATE [dbo].[vc_reservations] SET [status] = N'PENDING', [confirmed_at] = NULL WHERE [id] = @res;`
- Esperado: **ERRO 51107.** Sem `[confirmed_at] = NULL`, o CHECK `ck_vc_reservations_pending` (`1795089600000-ReservationsAndClinicalVisits.ts:67`) daria 547 antes do trigger.

**T6. UPDATE de duas reservas, uma válida e uma inválida → falha tudo e condena a transação.**
- P: `DECLARE @resA uniqueidentifier = NEWID(), @resB uniqueidentifier = NEWID(), @visA uniqueidentifier = NEWID();`
  - reserva A: `INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [employee_id], [start_at], [end_at], [status], [confirmed_at]) VALUES (@resA, @an1, @uA, @emp, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'CONFIRMED', '2030-05-31T12:00:00');`
  - reserva B: igual, com `@resB`.
  - visita COMPLETED em A: `INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at], [ended_at]) VALUES (@visA, @resA, @an1, @emp, N'COMPLETED', '2030-06-01T09:05:00', '2030-06-01T09:50:00');`
- A: `UPDATE [dbo].[vc_reservations] SET [status] = N'COMPLETED' WHERE [id] IN (@resA, @resB);`
- No CATCH, acrescentar: `SELECT [id], [status] FROM [dbo].[vc_reservations] WHERE [id] IN (@resA, @resB);`
- No CATCH, registar também `SELECT XACT_STATE();`.
- Esperado: **ERRO 51106**; no CATCH, `XACT_STATE()` = -1; a leitura do CATCH mostra as duas reservas como `COMPLETED`, porque é a vista da transação ainda não revertida, e não prova nada sobre a atomicidade; um `COMMIT` tentado dá 3930; só o `ROLLBACK` é possível, e nada fica confirmado.
- O THROW dentro do trigger condena a transação inteira (V.2b T6b, `evidencias/validacao-v2b.md:7`); a expectativa original (atomicidade por instrução) estava errada.

**T7. Caminho válido: consulta COMPLETED e depois reserva COMPLETED passa (controlo de 51106).**
- P: `DECLARE @res ..., @vis ...;` + S1 + S5.
- A: `UPDATE [dbo].[vc_reservations] SET [status] = N'COMPLETED' WHERE [id] = @res;` + `SELECT [status] FROM [dbo].[vc_reservations] WHERE [id] = @res;`
- Esperado: **SEM ERRO**, estado `COMPLETED`.

**T8. UPDATE só de `client_id` (CLIENT_CHANGED) passa.**
- P: `DECLARE @res ...;` + S1.
- A: `UPDATE [dbo].[vc_reservations] SET [client_id] = @uB WHERE [id] = @res;` + `SELECT [client_id] FROM [dbo].[vc_reservations] WHERE [id] = @res;`
- Esperado: **SEM ERRO**, `client_id` igual a `@uB`. O trigger só age quando `status` é atualizado (`1795780800000-ClinicalIntegrity.ts:103`).

**T9a. INSERT com `OUTPUT INSERTED.* INTO @t` (padrão do TypeORM) funciona com trigger.**
- P: `DECLARE @outI TABLE ([id] uniqueidentifier NOT NULL, [status] nvarchar(30) NOT NULL);`
- A:

  ```sql
  INSERT INTO [dbo].[vc_reservations] ([animal_id], [client_id], [start_at], [end_at], [status])
    OUTPUT INSERTED.[id], INSERTED.[status] INTO @outI ([id], [status])
    VALUES (@an1, @uA, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'PENDING');
  SELECT * FROM @outI;
  ```

- Esperado: **SEM ERRO**, uma linha em `@outI`. O TypeORM gera `OUTPUT INSERTED.[col] ... INTO @OutputTable` (`node_modules/typeorm/query-builder/QueryBuilder.js:609-612` e `:636-638`; `InsertQueryBuilder.js:95-96`).

**T9b. UPDATE com `OUTPUT ... INTO @t` funciona com trigger.**
- P: `DECLARE @res ..., @outU TABLE ([id] uniqueidentifier NOT NULL, [status] nvarchar(30) NOT NULL);` + S2.
- A:

  ```sql
  UPDATE [dbo].[vc_reservations]
     SET [status] = N'CONFIRMED', [employee_id] = @emp, [confirmed_at] = '2030-05-31T12:00:00'
     OUTPUT INSERTED.[id], INSERTED.[status] INTO @outU ([id], [status])
   WHERE [id] = @res;
  SELECT * FROM @outU;
  ```

- Esperado: **SEM ERRO**, uma linha com `CONFIRMED`. O equivalente do TypeORM está em `UpdateQueryBuilder.js:77-78`.

**T10. Comparação null-safe (INTERSECT) compila e não rejeita valores iguais.**
- P: `DECLARE @vis uniqueidentifier = NEWID(), @vis2 uniqueidentifier = NEWID(), @res uniqueidentifier = NEWID();`
  - walk-in: `INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at]) VALUES (@vis, NULL, @an1, @emp, N'IN_PROGRESS', '2030-06-01T09:05:00');`
  - reserva CONFIRMED do `@an2` (não o S1, que é do `@an1`): `INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [employee_id], [start_at], [end_at], [status], [confirmed_at]) VALUES (@res, @an2, @uA, @emp, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'CONFIRMED', '2030-05-31T12:00:00');`
  - visita `IN_PROGRESS` ligada a essa reserva, com `@an2`: `INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at]) VALUES (@vis2, @res, @an2, @emp, N'IN_PROGRESS', '2030-06-01T09:05:00');`
- A:

  ```sql
  UPDATE [dbo].[vc_clinical_visits] SET [reservation_id] = [reservation_id], [animal_id] = [animal_id] WHERE [id] = @vis;
  UPDATE [dbo].[vc_clinical_visits] SET [reservation_id] = [reservation_id], [animal_id] = [animal_id] WHERE [id] = @vis2;
  ```

- Esperado: **SEM ERRO** nas duas. Com `reservation_id` NULL a comparação tem de dar igual (`1795780800000-ClinicalIntegrity.ts:83`). Que o `CREATE TRIGGER` compila prova-se pela própria migration: se o parse falhasse, o lote parava. Confirmar também que a definição contém `INTERSECT`: `SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.tr_vc_clinical_visits_reservation_integrity')) LIKE N'%INTERSECT%';` deve dar `1`.
- Corrigido após V.2 (2601 com a fixture original); validado na V.2b T10b: `@@ROWCOUNT` 1 em cada UPDATE, definição com `INTERSECT` = 1.

**T11. Lacuna: anular uma consulta COMPLETED de reserva COMPLETED. Esperado (comportamento atual): PASSA.**
- P: `DECLARE @res ..., @vis ...;` + S1 + S5. Depois, fora do TRY: `UPDATE [dbo].[vc_reservations] SET [status] = N'COMPLETED' WHERE [id] = @res;` (tem de passar; se falhar, o teste é inválido).
- A:

  ```sql
  UPDATE [dbo].[vc_clinical_visits]
     SET [status] = N'VOIDED', [void_reason] = N'Teste de lacuna', [voided_at] = '2030-06-01T09:55:00', [voided_by] = @uV
   WHERE [id] = @vis;
  SELECT r.[status] AS estado_reserva, v.[status] AS estado_visita
  FROM [dbo].[vc_reservations] r JOIN [dbo].[vc_clinical_visits] v ON v.[reservation_id] = r.[id]
  WHERE r.[id] = @res;
  ```

- Esperado: **SEM ERRO**, com `estado_reserva = COMPLETED` e `estado_visita = VOIDED`. Isto é uma combinação que a regra de negócio proíbe e a BD não bloqueia. A aplicação só anula visitas `IN_PROGRESS` (`src/app/clinical-visits/clinical-visit.business.service.ts:268-279`; mensagem em `clinical-visit.messages.ts:14`). Registar como decisão em aberto (R9).

**T12. INSERT de reserva com `status = COMPLETED` explícito, sem consulta → 51106.**
- P: nenhuma.
- A:

  ```sql
  INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [employee_id], [start_at], [end_at], [status], [confirmed_at])
    VALUES (NEWID(), @an1, @uA, @emp, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'COMPLETED', '2030-05-31T12:00:00');
  ```

- Esperado: **ERRO 51106.** Isto testa a premissa do trigger de que `UPDATE([status])` é verdadeiro num INSERT que lista a coluna (`1795780800000-ClinicalIntegrity.ts:102`). Se passar, o trigger não apanha INSERT e é defeito (R7).

### 4.3 Controlo negativo: OUTPUT sem INTO → 334

Lote próprio, **sem TRY/CATCH**. Pode abortar o lote, por isso corre-se isolado e, se preciso, fecha-se com `IF @@TRANCOUNT > 0 ROLLBACK TRAN;`.

```sql
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;
-- F (bloco 4.1)
DECLARE @res uniqueidentifier = NEWID();
INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [start_at], [end_at], [status])
  VALUES (@res, @an1, @uA, '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'PENDING');
UPDATE [dbo].[vc_reservations]
   SET [status] = N'CONFIRMED', [employee_id] = @emp, [confirmed_at] = '2030-05-31T12:00:00'
   OUTPUT INSERTED.[id]
 WHERE [id] = @res;
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
```

Esperado: **Msg 334** ("cannot have any enabled triggers if the statement contains an OUTPUT clause without INTO clause"). Mostra que o `INTO @tabela` do TypeORM é o que permite o padrão com triggers. Este teste é controlo: o resultado esperado é o erro.

## 5. Concorrência (duas sessões)

**Preparação comum.** Restaurar o baseline (2.2) antes de cada cenário, para que os dados fixos não colidam. Depois, dados **com commit** (sem `BEGIN TRAN`) com identificadores fixos:

```sql
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
INSERT INTO [dbo].[vc_species] ([id], [name]) VALUES ('C0000000-0000-4000-8000-000000000006', N'TESTE-CONCORRENCIA');
INSERT INTO [dbo].[vc_users] ([id], [name], [email], [password_hash]) VALUES
  ('C0000000-0000-4000-8000-000000000004', N'Cliente concorrencia', N'concorrencia-cliente@teste.invalid', N'x'),
  ('C0000000-0000-4000-8000-000000000005', N'Vet concorrencia', N'concorrencia-vet@teste.invalid', N'x');
INSERT INTO [dbo].[vc_employees] ([id], [user_id]) VALUES ('C0000000-0000-4000-8000-000000000003', 'C0000000-0000-4000-8000-000000000005');
INSERT INTO [dbo].[vc_animals] ([id], [name], [species_id], [color], [sex]) VALUES ('C0000000-0000-4000-8000-000000000002', N'Animal concorrencia', 'C0000000-0000-4000-8000-000000000006', N'Cinzento', N'M');
INSERT INTO [dbo].[vc_reservations] ([id], [animal_id], [client_id], [employee_id], [start_at], [end_at], [status], [confirmed_at]) VALUES
  ('C0000000-0000-4000-8000-000000000001', 'C0000000-0000-4000-8000-000000000002', 'C0000000-0000-4000-8000-000000000004', 'C0000000-0000-4000-8000-000000000003', '2030-06-01T09:00:00', '2030-06-01T10:00:00', N'CONFIRMED', '2030-05-31T12:00:00');
```

**C1. Espera acima do limite → 1222.**
- Sessão A: `BEGIN TRAN; UPDATE [dbo].[vc_reservations] SET [reason] = N'A' WHERE [id] = 'C0000000-0000-4000-8000-000000000001';` **Não fazer COMMIT.**
- Sessão B: `SET LOCK_TIMEOUT 5000; UPDATE [dbo].[vc_reservations] SET [reason] = N'B' WHERE [id] = 'C0000000-0000-4000-8000-000000000001';`
- Esperado: a sessão B devolve **Msg 1222** ("Lock request time out period exceeded") cerca de 5 s depois. Depois, sessão A: `ROLLBACK;`.
- Mapeamento na aplicação: 1222 é traduzido para 409 com retry (`src/app/core/persistence/persistence.service.ts:20`; `src/app/core/persistence/lock-timeout.ts:4-5`).

**C2. Consulta a iniciar × reserva a cancelar. Nunca estado inválido.**
- Sessão A:

  ```sql
  BEGIN TRAN;
  INSERT INTO [dbo].[vc_clinical_visits] ([id], [reservation_id], [animal_id], [employee_id], [status], [started_at])
    VALUES ('C0000000-0000-4000-8000-000000000007', 'C0000000-0000-4000-8000-000000000001', 'C0000000-0000-4000-8000-000000000002', 'C0000000-0000-4000-8000-000000000003', N'IN_PROGRESS', '2030-06-01T09:05:00');
  -- Não fazer COMMIT ainda. Passar à sessão B.
  ```

- Sessão B:

  ```sql
  BEGIN TRAN;
  UPDATE [dbo].[vc_reservations] SET [status] = N'CANCELLED', [cancelled_at] = '2030-06-01T08:00:00' WHERE [id] = 'C0000000-0000-4000-8000-000000000001';
  -- Pode bloquear até A terminar.
  ```

- Depois, fazer `COMMIT` em A. Em B, `COMMIT` se não houver erro, `ROLLBACK` se houver.
- Erros aceitáveis: **51107** em B (A confirmou primeiro); **51105** em A (B confirmou primeiro); **1205** (deadlock) numa das sessões, com a outra a concluir.
- Verificação após os dois:

  ```sql
  SELECT r.[status] AS estado_reserva, v.[status] AS estado_visita
  FROM [dbo].[vc_reservations] r LEFT JOIN [dbo].[vc_clinical_visits] v ON v.[reservation_id] = r.[id]
  WHERE r.[id] = 'C0000000-0000-4000-8000-000000000001';
  ```

- Estados finais **aceitáveis**: (`CONFIRMED`, `IN_PROGRESS`), a consulta ganhou; (`CANCELLED`, sem visita), a cancelação ganhou e a consulta foi recusada.
- Estado **inaceitável**: `CANCELLED`, `NO_SHOW` ou `PENDING` com visita `IN_PROGRESS` ou `COMPLETED`.

**C3. `LOCK_TIMEOUT` volta a -1 numa ligação reutilizada do pool.**
- `SELECT @@LOCK_TIMEOUT` numa sessão sqlcmd nova devolve -1 por definição e **não prova nada** sobre o pool da aplicação.
- Procedimento: um script Node de teste, com o `DataSource` de teste (ficheiro de ambiente de teste), configurado com **pool de uma única ligação** (a opção do driver mssql tem de ser confirmada antes de usar). O script corre `withLockTimeout` (`src/app/core/persistence/lock-timeout.ts:43-62`) numa transação que falha com 51105. A seguir, numa nova transação na mesma ligação, faz `SELECT @@LOCK_TIMEOUT`.
- Esperado: **-1**.
- Risco residual documentado: se a reposição falhar (`ENOTBEGUN` ou `EREQINPROG`, JSDoc de `lock-timeout.ts`, parágrafo "Reset"), o valor pode continuar 5000 na ligação do pool. Nesse caso, registar o valor observado e reportar; não é corrupção de dados.
- O script **ainda não existe**. Escrevê-lo é trabalho separado e precisa de aprovação.

## 6. Riscos específicos (file:line)

- **R0 (crítico). Ambiente.** O default aponta para `vetcare_dev` (`src/database/database.config.ts:5`; valor de `TYPEORM_DATABASE` em `.env.mssql.local` igual a `vetcare_dev`). `dotenv` não sobrescreve (`package.json:42`). `.env.mssql.local` está no `.gitignore` (`.gitignore:44`). Mitigação: 2.3, 2.4 e 3.0.

- **R1. Tipos das colunas legadas de `vc_blocked_times`.** A pré-condição de `1795694400000-SchedulesAndBlocks.ts:58-59` só verifica existência (`COL_LENGTH`), não tipo nem nulidade. O `ALTER COLUMN` de `:113` re-declara `date datetime`, `time_start nvarchar(255)`, `time_end nvarchar(255)`, `start datetime`, `end datetime` como NULL. Se a BD divergir, o `ALTER` muda o tipo ou falha. Mitigação: 3a-5, com paragem se houver diferença.

- **R2. Dependências nas colunas legadas.** O `ALTER COLUMN` de `1795694400000-SchedulesAndBlocks.ts:113` falha se houver índice, DEFAULT, CHECK ou dependente sobre elas. Não há nenhum na história de migrations lida, mas a BD pode divergir. Mitigação: 3a-5.

- **R3. Dados de bloqueio.** `1795694400000-SchedulesAndBlocks.ts:105-107` (51093) faz rollback de tudo se algum bloqueio tiver `end <= start`. Não corrige dados. Mitigação: 3a-3 (`p51093`).

- **R4. Premissa não verificável por SQL.** O cabeçalho da migração diz que `start`/`end` são instantes UTC escritos por `clinicDateTime` (`1795694400000-SchedulesAndBlocks.ts:18` e `:98-100`). O `CAST` para `datetime2(3)` assume isso. Confirmar com a equipa, na cópia, antes de aceitar os dados convertidos.

- **R5. Tokens apagados por formato.** `1795262400000-HashedResetTokens.ts:74-75` apaga em silêncio os tokens que não tenham 128 bytes (64 caracteres em `nvarchar(255)`, `1794657600000-InitialSqlServer.ts:93`) nem sejam hexadecimais minúsculos. O gerador atual cumpre (`generate-reset-token.ts:16`). Impacto limitado aos links de recuperação pendentes. Mitigação: 3a-4 (contagem antes).

- **R6. Ordem de execução dentro da migration de reservas.** `1795780800000-ClinicalIntegrity.ts:23-24` exige que a aplicação conclua a visita antes de concluir a reserva, na mesma transação. A garantia da BD depende dessa ordem. Não é testável só com T-SQL; fica para testes pela API.

- **R7. Trigger de reservas em INSERT.** `1795780800000-ClinicalIntegrity.ts:103` faz `IF NOT UPDATE([status]) RETURN;`. Num INSERT que omite `status`, o default é `PENDING` e não há nada a verificar. Um INSERT com `COMPLETED` explícito tem de ser apanhado: é o teste T12.

- **R8. INTERSECT com referências correlacionadas.** `1795780800000-ClinicalIntegrity.ts:83` usa `EXISTS (SELECT i.[reservation_id] INTERSECT SELECT d.[reservation_id])` com `d` duas camadas acima. Risco de compilação e de semântica. Mitigação: T10 e o sucesso do `CREATE TRIGGER` na própria migration.

- **R9. Lacuna: transições de estado da visita.** O trigger de visitas só protege `id`, `animal_id` e `reservation_id` (`1795780800000-ClinicalIntegrity.ts:80-84`). Uma visita `COMPLETED` pode passar a `VOIDED` e deixar a reserva `COMPLETED` sem visita concluída (T11). A aplicação só anula `IN_PROGRESS` (`src/app/clinical-visits/clinical-visit.business.service.ts:268-279`). **Decisão em aberto:** acrescentar regra na BD ou aceitar que é só da aplicação.

- **R10. OUTPUT sem INTO.** O TypeORM gera `OUTPUT ... INTO @OutputTable` em INSERT e UPDATE (`node_modules/typeorm/query-builder/QueryBuilder.js:636-638`). Só se usasse `returning` como string (`QueryBuilder.js:643-644`) é que sairia `OUTPUT` sem `INTO`, o que falha com triggers (4.3). `grep` a `src/app` não encontrou `.returning(`. Risco baixo, teórico.

- **R11. Sem verificação intermédia.** `migration:run` aplica tudo numa transação (1.1, ponto 4). Os `THROW` finais (51109, 51099, 51079, etc.) e a secção 3c são a verificação por migration.

- **R12. Pré-verificações de dados.** Várias pré-condições (51030, 51052, 51053, 51063, 51064, 51073, 51102, 51103) abortam se houver dados incoerentes. As migrations não normalizam dados (`docs/SCHEMA_MIGRATION.md:170`). Mitigação: 3a-3. Qualquer valor não nulo é decisão clínica ou de dados, não técnica.

- **R13. `schema:log` com diferenças conhecidas.** Ver 3d. Entram as três FKs compostas (`src/app/animal/entities/animal.entity.ts:47`, `src/app/clinical-visits/entities/clinical-visit.entity.ts:38`, `src/app/animal-measurements/entities/animal-measurement.entity.ts:58`).

- **R14. Timeout e bloqueios longos.** Várias pré-condições usam `TABLOCKX, HOLDLOCK` (por exemplo `1795694400000-SchedulesAndBlocks.ts:47-48`). Numa BD de teste pequena não é problema. Não está definido nenhum tempo limite de pedido em `database.config.ts`; em volumes maiores, confirmar no driver antes de usar.

- **R15. Aviso de autoria.** `1795521600000-ReservationAuthorship.ts:105-108` regista um aviso com o número de reservas sem autor. Esperado num baseline com dados antigos; reportar o número.

- **R16. Reserva e `vc_reset_tokens` de ambientes com dados reais.** Antes de qualquer teste com dados, confirmar que a BD é de teste (2.4). Os testes T-SQL fazem rollback, mas os testes C1–C3 gravam dados com commit. Só correm depois de restaurar o baseline.

- **R17. Nome do índice do PK de `vc_reset_tokens` após `sp_rename`.** `1795003200000-UserRolesAndEmployees.ts:182` renomeia `PK_resetToken` para `pk_vc_reset_tokens` e `:183` renomeia o índice de `user_id` para `ix_vc_reset_tokens_user_id`. A precondição 51041 (`1795262400000-HashedResetTokens.ts:43-51`) só aceita estes dois nomes. Segundo a documentação do `sp_rename`, renomear uma PRIMARY KEY renomeia também o índice associado; isto não está verificado nesta BD. Esperado: OK, com as 2 linhas da query 3a-7. Se o índice do PK mantiver `PK_resetToken`, a 1795262400000 aborta com 51041 e faz rollback. Mitigação: 3a-7.

- **R18. Premissa de UTC dos dados antigos na origem.** As migrations assumem que os valores antigos foram escritos em UTC: `measured_at` sem conversão (`1795176000000-MeasurementsHardening.ts:9`), `expires_at <= SYSUTCDATETIME()` (`1795262400000-HashedResetTokens.ts:72`) e `assigned_at = CONVERT(datetime2(3), a.[created_at])` (`1795435200000-AnimalOwners.ts:115`). `vc_animals.created_at` tem `DEFAULT GETDATE()` (`1794744000000-UniformSchemaAndAnimalCatalog.ts:68`), que é hora local do servidor. A premissa vem de `docs/SCHEMA_MIGRATION.md:137` e `:204`. A query de 2.4 só mede a BD de teste, não a origem. Mitigação: verificar o desvio da origem à parte, em leitura e com autorização explícita (nota em 2.4); se não for 0, registar e decidir antes de migrar produção.

- **R19. Fuso dos bloqueios antigos (risco Alto, condicional).** Origem: auditoria 7.1b, ponto N1 (`memoria/auditoria/7.1b-migrations.md`). A migração copia `[start]`/`[end]` para `start_at`/`end_at` sem conversão de fuso e assume que são instantes UTC escritos por `clinicDateTime` (`1795694400000-SchedulesAndBlocks.ts:18` e `:98-101`). Essa premissa pode não valer para as linhas gravadas antes de 35d22f2. No commit base (`3eff72d`), `combineDateAndTime` usava `setHours` (`git show 3eff72d:src/app/reservation/time-utils.service.ts:56-61`), ou seja, a hora local do processo, e o serviço gravava `start = combineDateAndTime(date, timeStart)` (`git show 3eff72d:src/app/reservation/blocked-time.service.ts:46-53` e `:67-68`). Só em 35d22f2 `combineDateAndTime` passa a delegar em `clinicDateTime` (`git show 35d22f2:src/app/reservation/time-utils.service.ts:53-55`; a função está em `src/app/reservation/reservation-policy.ts:34`; `git log --oneline -S"clinicDateTime"` dá 35d22f2 como primeiro commit). O forçamento `TZ=UTC` (`src/force-utc.ts:6`) não existe em `3eff72d` e aparece pela primeira vez em 3d57533 (`git log --oneline --diff-filter=A -- src/force-utc.ts`). Logo, a BD pode ter linhas mistas, em hora de parede e em UTC. O valor que chega à BD depende também de `useUTC: false` (`src/database/database.config.ts:34`), por isso a premissa tem de ser medida nos dados, não deduzida do código. Fuso da clínica: `Europe/Lisbon` (`src/app/reservation/reservation-policy.ts:9`), nome Windows `GMT Standard Time`. Só `timeStart`/`timeEnd` foram renomeadas (`1794744000000-UniformSchemaAndAnimalCatalog.ts:32`); `date`, `start` e `end` já tinham esses nomes na criação (`1794657600000-InitialSqlServer.ts:80-88`). Se a premissa falhar, a migração desloca os bloqueios pelo desvio do fuso (por exemplo +1 h em hora de verão) sem erro SQL. O `THROW` 51093 (`1795694400000-SchedulesAndBlocks.ts:105-107`) só verifica `end_at > start_at`, e um desvio igual nas duas colunas passa. Com desvio 0 (inverno em Lisboa) a diferença não aparece. Mitigação: 3a-8. Se houver linhas `hora_local`, ou `nenhuma` com hora válida, parar e decidir antes de migrar produção.

## 7. Critérios de aceitação

- [ ] Autorização explícita do utilizador registada para usar a BD de teste.
- [ ] BD de teste confirmada (2.4): nome diferente de `vetcare_dev`, servidor de teste, `nivel_compat >= 130`, desvio UTC igual a 0.
- [ ] Ficheiro de ambiente de teste fora do repositório; `VETCARE_ENV_FILE` definida; nenhuma `TYPEORM_*` herdada (3.0).
- [ ] Backup do baseline feito; restauro testado (2.2).
- [ ] Baseline registado: `db:migrations:show`; tabela `migrations`; pré-verificação (3a-3) com zeros; `vc_reset_tokens` (3a-4); tipos legacy de `vc_blocked_times` iguais ao esperado (3a-5); dependências vazias; totais de CHECK e FK (3a-6).
- [ ] `npm run db:migrate -- --transaction all` terminou sem erro. Última migration aplicada: `ClinicalIntegrity1795780800000`. Nenhum `--fake`.
- [ ] 3c: Q1 com 3 triggers certos; Q2 sem aumento; Q3 com 14 CHECK confiáveis; Q4 com 16 FK confiáveis e `NO_ACTION`; Q5 com 21 índices, filtros e unicidades certos; Q6 com colunas e nulidades certas; Q7 com 4 tabelas; Q8 com 8 migrations do intervalo.
- [ ] 3d: `schema:log` só tem instruções da lista classificada em `evidencias/validacao-v1b.md`. Qualquer outra linha foi reportada.
- [ ] T0 e T7–T10 sem erro; T1–T6 com o erro esperado (XACT_STATE() = -1 no CATCH medido na V.2b em T1, T2, T4, T5a, T6b e T12); T11 passa (lacuna confirmada); T12 com 51106; 4.3 com 334.
- [ ] Todos os testes T correram num lote com `ROLLBACK`; nenhum com `COMMIT`.
- [ ] C1 com 1222 ao fim de cerca de 5 s.
- [ ] C2 com estado final aceitável (nunca `CANCELLED`, `NO_SHOW` ou `PENDING` com visita `IN_PROGRESS` ou `COMPLETED`).
- [ ] C3 com `@@LOCK_TIMEOUT = -1`, ou risco residual registado com o valor observado. (Só depois de o script existir e ser aprovado.)
- [ ] BD restaurada ao baseline depois dos testes C, ou descartada. Nada apontado para `vetcare_dev`.
- [ ] Decisões em aberto registadas: R9 (visita COMPLETED → VOIDED), R3/R4 (bloqueios), R5 (tokens apagados).
- [ ] Nenhuma palavra-passe, connection string ou conteúdo de ficheiro de ambiente colado no relatório.
- [ ] Índices de `vc_reset_tokens` confirmados (3a-7): exatamente `pk_vc_reset_tokens` e `ix_vc_reset_tokens_user_id`, sem `PK_resetToken` nem outro nome (R17).
- [ ] Fuso da origem dos dados antigos verificado (2.4, nota), com autorização explícita: desvio igual a 0 ou decisão registada antes de migrar produção (R18).
- [ ] Fuso dos bloqueios antigos medido com 3a-8 (R19): nenhuma linha `hora_local` em `start` ou `end`, e nenhuma `nenhuma` com `com_hora_valida` > 0. Se `em_datas_desvio_nao_0` for 0 em todas as linhas com hora válida, registar como inconclusivo, não como aprovado.

## 8. Como reportar o resultado (o que colar de volta)

1. Output de `npm run db:migrations:show`, antes e depois do run.
2. Resultado da query de 2.4, sem palavras-passe. Pode omitir o nome do utilizador.
3. Resultados de 3a-3 (pré-verificação), 3a-4 (`vc_reset_tokens`), 3a-5 (tipos e dependências de `vc_blocked_times`) e 3a-6 (totais).
4. Output do `db:migrate`, revisto. Se houver erro, o número `THROW` e a migration.
5. Output de Q1 a Q8, em texto.
6. Output do `schema:log`, em texto.
7. Para cada teste T0 a T12 e o controlo 4.3: uma linha com `resultado`, `erro` e `mensagem`. Para T6 e T11, a linha extra do CATCH ou do SELECT.
8. Para C1 a C3: mensagem, tempo decorrido, estados finais e valor de `@@LOCK_TIMEOUT`.
9. Desvios face ao esperado, com ficheiro e linha.
10. Resultados de 3a-7 (as duas linhas de índices de `vc_reset_tokens`) e de 3a-8 (saída de `sys.time_zone_info` e as linhas de `campo`, `classe`, `linhas`, `com_hora_valida` e `em_datas_desvio_nao_0`, incluindo `hora_local` se existir).

**Não colar:** palavras-passe, connection strings, conteúdo de ficheiros de ambiente, nem os próprios backups.

## 9. Fontes (file:line)

Repositório (relativo à raiz):

- `package.json:10` (`db:migrate`), `:11` (`db:migrations:show`), `:42` (`dotenv`).
- `src/database/data-source.ts:1-2` (UTC antes de tudo), `:8` (`new DataSource`).
- `src/database/database.config.ts:5` (`VETCARE_ENV_FILE`), `:9-10` (`TYPEORM_CONNECTION`), `:12-14` (variáveis obrigatórias), `:15` (`TYPEORM_PORT`), `:21-25` (host, utilizador, palavra-passe, BD), `:26` (schema `dbo`), `:28` (glob de migrations), `:29-30` (`synchronize`, `migrationsRun` desligados), `:32` (`TYPEORM_ENCRYPT`), `:33` (`TYPEORM_TRUST_SERVER_CERTIFICATE`), `:34` (`useUTC: false`).
- `src/database/environment.ts:5`.
- `.env.mssql.example:1-10` (nomes e comentários), `:12-28` (outras variáveis, não lidas por este caminho).
- `.env.mssql.local` (existe; só se verificou que `TYPEORM_DATABASE` é `vetcare_dev`; valores não copiados).
- `.gitignore:44` (`.env.mssql.local`).
- `AGENTS.md:14` (códigos SQL centralizados em `PersistenceService`).
- `docs/SCHEMA_MIGRATION.md:7` (backup e ensaio em transação `all`), `:39` (fuso), `:88` (`ISJSON`, compatibilidade 130), `:109` (processo em UTC), `:139` e `:187` (FKs compostas só na BD), `:170` (sem normalização automática de dados).

Migrations (`src/database/migrations/`):

- `1794657600000-InitialSqlServer.ts:80-88` (`blocked_times`), `:92-100` (`resetToken`), `:93` (`nvarchar(255)`).
- `1794744000000-UniformSchemaAndAnimalCatalog.ts:12-13` (renomeação de tabelas), `:32` (renomeação de `timeStart`/`timeEnd`), `:40-56` (espécies e raças), `:62-70` (colunas de animais), `:100-105` (`species_id` NOT NULL e FK composta).
- `1794830400000-AnimalMeasurementsAndMetadata.ts:57` (remoção de `weight`/`height` de `vc_animals`).
- `1795003200000-UserRolesAndEmployees.ts:22`, `:27`, `:36-58` (`vc_users`), `:108-125` (`vc_employees`), `:173`, `:178-183`.
- `1795089600000-ReservationsAndClinicalVisits.ts:40-70` (`vc_reservations`), `:61-69` (CHECK), `:67` (`ck_vc_reservations_pending`), `:79-110` (`vc_clinical_visits`), `:96-97` (FK composta), `:111-112` (`uq_vc_clinical_visits_reservation_id`), `:120-136` (`vc_reservation_history`), `:141-148` (trigger append-only), `:151-156` (`clinical_visit_id`), `:153-154` (FK composta).
- `1795176000000-MeasurementsHardening.ts:27-29` (51030), `:30-31` (51031), `:32-35` (51032), `:36-47` (51033), `:48-51` (51034), `:55-62` (`recorded_by` NOT NULL), `:65-71` (novas colunas), `:73-84` (FK e CHECK), `:86-89` (`ck_vc_measurement_types_code`), `:92-94` (`down`).
- `1795262400000-HashedResetTokens.ts:25-27`, `:36-66` (pré-condições 51040–51043), `:70-75` (DELETE), `:84-88` (novas colunas), `:94-98` (conversão), `:101-109` (alterações e remoção de `reset_token`), `:112-118` (novas chaves), `:121` (`password_changed_at`), `:124-139` (verificação 51048–51049), `:142-144` (`down`).
- `1795348800000-IntegrityAndLifecycle.ts:41-45` (ANSI, 51050), `:49-66` (pré-condições 51051–51054), `:69` (`completed_by`), `:72-79` (FK, CHECK, índices), `:84-89` (definição `VETERINARIAN_JOB_TITLE_ID`), `:92-105` (verificação 51059), `:108-110` (`down`).
- `1795435200000-AnimalOwners.ts:44-48`, `:51-69` (pré-condições 51060–51064), `:72-95` (tabela), `:98-109` (índices), `:114-118` (cópia), `:122-131` (verificação 51065), `:134-138` (CHECK de histórico), `:141-155` (verificação 51069), `:158-160` (`down`).
- `1795521600000-ReservationAuthorship.ts:37-41`, `:44-59` (pré-condições 51071–51073), `:62` (`created_by`), `:67-71` (backfill), `:75-81` (verificação 51074), `:84-90` (FK e índices), `:93-102` (verificação 51079), `:105-108` (aviso), `:111-113` (`down`).
- `1795608000000-ClinicServices.ts:41-55` (pré-condições 51081–51082), `:59-81` (tabelas), `:84` (índice), `:87` (`service_id`), `:90-94` (FK e índice), `:97-111` (verificação 51089), `:114-116` (`down`).
- `1795694400000-SchedulesAndBlocks.ts:7-9` (colunas legadas), `:18` (premissa UTC), `:39-42` (verificações em TypeScript), `:45-60` (pré-condições 51090–51092; `:58-59` só existência), `:63-80` (`vc_employee_schedules`), `:83-86` (índice), `:89-96` (novas colunas), `:99-101` (backfill), `:104-107` (51093), `:110-114` (`ALTER COLUMN`; `:113` legadas), `:117-124` (CHECK, FK e índices), `:127-145` (verificação 51099), `:148-150` (`down`).
- `1795780800000-ClinicalIntegrity.ts:3-6` (nomes dos triggers), `:23-24` (ordem da aplicação), `:25-26` (Msg 3616), `:35` (transação ativa), `:38-42` (tabelas), `:45-57` (pré-condições, 51100–51101), `:60-67` (dados, 51102–51103), `:70-93` (trigger de visitas: `:80-84` = 51104, `:88-91` = 51105), `:96-115` (trigger de reservas: `:102-103` = `UPDATE([status])`, `:104-108` = 51106, `:110-113` = 51107), `:118-126` (verificação 51109), `:129-133` (`down`).
- `1795694400000-SchedulesAndBlocks.ts` e `1795780800000-ClinicalIntegrity.ts` estão citados acima com linhas específicas.

Aplicação:

- `src/app/core/persistence/persistence.service.ts:20` (`LockTimeout = 1222`), `:24` (51105), `:30` (`TriggerAborted = 3616`), `:38` (`precedingErrors`).
- `src/app/core/persistence/lock-timeout.ts:4-5` (1222 → 409), `:7` (`CRITICAL_LOCK_TIMEOUT_MS = 5000`), `:30` a `:35` (parágrafo "Reset" e risco residual), `:43-62` (`withLockTimeout`; `SET LOCK_TIMEOUT` em `:56`, reposição em `:61`).
- `src/app/core/generated/generate-reset-token.ts:4` (TTL de 1 hora), `:16` (`randomBytes(32).toString("hex")`).
- `src/app/animal/entities/animal.entity.ts:24` (`name`), `:31` (`species_id`), `:47` (`createForeignKeyConstraints: false`), `:56-60` (`color`, `sex`).
- `src/app/clinical-visits/entities/clinical-visit.entity.ts:38` (`createForeignKeyConstraints: false`).
- `src/app/animal-measurements/entities/animal-measurement.entity.ts:58` (`createForeignKeyConstraints: false`).
- `src/app/clinical-visits/clinical-visit.business.service.ts:268-279` (`voidVisit`, só `IN_PROGRESS`).
- `src/app/clinical-visits/clinical-visit.messages.ts:14` (mensagem `NotInProgress`).

Dependências (node_modules, só leitura):

- `node_modules/typeorm/commands/MigrationRunCommand.js:24-28` (opção `transaction`), `:29-35` (opção `fake`, alias `-f`), `:46` (`logging`), `:50-56` (default `all`).
- `node_modules/typeorm/migration/MigrationExecutor.js:33-35` (nome da tabela), `:342` (criação da tabela de controlo), `:368-377` (colunas), `:407` (leitura de `id`/`timestamp`/`name`).
- `node_modules/typeorm/commands/SchemaLogCommand.js:35-42` (`logging: false`, `.log()`, mensagem de schema atualizado).
- `node_modules/typeorm/schema-builder/RdbmsSchemaBuilder.js:187-201` (`dropOldForeignKeys`).
- `node_modules/typeorm/metadata-builder/RelationJoinColumnBuilder.js:55` (sem FK se `createForeignKeyConstraints` for falso).
- `node_modules/typeorm/query-builder/QueryBuilder.js:609-612` (`INSERTED.col`), `:636-638` (`INTO @OutputTable`), `:643-644` (`returning` como string).
- `node_modules/typeorm/query-builder/InsertQueryBuilder.js:95-96`; `UpdateQueryBuilder.js:77-78`, `:439`.
- `node_modules/dotenv/lib/main.js:340` (`override` desligado por omissão).

Referências de R17 a R19 (acrescentadas na v2):

- R17: `src/database/migrations/1795003200000-UserRolesAndEmployees.ts:182`, `:183`; `src/database/migrations/1795262400000-HashedResetTokens.ts:43-51`.
- R18: `src/database/migrations/1795176000000-MeasurementsHardening.ts:9`; `src/database/migrations/1795262400000-HashedResetTokens.ts:72`; `src/database/migrations/1794744000000-UniformSchemaAndAnimalCatalog.ts:68`; `src/database/migrations/1795435200000-AnimalOwners.ts:115`; `docs/SCHEMA_MIGRATION.md:137` e `:204`.
- R19: `src/database/migrations/1795694400000-SchedulesAndBlocks.ts:18`, `:98-101`, `:105-107`; `src/database/migrations/1794744000000-UniformSchemaAndAnimalCatalog.ts:32`; `src/database/migrations/1794657600000-InitialSqlServer.ts:80-88`; `src/app/reservation/reservation-policy.ts:9` e `:34`; `src/force-utc.ts:6`; `src/database/database.config.ts:34`; `git show 3eff72d:src/app/reservation/time-utils.service.ts:56-61`; `git show 3eff72d:src/app/reservation/blocked-time.service.ts:46-53` e `:67-68`; `git show 35d22f2:src/app/reservation/time-utils.service.ts:53-55`; `git log --oneline -S"clinicDateTime"` (primeiro commit: 35d22f2); `git log --oneline --diff-filter=A -- src/force-utc.ts` (primeiro commit: 3d57533).
