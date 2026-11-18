# Validação V.0 - segurança e baseline (BD vetcare_dev)

Data: 2026-11-17. Máquina: a da própria sessão (hostname local). Shell: Git Bash.
Estado: **PARCIAL**. Passos 0 a 4, 6 e 7 concluídos. Passo 5 (backup) BLOQUEADO por permissão (erro 262); ver a secção do passo 5.

Autorização declarada pelo utilizador: a BD `vetcare_dev` (SQL Server local) é a BD de testes, mas os dados existentes têm de ficar intactos.
Proibido nesta etapa: INSERT/UPDATE/DELETE/MERGE/TRUNCATE/DROP/ALTER/CREATE/EXEC, RESTORE DATABASE, WITH REPLACE, INIT, FORMAT, migration:run, migration:revert, schema:sync, schema:drop, migration:generate.
Credenciais: nunca impressas, registadas nem gravadas (lidas em memória do `.env.mssql.local` com dotenv.parse).

## Passo 0 - variáveis de ambiente herdadas

Comando: `env | grep -E '^(TYPEORM_|VETCARE_ENV_FILE)' || echo nenhuma`

Saída literal:
```
nenhuma
```

Resultado: OK (nenhuma variável herdada).


## Passo 1 - módulo de ligação com guarda

Ficheiro: `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-common.js` (conteúdo na secção "Ficheiros" deste relatório).

Saída da guarda (linha devolvida por `guard()`, executada dentro de `connect()` e repetida no passo 3):
```
GUARDA OK {"bd":"vetcare_dev","servidor":"DavidAbreu","maquina":"DavidAbreu"}
```

Nota: a execução mostrou um aviso de deprecação do Node sobre TLS ServerName com endereço IP (`DEP0123`). É um aviso do driver, não afeta a guarda nem os dados.

## Passo 2 - impressão digital (script)

Ficheiro: `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-fingerprint.js`. Modos `save <ficheiro>` (recusa sobrescrever) e `compare <ficheiro>` (IGUAL + saída 0, ou diferenças + saída 1, erros + saída 2).

## Passo 3 - query de §2.4 de `memoria/validacao-bd.md` (linhas 77-80)

Comando: `node C:/Users/david/AppData/Local/Temp/claude/0c76d380998acb40/73509bb7-dbe4-4c89-9279-6ea8e428ea2d/scratchpad/v-sec24.js` (exit 0).

Saída literal:
```
GUARDA OK {"bd":"vetcare_dev","servidor":"DavidAbreu","maquina":"DavidAbreu"}
[
  {
    "bd": "vetcare_dev",
    "servidor": "DavidAbreu",
    "maquina": "DavidAbreu",
    "collation": "Latin1_General_CI_AS",
    "nivel_compat": 170,
    "desvio_minutos_local_utc": 0
  }
]
```

Leitura: `bd` = vetcare_dev; `servidor` e `maquina` = a máquina local; `nivel_compat` 170 (>= 130); `desvio_minutos_local_utc` = 0. Passa.

## Passo 4 - save e compare (em curso)

Comandos (exit codes registados):
```
node .../scratchpad/v-fingerprint.js save  D:/my-own-projects/Projeto/api-vetcare-angular/memoria/evidencias/validacao-v0-fingerprint.json   -> exit 0
node .../scratchpad/v-fingerprint.js compare D:/my-own-projects/Projeto/api-vetcare-angular/memoria/evidencias/validacao-v0-fingerprint.json -> exit 0
```

Saída literal (save):
```
GRAVADO D:\my-own-projects\Projeto\api-vetcare-angular\memoria\evidencias\validacao-v0-fingerprint.json
tabelas=22 total_linhas=38
```

Saída literal (compare, logo a seguir):
```
IGUAL
tabelas=22 total_linhas=38
```

