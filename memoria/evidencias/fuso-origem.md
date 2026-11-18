# Etapa R.A: fuso da base de origem (vetcare_dev)

Estado: concluída (passos 1 a 3). Só consultas SELECT, uma execução. Riscos R18 e R19.

Nenhum ficheiro do repositório foi alterado. Não houve commit nem git add. Não se copiou `.env.mssql.local`. Nenhuma credencial foi impressa.

## Resumo dos factos

- Base: `vetcare_dev`, host local. Servidor SQL Server 2025 RTM 17.0.1000.7, Standard Developer Edition, na mesma máquina Windows (instância padrão, serviço `MSSQLSERVER` em execução).
- Fuso do servidor: `GMT Standard Time` (Q3, Q4 e `tzutil /g`). A regra do fuso inclui horário de verão (`Get-TimeZone`: `SupportsDaylightSavingTime: True`).
- Desvio local vs UTC no instante da medição: 0 minutos (Q1). Q5 mostra offset `+00:00` e `is_currently_dst: false` para `GMT Standard Time`.
- Migrations: 14 aplicadas (Q7). Há 14 ficheiros em `src/database/migrations`, com os mesmos nomes e timestamps.
- Dados: Q9 mostra 0 linhas nas tabelas com colunas de instante que os riscos R18 e R19 precisam medir (`vc_animals`, `vc_animal_measurements`, `vc_animal_owners`, `vc_reset_tokens`, `vc_blocked_times`). Por isso o fuso dos valores antigos não se pode medir nesta base. Só se mediu o fuso do servidor.

## Limites do que foi medido

- Q1 é uma foto do instante (2026-11-17, em horário padrão). Não prova o fuso de datas antigas nem de datas em horário de verão.
- Q9 conta linhas por `sys.partitions` (metadados), não por `COUNT(*)`.
- O driver `mssql` devolve `bigint` como texto no JSON (`"linhas": "14"`, `"timestamp": "1794657600000"`). É a representação do driver, não muda o valor.
- Não se mediu o fuso do processo Node. A regra de `docs/SCHEMA_MIGRATION.md:39` depende desse fuso. O Windows está em `GMT Standard Time`.

## Pontos surpreendentes

1. Base praticamente vazia. Têm 0 linhas: `vc_animals`, `vc_animal_measurements`, `vc_animal_owners`, `vc_reset_tokens`, `vc_blocked_times`, `vc_reservations`, `vc_clinical_visits`, `vc_services`, `vc_species`, `vc_breeds`. Têm 1 linha: `vc_users` e `vc_employees`. Têm 6 linhas: `vc_system_settings`. Se houver autorização para uma consulta extra, as candidatas para medir valores de instante reais são estas tabelas. Não se executou nada fora de Q1 a Q9.
2. `vc_blocked_times` mistura colunas legadas e novas: `date`, `start`, `end` (datetime), `time_start`, `time_end` (nvarchar), e `start_at`, `end_at`, `created_at` (datetime2).
3. `vc_reset_tokens` tem `name`, `description` e `notes` (nvarchar). Não é o esperado para uma tabela de tokens. Não se investigou a origem.
4. Na lista de Q8, os nomes sem prefixo `vc_` (`blocked_times`, `animals`, `animal_measurements`, `reset_tokens`) não existem. A lista era de candidatos, e só bateram os nomes com `vc_`.
5. Precisão de `datetime2` pelo `max_length` (mapeamento padrão do SQL Server: 6 = escala 0 a 2, 7 = escala 3 a 4, 8 = escala 5 a 7). `vc_animals.created_at` e `vc_animal_measurements.measured_at` estão em 8. `vc_animal_owners.assigned_at` e `vc_blocked_times.start_at` estão em 7. A diferença de precisão fica registada para decisão posterior.
6. `docs/` e `memoria/validacao-bd.md` §2.4 exigem que a base de teste seja diferente de `vetcare_dev`. Esta etapa leu `vetcare_dev` porque foi pedida leitura da base de origem. Não é conflito de execução, mas convém ter presente.
7. O Node emitiu em stderr o aviso `DEP0123` (TLS ServerName definido com endereço IP). Não afetou os resultados.
8. `tzutil /g` falhou na primeira tentativa porque o Git Bash converteu `/g` em caminho. Repetido com `MSYS_NO_PATHCONV=1`.
9. `docker` não está disponível.

## Passo 1: configuração (sem conexão)

- `VETCARE_ENV_FILE` não está definida no shell, logo o ficheiro carregado é `.env.mssql.local` (default de `databaseEnvFile()` em `src/database/database.config.ts`).
- Variáveis lidas: `TYPEORM_CONNECTION` (tem de ser `mssql`), `TYPEORM_HOST`, `TYPEORM_USERNAME`, `TYPEORM_PASSWORD`, `TYPEORM_DATABASE`, `TYPEORM_PORT` (default 1433), `TYPEORM_ENCRYPT` (default true), `TYPEORM_TRUST_SERVER_CERTIFICATE` (default false).
- Opções mssql: `schema: "dbo"`, `synchronize: false`, `migrationsRun: false`, `options.useUTC: false`.
- Tabela de migrations: `migrationsTableName` não aparece em nenhum ficheiro do repositório (grep sem resultados), logo é o default do TypeORM, `dbo.migrations`.
- Saída (literal):

```
host_local=true
database=vetcare_dev
port_set=true
```

## Passo 2: ambiente do SQL Server (sem conexão)

- `tzutil /g`: `GMT Standard Time`. A primeira tentativa falhou porque o Git Bash converteu `/g` em caminho (`G:/`); repetida com `MSYS_NO_PATHCONV=1`.
- `Get-TimeZone`: `Id: GMT Standard Time`, `BaseUtcOffset: 00:00:00`, `SupportsDaylightSavingTime: True`.
- `Get-Service MSSQL*`: `MSSQLSERVER` com estado `Running` (instância padrão).
- `docker ps`: não disponível (`docker: command not found`).

## Passo 3: consultas SELECT (uma execução)

Script: `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\step3-readonly-queries.js`

Comando: `node "C:/Users/david/AppData/Local/Temp/claude/0c76d380998acb40/73509bb7-dbe4-4c89-9279-6ea8e428ea2d/scratchpad/step3-readonly-queries.js"`

Código de saída: `0`. Saída de stderr: apenas o aviso `DEP0123` (ver ponto 7 acima).

### Script completo