Conteúdo do ficheiro: 22 tabelas de `dbo`, ordenadas por nome. Tabela `migrations`: `n` 14 (ck 888334898). Tabelas com linhas: `vc_employees` 1, `vc_job_titles` 6, `vc_measurement_types` 5, `vc_roles` 3, `vc_system_settings` 6, `vc_user_roles` 2, `vc_users` 1. As restantes 15 tabelas estão vazias (`n` 0, `ck` null). Soma: 14 + 1 + 6 + 5 + 3 + 6 + 2 + 1 = 38.

Nota: a tabela `migrations` tem 14 linhas, o que bate com o número de migrations esperado no passo 6.

## Passo 5 - backup COPY_ONLY (em curso)

Resultado: **FALHOU por permissão (erro 262).** Não se contornou. Nenhum ficheiro .bak foi criado por esta etapa (ver verificação abaixo).

Comando: `node .../scratchpad/v-backup.js` (duas tentativas, a segunda só para capturar os erros anteriores que o driver guarda em `precedingErrors`; o driver não os mostrava na primeira).

Pasta de backup (valor de `SERVERPROPERTY('InstanceDefaultBackupPath')`): `C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup`

Tentativa 1 (caminho completo pretendido): `C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\vetcare_dev_pre_validacao_20261117_222853.bak`
Saída literal (resumo do JSON do script):
```
"backup": { "ok": false, "numero": 3013, "codigo": "EREQUEST", "mensagem": "BACKUP DATABASE is terminating abnormally.", "mensagens": [] }
"verifyonly": "não executado: BACKUP falhou"
"backupset_mais_recente": []
```

Tentativa 2 (caminho completo pretendido): `C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\vetcare_dev_pre_validacao_20261117_222925.bak`
Saída literal:
```
"caminho": "C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\vetcare_dev_pre_validacao_20261117_222925.bak",
"backup": {
  "ok": false,
  "numero": 3013,
  "codigo": "EREQUEST",
  "mensagem": "BACKUP DATABASE is terminating abnormally.",
  "erros_anteriores": [
    { "numero": 262, "mensagem": "BACKUP DATABASE permission denied in database 'vetcare_dev'." }
  ],
  "mensagens": []
},
"verifyonly": "não executado: BACKUP falhou",
"backupset_mais_recente": []
```

**Erro registado:** 262, `BACKUP DATABASE permission denied in database 'vetcare_dev'.` (o 3013 é só o fecho do lote). Conforme a instrução, regista-se e continua-se; não se tentou outro caminho, outra conta nem outra forma de backup.

**RESTORE VERIFYONLY:** não executado (não há ficheiro de backup). Resultado: N/A.

**Linha do backupset (msdb):** a consulta correu sem erro e não devolveu nenhuma linha. Não há registo de backup de `vetcare_dev` no `msdb.dbo.backupset`, nem antes nem depois destas tentativas.

**Diagnóstico de permissões (só SELECT, `v-perms.js`):**
```
[{"sysadmin_servidor":0,"db_owner":0,"db_backupoperator":0,"pode_backup_database":0,"tem_control_bd":0}]
```
A conta usada pelo `TYPEORM_USERNAME` não tem nenhuma das permissões necessárias para BACKUP em `vetcare_dev`. Para obter o backup é preciso que um DBA o faça, ou que a conta ganhe `BACKUP DATABASE` (ou `db_backupoperator`). Essa decisão é do utilizador, não desta etapa.

**Verificação de ficheiros criados:** inconclusiva. A pasta de backup **não é legível pelo processo Node** (`EPERM` ao listar). Por isso `existsSync` devolve `false` mesmo sem saber o que existe lá. Pelo erro 262 (negação de permissão antes de abrir o dispositivo), o SQL Server não deveria ter criado ficheiro, mas isso não foi confirmado no disco.

## Passo 6 - migrations (em curso)

Estado do passo 5: **BLOQUEADO** (permissão). Ver acima.

## Passo 6 - db:migrations:show

Comando: `npm run db:migrations:show 2>&1 | tail -25` (exit do pipe: 0).

Saída literal (revista: sem credenciais, sem SQL):
```
> api-vetcare-angular@0.0.1 db:migrations:show
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:show -d src/database/data-source.ts

(node:24716) [DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.
(Use `node --trace-deprecation ...` to show where the warning was created)
[X] 1 InitialSqlServer1794657600000
[X] 2 UniformSchemaAndAnimalCatalog1794744000000
[X] 3 AnimalMeasurementsAndMetadata1794830400000
[X] 4 ConfigurableMeasurementTypes1794916800000
[X] 5 UserRolesAndEmployees1795003200000
[X] 6 ReservationsAndClinicalVisits1795089600000
[X] 7 MeasurementsHardening1795176000000
[X] 8 HashedResetTokens1795262400000
[X] 9 IntegrityAndLifecycle1795348800000
[X] 10 AnimalOwners1795435200000
[X] 11 ReservationAuthorship1795521600000
[X] 12 ClinicServices1795608000000
[X] 13 SchedulesAndBlocks1795694400000
[X] 14 ClinicalIntegrity1795780800000
```

Leitura: 14 migrations, todas `[X]`, a última `ClinicalIntegrity1795780800000`. Como esperado.

## Passo 7 - verificação final

`compare` (mesmo ficheiro de baseline): saída `IGUAL`, `tabelas=22 total_linhas=38`, exit 0.

`git status --short` (sem `git add` nem commit):
```
 M .claude/agents/executor.md
 D .claude/agents/orquestrador.md
 M .claude/settings.json
 M CLAUDE.md
 M docs/API_ORGANIZATION.md
 M memoria/plano.md
 M src/app/clinical-visits/clinical-visit.business.service.spec.ts
 M src/app/clinical-visits/clinical-visit.business.service.ts
 M src/app/clinical-visits/clinical-visit.controller.ts
 M src/app/clinical-visits/clinical-visit.messages.ts
?? .claude/agents/orchestrator.md
?? .claude/skills/
?? memoria/auditoria/
?? memoria/evidencias/
?? memoria/teste-orchestrator/
?? memoria/validacao-bd.md
```

Diferença face ao snapshot inicial: `docs/API_ORGANIZATION.md` e `src/app/clinical-visits/clinical-visit.controller.ts` aparecem agora como `M`. Esta etapa não os tocou (só lê e escreve em `memoria/evidencias/` e no scratchpad). Origem desconhecida para esta etapa; fica registado para o orquestrador confirmar.

Ficheiros criados por esta etapa dentro do repositório: `memoria/evidencias/validacao-v0.md` (este relatório) e `memoria/evidencias/validacao-v0-fingerprint.json` (baseline). Ambos estão na pasta `memoria/evidencias/`, que já era não rastreada. Nada foi adicionado ao índice nem commitado.

## Resumo

| Passo | Resultado |
|---|---|
| 0 variáveis TYPEORM_/VETCARE_ENV_FILE | OK (`nenhuma`) |
| 1 guarda em `connect()` | OK (`GUARDA OK bd=vetcare_dev, maquina=DavidAbreu`) |
| 2 script de impressão digital | OK |
| 3 query §2.4 | OK (bd vetcare_dev, nivel_compat 170, desvio 0) |
| 4 save + compare | OK (22 tabelas, 38 linhas, IGUAL, exit 0) |
| 5 backup COPY_ONLY + VERIFYONLY + msdb | **BLOQUEADO**: erro 262, permissão negada (duas tentativas). VERIFYONLY não executado. msdb sem registos. |
| 6 db:migrations:show | OK (14 `[X]`, última ClinicalIntegrity1795780800000) |
| 7 compare final + git status | OK (IGUAL, exit 0) |