```js
// Etapa R.A - passo 3: consultas SELECT só de leitura na base vetcare_dev.
// - Credenciais ficam só em memória; a configuração nunca é impressa.
// - Guarda de segurança corre ANTES de ligar à base de dados.
// - Cada instrução corre num pedido separado; erros são registados e o script continua.
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectDir = 'D:/my-own-projects/Projeto/api-vetcare-angular';
const mssql = require(require.resolve('mssql', { paths: [projectDir] }));
const dotenv = require(require.resolve('dotenv', { paths: [projectDir] }));

const parsed = dotenv.parse(fs.readFileSync(path.join(projectDir, '.env.mssql.local')));

// Nomes de tabela de migrations: default do TypeORM (migrationsTableName não definido no código).
const MIGRATIONS_TABLE = 'migrations';

const STATEMENTS = [
  { id: 'Q1', sql: "SELECT DB_NAME() AS bd, @@SERVERNAME AS servidor, SERVERPROPERTY('MachineName') AS maquina, DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS collation, (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS nivel_compat, DATEDIFF(MINUTE, SYSUTCDATETIME(), SYSDATETIME()) AS desvio_minutos_local_utc" },
  { id: 'Q2', sql: "SELECT SERVERPROPERTY('ProductVersion') AS versao, SERVERPROPERTY('Edition') AS edicao, SERVERPROPERTY('EngineEdition') AS engine, @@VERSION AS versao_completa" },
  { id: 'Q3', sql: "SELECT CURRENT_TIMEZONE() AS fuso_servidor" },
  { id: 'Q4', sql: "SELECT CURRENT_TIMEZONE_ID() AS fuso_id" },
  { id: 'Q5', sql: "SELECT [name], current_utc_offset, is_currently_dst FROM sys.time_zone_info WHERE [name] IN (N'GMT Standard Time', N'UTC')" },
  { id: 'Q6', sql: "SELECT [name] FROM sys.tables ORDER BY [name]" },
  { id: 'Q7', sql: `SELECT * FROM [dbo].[${MIGRATIONS_TABLE}] ORDER BY [id]` },
  { id: 'Q8', sql: "SELECT t.[name] AS tabela, c.[name] AS coluna, ty.[name] AS tipo, c.max_length, c.is_nullable FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id WHERE t.[name] IN (N'blocked_times', N'vc_blocked_times', N'vc_animals', N'animals', N'vc_animal_measurements', N'animal_measurements', N'vc_reset_tokens', N'reset_tokens', N'vc_animal_owners') ORDER BY t.[name], c.column_id" },
  { id: 'Q9', sql: "SELECT t.[name] AS tabela, SUM(p.[rows]) AS linhas FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1) GROUP BY t.[name] ORDER BY t.[name]" },
];

// ---- Guarda: só SELECT / WITH, sem palavras proibidas (palavra inteira, sem distinguir maiúsculas) ----
const FORBIDDEN = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE', 'INTO', 'GRANT', 'REVOKE', 'DENY', 'BACKUP', 'RESTORE', 'DBCC'];
const FORBIDDEN_RE = new RegExp('\\b(' + FORBIDDEN.join('|') + ')\\b', 'i');
const START_RE = /^(SELECT|WITH)\b/i;

function guardStatement(sql) {
  const problems = [];
  const t = sql.trim();
  if (!START_RE.test(t)) problems.push('não começa por SELECT ou WITH');
  const m = t.match(FORBIDDEN_RE);
  if (m) problems.push('contém palavra proibida: ' + m[1].toUpperCase());
  return problems;
}

// ---- Configuração espelhada de src/database/database.config.ts (valores nunca impressos) ----
const local = (parsed.TYPEORM_HOST || '').trim();
const hostNoInstance = local.replace(/\\.*$/, '').toLowerCase();
const localNames = new Set(['localhost', '127.0.0.1', '::1', '.', '(local)', os.hostname().toLowerCase()]);
const hostLocal = local.length > 0 && localNames.has(hostNoInstance);
const database = (parsed.TYPEORM_DATABASE || '').trim();

// Valores secretos: usados só para redigir mensagens de erro.
const secrets = [parsed.TYPEORM_USERNAME, parsed.TYPEORM_PASSWORD].filter(Boolean);
function redact(msg) {
  let out = String(msg == null ? '' : msg);
  for (const s of secrets) out = out.split(s).join('[redigido]');
  return out;
}

function buildConfig() {
  if (parsed.TYPEORM_CONNECTION !== 'mssql') throw new Error('TYPEORM_CONNECTION tem de ser mssql');
  for (const name of ['TYPEORM_HOST', 'TYPEORM_USERNAME', 'TYPEORM_PASSWORD', 'TYPEORM_DATABASE']) {
    if (!(parsed[name] || '').trim()) throw new Error('Configuração em falta: ' + name);
  }
  const port = Number(parsed.TYPEORM_PORT || 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TYPEORM_PORT inválida');
  return {
    server: parsed.TYPEORM_HOST,
    port,
    user: parsed.TYPEORM_USERNAME,
    password: parsed.TYPEORM_PASSWORD,
    database: parsed.TYPEORM_DATABASE,
    options: {
      encrypt: parsed.TYPEORM_ENCRYPT !== 'false',
      trustServerCertificate: parsed.TYPEORM_TRUST_SERVER_CERTIFICATE === 'true',
      useUTC: false,
    },
    requestTimeout: 15000,
  };
}

function bigintReplacer(_k, v) {
  return typeof v === 'bigint' ? Number(v) : v;
}

async function main() {
  // 1) Pré-condições (antes de ligar): host local e base vetcare_dev.
  if (!hostLocal || database !== 'vetcare_dev') {
    console.error(JSON.stringify({ abortado: true, motivo: 'host não local ou base diferente de vetcare_dev' }));
    process.exit(2);
  }

  // 2) Guarda sobre todas as instruções, antes de qualquer ligação.
  const problems = [];
  for (const { id, sql } of STATEMENTS) {
    for (const p of guardStatement(sql)) problems.push(id + ': ' + p);
  }
  if (problems.length > 0) {
    console.error(JSON.stringify({ abortado: true, motivo: problems }));
    process.exit(2);
  }

  // 3) Ligação e consultas, uma a uma, com erros registados por instrução.
  let config;
  try {
    config = buildConfig();
  } catch (err) {
    console.error(JSON.stringify({ abortado: true, motivo: redact(err.message) }));
    process.exit(2);
  }

  let pool;
  try {
    pool = await new mssql.ConnectionPool(config).connect();
  } catch (err) {
    console.log(JSON.stringify({ conexao: { ok: false, codigo: err.code || null, mensagem: redact(err.message) } }, null, 2));
    process.exit(1);
  }

  const results = [];
  try {
    for (const { id, sql } of STATEMENTS) {
      try {
        const r = await pool.request().query(sql);
        results.push({ id, ok: true, resultado: r.recordset });
      } catch (err) {
        results.push({ id, ok: false, numero: err.number == null ? null : err.number, codigo: err.code || null, mensagem: redact(err.message) });
      }
    }
  } finally {
    await pool.close();
  }

  console.log(JSON.stringify(results, bigintReplacer, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ erro_inesperado: redact(err && err.message) }));
  process.exit(1);
});
```