Bloqueio: a conta do `TYPEORM_USERNAME` não tem `BACKUP DATABASE` em `vetcare_dev` (nem sysadmin, db_owner ou db_backupoperator). Não se tentou contornar. Para ter o backup de baseline é preciso um DBA, ou conceder a permissão, e isso é decisão do utilizador. Enquanto não houver backup, não há forma de repor o baseline.

Limitações: o passo de deteção de ficheiro pré-existente em `v-backup.js` depende de `fs.existsSync`, que não funciona nesta pasta (EPERM). Não é um problema real porque cada nome leva timestamp, mas a guarda é inconclusiva aqui. O `precedingErrors` do driver foi necessário para ver o erro 262, porque o 3013 o escondia.

## Ficheiros (scripts da etapa, fora do repositório)

- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-common.js` (conteúdo abaixo)
- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-fingerprint.js` (conteúdo abaixo)
- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-sec24.js` (passo 3)
- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-backup.js` (passo 5)
- `C:\Users\david\AppData\Local\Temp\claude\0c76d380998acb40\73509bb7-dbe4-4c89-9279-6ea8e428ea2d\scratchpad\v-perms.js` (diagnóstico de permissões, só SELECT)

### v-common.js
```javascript
// Etapa V.0 - ligação comum à BD de testes vetcare_dev.
// Módulo reutilizável pelas etapas seguintes: const { connect, guard, redact, mssql } = require('./v-common.js');
//
// Garantias:
// - Credenciais: lidas do .env.mssql.local com dotenv.parse, só em memória. Nunca são impressas,
//   registadas nem gravadas. Toda a mensagem de erro que sai passa por redact().
// - Configuração espelha src/database/database.config.ts (mesmos nomes TYPEORM_* e mesmas opções),
//   com requestTimeout = 300000 ms.
// - Antes de ligar, recusa a ligação se: TYPEORM_CONNECTION não for mssql, TYPEORM_DATABASE não for
//   vetcare_dev, ou TYPEORM_HOST não for um servidor local (localhost, 127.0.0.1, ::1, ., (local) ou o hostname).
// - connect() corre SEMPRE a guarda ANTES de devolver o pool: DB_NAME() tem de ser 'vetcare_dev' e
//   SERVERPROPERTY('MachineName') tem de ser igual ao hostname desta máquina (sem distinguir maiúsculas).
//   Se a guarda falhar, o pool é fechado e é lançado erro. Nunca se devolve um pool não verificado.
// - Uso típico:
//     const pool = await connect();
//     try { ... pool.request().query(...) ... } finally { await pool.close(); }

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_DIR = 'D:/my-own-projects/Projeto/api-vetcare-angular';
const ENV_FILE = path.join(PROJECT_DIR, '.env.mssql.local');
const EXPECTED_DB = 'vetcare_dev';
const REQUEST_TIMEOUT_MS = 300000;

const mssql = require(require.resolve('mssql', { paths: [PROJECT_DIR] }));
const dotenv = require(require.resolve('dotenv', { paths: [PROJECT_DIR] }));

// Lido uma única vez, em memória. O conteúdo nunca é impresso.
const parsed = dotenv.parse(fs.readFileSync(ENV_FILE));

// Consulta da guarda. Só SELECT, sem variáveis de sessão nem alterações.
const GUARD_SQL =
  "SELECT DB_NAME() AS bd, @@SERVERNAME AS servidor, CAST(SERVERPROPERTY('MachineName') AS nvarchar(128)) AS maquina";

// Valores de TYPEORM_HOST que significam "este computador" (sem instância nem porta).
const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '::1', '.', '(local)', os.hostname().toLowerCase()]);

// Remove utilizador e palavra-passe de qualquer texto antes de sair para a consola ou para um relatório.
function redact(msg) {
  let out = String(msg == null ? '' : msg);
  for (const s of [parsed.TYPEORM_USERNAME, parsed.TYPEORM_PASSWORD]) {
    if (s) out = out.split(s).join('[redigido]');
  }
  return out;
}

// Monta a configuração do mssql. Lança erro antes de qualquer ligação se a regra não for cumprida.
function buildConfig() {
  if (parsed.TYPEORM_CONNECTION !== 'mssql') throw new Error('TYPEORM_CONNECTION tem de ser mssql');
  for (const name of ['TYPEORM_HOST', 'TYPEORM_USERNAME', 'TYPEORM_PASSWORD', 'TYPEORM_DATABASE']) {
    if (!(parsed[name] || '').trim()) throw new Error('Configuração em falta: ' + name);
  }
  const database = parsed.TYPEORM_DATABASE.trim();
  if (database !== EXPECTED_DB) {
    throw new Error('TYPEORM_DATABASE não é ' + EXPECTED_DB + ': ligação recusada antes de ligar');
  }
  const host = parsed.TYPEORM_HOST.trim();
  const hostNormalizado = host.toLowerCase().replace(/^tcp:/, '').replace(/[,\\].*$/, '');
  if (!LOCAL_NAMES.has(hostNormalizado)) {
    throw new Error('TYPEORM_HOST não é um servidor local: ligação recusada antes de ligar');
  }
  const port = Number(parsed.TYPEORM_PORT || 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TYPEORM_PORT inválida');
  return {
    server: host,
    port,
    user: parsed.TYPEORM_USERNAME,
    password: parsed.TYPEORM_PASSWORD,
    database,
    options: {
      encrypt: parsed.TYPEORM_ENCRYPT !== 'false',
      trustServerCertificate: parsed.TYPEORM_TRUST_SERVER_CERTIFICATE === 'true',
      useUTC: false,
    },
    requestTimeout: REQUEST_TIMEOUT_MS,
  };
}

// Guarda: corre sobre um pool já ligado. Lança erro se a BD ou a máquina não forem as esperadas.
// Devolve a linha da guarda ({ bd, servidor, maquina }) quando tudo bate certo.
async function guard(pool) {
  const r = await pool.request().query(GUARD_SQL);
  const row = r.recordset[0];
  const erros = [];
  if (row.bd !== EXPECTED_DB) {
    erros.push('DB_NAME() é "' + row.bd + '", esperado "' + EXPECTED_DB + '"');
  }
  if (String(row.maquina || '').toLowerCase() !== os.hostname().toLowerCase()) {
    erros.push('SERVERPROPERTY(MachineName) "' + row.maquina + '" não coincide com o hostname local "' + os.hostname() + '"');
  }
  if (erros.length > 0) throw new Error('GUARDA RECUSOU: ' + erros.join('; '));
  return row;
}

// Abre o pool, corre a guarda e só então devolve o pool ligado.
async function connect() {
  const config = buildConfig();
  let pool;
  try {
    pool = await new mssql.ConnectionPool(config).connect();
  } catch (err) {
    throw new Error('Falha na ligação (' + (err.code || 'sem código') + '): ' + redact(err.message));
  }
  try {
    await guard(pool);
  } catch (err) {
    await pool.close().catch(() => {});
    throw new Error(redact(err.message));
  }
  return pool;
}

module.exports = { connect, guard, redact, mssql, EXPECTED_DB, GUARD_SQL };
```

### v-fingerprint.js
```javascript
// Etapa V.0 - passo 2: impressão digital das tabelas de utilizador de vetcare_dev (só SELECT).
//
// Uso:
//   node v-fingerprint.js save <ficheiro.json>     grava {tabela: {n, ck}}; recusa sobrescrever ficheiro existente
//   node v-fingerprint.js compare <ficheiro.json>  imprime IGUAL e sai com 0; ou lista cada diferença e sai com 1
// Saída 2: erro de uso, ficheiro em falta, guarda ou ligação recusada.
//
// Por tabela (schema dbo, incluindo a tabela migrations), ordenadas por nome:
//   n  = COUNT_BIG(*)
//   ck = CHECKSUM_AGG(BINARY_CHECKSUM(*))
// Limitação: CHECKSUM_AGG é uma soma de verificação de 32 bits, não um hash criptográfico.
// Deteta alterações prováveis; não prova a ausência de alterações.
// A ligação passa por connect() de v-common.js, por isso a guarda corre sempre.

const fs = require('fs');
const path = require('path');
const { connect, redact } = require('./v-common.js');

const LIST_SQL =
  "SELECT t.[name] AS nome FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id " +
  "WHERE s.[name] = N'dbo' ORDER BY t.[name]";

// Identificador escapado: ] passa a ]].
function countSql(nome) {
  const ident = '[' + nome.replace(/]/g, ']]') + ']';
  return 'SELECT COUNT_BIG(*) AS n, CHECKSUM_AGG(BINARY_CHECKSUM(*)) AS ck FROM [dbo].' + ident;
}

async function fingerprint(pool) {
  const nomes = (await pool.request().query(LIST_SQL)).recordset.map((r) => r.nome);
  const out = {};
  for (const nome of nomes) {
    const row = (await pool.request().query(countSql(nome))).recordset[0];
    out[nome] = { n: Number(row.n), ck: row.ck == null ? null : Number(row.ck) };
  }
  return out;
}

function resumo(fp) {
  const nomes = Object.keys(fp);
  const total = nomes.reduce((s, k) => s + fp[k].n, 0);
  return 'tabelas=' + nomes.length + ' total_linhas=' + total;
}

function existe(obj, chave) {
  return Object.prototype.hasOwnProperty.call(obj, chave);
}

async function main() {
  const [modo, ficheiroArg] = process.argv.slice(2);
  if ((modo !== 'save' && modo !== 'compare') || !ficheiroArg) {
    console.error('Uso: node v-fingerprint.js save|compare <ficheiro.json>');
    process.exitCode = 2;
    return;
  }
  const ficheiro = path.resolve(ficheiroArg);

  if (modo === 'save' && fs.existsSync(ficheiro)) {
    console.error('Recusado: o ficheiro já existe, não se sobrescreve um baseline: ' + ficheiro);
    process.exitCode = 2;
    return;
  }
  if (modo === 'compare' && !fs.existsSync(ficheiro)) {
    console.error('Ficheiro de baseline em falta: ' + ficheiro);
    process.exitCode = 2;
    return;
  }
  const guardado = modo === 'compare' ? JSON.parse(fs.readFileSync(ficheiro, 'utf8')) : null;

  const pool = await connect();
  let atual;
  try {
    atual = await fingerprint(pool);
  } finally {
    await pool.close();
  }

  if (modo === 'save') {
    fs.writeFileSync(ficheiro, JSON.stringify(atual, null, 2) + '\n', { flag: 'wx' });
    console.log('GRAVADO ' + ficheiro);
    console.log(resumo(atual));
    return;
  }

  // compare
  const diffs = [];
  for (const nome of Object.keys(guardado)) {
    if (!existe(atual, nome)) diffs.push('EM FALTA: ' + nome + ' (no baseline n=' + guardado[nome].n + ')');
  }
  for (const nome of Object.keys(atual)) {
    if (!existe(guardado, nome)) {
      diffs.push('NOVA: ' + nome + ' (n=' + atual[nome].n + ')');
    } else if (guardado[nome].n !== atual[nome].n || guardado[nome].ck !== atual[nome].ck) {
      diffs.push(
        'DIFERENTE: ' + nome +
        ' | baseline n=' + guardado[nome].n + ' ck=' + guardado[nome].ck +
        ' | atual n=' + atual[nome].n + ' ck=' + atual[nome].ck
      );
    }
  }
  if (diffs.length === 0) {
    console.log('IGUAL');
    console.log(resumo(atual));
    return;
  }
  diffs.forEach((d) => console.log(d));
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('ERRO: ' + redact(err && err.message));
  process.exitCode = 2;
});
```