### Saída literal (stdout) de Q1 a Q9

```json
[
  {
    "id": "Q1",
    "ok": true,
    "resultado": [
      {
        "bd": "vetcare_dev",
        "servidor": "DavidAbreu",
        "maquina": "DavidAbreu",
        "collation": "Latin1_General_CI_AS",
        "nivel_compat": 170,
        "desvio_minutos_local_utc": 0
      }
    ]
  },
  {
    "id": "Q2",
    "ok": true,
    "resultado": [
      {
        "versao": "17.0.1000.7",
        "edicao": "Standard Developer Edition (64-bit)",
        "engine": 2,
        "versao_completa": "Microsoft SQL Server 2025 (RTM) - 17.0.1000.7 (X64) \n\tOct 21 2025 12:05:57 \n\tCopyright (C) 2025 Microsoft Corporation\n\tStandard Developer Edition (64-bit) on Windows 10 Pro 10.0 <X64> (Build 26200: ) (Hypervisor)\n"
      }
    ]
  },
  {
    "id": "Q3",
    "ok": true,
    "resultado": [
      {
        "fuso_servidor": "(UTC+00:00) Dublin, Edimburgo, Lisboa, Londres"
      }
    ]
  },
  {
    "id": "Q4",
    "ok": true,
    "resultado": [
      {
        "fuso_id": "GMT Standard Time"
      }
    ]
  },
  {
    "id": "Q5",
    "ok": true,
    "resultado": [
      {
        "name": "UTC",
        "current_utc_offset": "+00:00",
        "is_currently_dst": false
      },
      {
        "name": "GMT Standard Time",
        "current_utc_offset": "+00:00",
        "is_currently_dst": false
      }
    ]
  },
  {
    "id": "Q6",
    "ok": true,
    "resultado": [
      {
        "name": "migrations"
      },
      {
        "name": "vc_animal_measurements"
      },
      {
        "name": "vc_animal_owners"
      },
      {
        "name": "vc_animals"
      },
      {
        "name": "vc_blocked_times"
      },
      {
        "name": "vc_breeds"
      },
      {
        "name": "vc_clinical_visits"
      },
      {
        "name": "vc_employee_job_titles"
      },
      {
        "name": "vc_employee_schedules"
      },
      {
        "name": "vc_employee_services"
      },
      {
        "name": "vc_employees"
      },
      {
        "name": "vc_job_titles"
      },
      {
        "name": "vc_measurement_types"
      },
      {
        "name": "vc_reservation_history"
      },
      {
        "name": "vc_reservations"
      },
      {
        "name": "vc_reset_tokens"
      },
      {
        "name": "vc_roles"
      },
      {
        "name": "vc_services"
      },
      {
        "name": "vc_species"
      },
      {
        "name": "vc_system_settings"
      },
      {
        "name": "vc_user_roles"
      },
      {
        "name": "vc_users"
      }
    ]
  },
  {
    "id": "Q7",
    "ok": true,
    "resultado": [
      {
        "id": 1,
        "timestamp": "1794657600000",
        "name": "InitialSqlServer1794657600000"
      },
      {
        "id": 2,
        "timestamp": "1794744000000",
        "name": "UniformSchemaAndAnimalCatalog1794744000000"
      },
      {
        "id": 3,
        "timestamp": "1794830400000",
        "name": "AnimalMeasurementsAndMetadata1794830400000"
      },
      {
        "id": 4,
        "timestamp": "1794916800000",
        "name": "ConfigurableMeasurementTypes1794916800000"
      },
      {
        "id": 5,
        "timestamp": "1795003200000",
        "name": "UserRolesAndEmployees1795003200000"
      },
      {
        "id": 6,
        "timestamp": "1795089600000",
        "name": "ReservationsAndClinicalVisits1795089600000"
      },
      {
        "id": 7,
        "timestamp": "1795176000000",
        "name": "MeasurementsHardening1795176000000"
      },
      {
        "id": 8,
        "timestamp": "1795262400000",
        "name": "HashedResetTokens1795262400000"
      },
      {
        "id": 9,
        "timestamp": "1795348800000",
        "name": "IntegrityAndLifecycle1795348800000"
      },
      {
        "id": 10,
        "timestamp": "1795435200000",
        "name": "AnimalOwners1795435200000"
      },
      {
        "id": 11,
        "timestamp": "1795521600000",
        "name": "ReservationAuthorship1795521600000"
      },
      {
        "id": 12,
        "timestamp": "1795608000000",
        "name": "ClinicServices1795608000000"
      },
      {
        "id": 13,
        "timestamp": "1795694400000",
        "name": "SchedulesAndBlocks1795694400000"
      },
      {
        "id": 14,
        "timestamp": "1795780800000",
        "name": "ClinicalIntegrity1795780800000"
      }
    ]
  },
  {
    "id": "Q8",
    "ok": true,
    "resultado": [
      {
        "tabela": "vc_animal_measurements",
        "coluna": "id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "animal_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "name",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "measured_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "description",
        "tipo": "nvarchar",
        "max_length": 480,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "notes",
        "tipo": "nvarchar",
        "max_length": 1000,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "recorded_by",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "created_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "updated_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "measurement_type_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "value",
        "tipo": "decimal",
        "max_length": 9,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "clinical_visit_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "updated_by",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "deleted_at",
        "tipo": "datetime2",
        "max_length": 7,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "deleted_by",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_measurements",
        "coluna": "delete_reason",
        "tipo": "nvarchar",
        "max_length": 1000,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "animal_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "user_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "is_primary",
        "tipo": "bit",
        "max_length": 1,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "assigned_at",
        "tipo": "datetime2",
        "max_length": 7,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "ended_at",
        "tipo": "datetime2",
        "max_length": 7,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "assigned_by",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "ended_by",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "end_reason",
        "tipo": "nvarchar",
        "max_length": 60,
        "is_nullable": true
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "created_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_animal_owners",
        "coluna": "updated_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "owner_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "name",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "color",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "description",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "sex",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "image_url",
        "tipo": "nvarchar",
        "max_length": -1,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "is_verified",
        "tipo": "bit",
        "max_length": 1,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "species_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "breed_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "birth_date",
        "tipo": "date",
        "max_length": 3,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "microchip_number",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "is_neutered",
        "tipo": "bit",
        "max_length": 1,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "created_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "updated_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_animals",
        "coluna": "deleted_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": true
      },
      {
        "tabela": "vc_animals",
        "coluna": "notes",
        "tipo": "nvarchar",
        "max_length": 1000,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "date",
        "tipo": "datetime",
        "max_length": 8,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "time_start",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "time_end",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "start",
        "tipo": "datetime",
        "max_length": 8,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "end",
        "tipo": "datetime",
        "max_length": 8,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "reason",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "name",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "description",
        "tipo": "nvarchar",
        "max_length": 480,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "notes",
        "tipo": "nvarchar",
        "max_length": 1000,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "employee_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "start_at",
        "tipo": "datetime2",
        "max_length": 7,
        "is_nullable": false
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "end_at",
        "tipo": "datetime2",
        "max_length": 7,
        "is_nullable": false
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "created_by",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": true
      },
      {
        "tabela": "vc_blocked_times",
        "coluna": "created_at",
        "tipo": "datetime2",
        "max_length": 7,
        "is_nullable": false
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "user_id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "expires_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "name",
        "tipo": "nvarchar",
        "max_length": 510,
        "is_nullable": true
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "description",
        "tipo": "nvarchar",
        "max_length": 480,
        "is_nullable": true
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "notes",
        "tipo": "nvarchar",
        "max_length": 1000,
        "is_nullable": true
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "id",
        "tipo": "uniqueidentifier",
        "max_length": 16,
        "is_nullable": false
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "token_hash",
        "tipo": "binary",
        "max_length": 32,
        "is_nullable": false
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "used_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": true
      },
      {
        "tabela": "vc_reset_tokens",
        "coluna": "created_at",
        "tipo": "datetime2",
        "max_length": 8,
        "is_nullable": false
      }
    ]
  },
  {
    "id": "Q9",
    "ok": true,
    "resultado": [
      {
        "tabela": "migrations",
        "linhas": "14"
      },
      {
        "tabela": "vc_animal_measurements",
        "linhas": "0"
      },
      {
        "tabela": "vc_animal_owners",
        "linhas": "0"
      },
      {
        "tabela": "vc_animals",
        "linhas": "0"
      },
      {
        "tabela": "vc_blocked_times",
        "linhas": "0"
      },
      {
        "tabela": "vc_breeds",
        "linhas": "0"
      },
      {
        "tabela": "vc_clinical_visits",
        "linhas": "0"
      },
      {
        "tabela": "vc_employee_job_titles",
        "linhas": "0"
      },
      {
        "tabela": "vc_employee_schedules",
        "linhas": "0"
      },
      {
        "tabela": "vc_employee_services",
        "linhas": "0"
      },
      {
        "tabela": "vc_employees",
        "linhas": "1"
      },
      {
        "tabela": "vc_job_titles",
        "linhas": "6"
      },
      {
        "tabela": "vc_measurement_types",
        "linhas": "5"
      },
      {
        "tabela": "vc_reservation_history",
        "linhas": "0"
      },
      {
        "tabela": "vc_reservations",
        "linhas": "0"
      },
      {
        "tabela": "vc_reset_tokens",
        "linhas": "0"
      },
      {
        "tabela": "vc_roles",
        "linhas": "3"
      },
      {
        "tabela": "vc_services",
        "linhas": "0"
      },
      {
        "tabela": "vc_species",
        "linhas": "0"
      },
      {
        "tabela": "vc_system_settings",
        "linhas": "6"
      },
      {
        "tabela": "vc_user_roles",
        "linhas": "2"
      },
      {
        "tabela": "vc_users",
        "linhas": "1"
      }
    ]
  }
]
```

Nota: o array acima é a saída do script sem alteração. Os campos `"ok"` e `"id"` vêm do próprio script.

## git status --short (no fim da etapa)

```
 M .claude/agents/executor.md
 D .claude/agents/orquestrador.md
 M .claude/settings.json
 M CLAUDE.md
 M memoria/plano.md
?? .claude/agents/orchestrator.md
?? .claude/skills/
?? memoria/auditoria/
?? memoria/evidencias/
?? memoria/teste-orchestrator/
?? memoria/validacao-bd.md
```

A lista é igual à do início da conversa. `memoria/evidencias/` já estava não rastreada (continha `decisoes.md`). O único ficheiro novo desta etapa é `memoria/evidencias/fuso-origem.md`, confirmado com `git status --short --untracked-files=all memoria/evidencias`, que lista `decisoes.md` e `fuso-origem.md`.

Verificação de fim de linha: o ficheiro foi escrito com LF (0 caracteres CR).

Próximos passos sugeridos (não executados): medir o fuso do processo Node; decidir se a base de origem vazia permite medir os riscos R18 e R19 nos dados, ou se é preciso outra fonte de dados antigos.
