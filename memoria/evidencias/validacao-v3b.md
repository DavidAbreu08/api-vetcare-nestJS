# V.3b — C3 (reposição de LOCK_TIMEOUT no pool) e C4 (UPDLOCK do perfil → 1222) em vetcare_dev

Gravado pelo orchestrator a partir das saídas literais do executor (o executor recusou escrever .md). Script: `C:/Users/david/AppData/Local/Temp/claude/0c76d380998acb40/73509bb7-dbe4-4c89-9279-6ea8e428ea2d/scratchpad3b-locks.ts` (corrido com TS_NODE_PROJECT=tsconfig.json npx ts-node -r tsconfig-paths/register). Opção de pool: node_modules/typeorm/driver/sqlserver/SqlServerConnectionOptions.d.ts:38 (`pool?: { max; min }`), passada ao mssql em SqlServerDriver.js:856; runtime `{"max":1,"min":0}`.

| Teste | Esperado | Obtido | Veredicto |
|---|---|---|---|
| C3a sucesso | dentro 5000; depois -1, mesmo SPID | 5000/76 → -1/76 (repetição 5000/54 → -1/54) | OK |
| C3b erro JS | depois -1 | erro "x"; 5000/76 → -1/76 (repetição -1/54) | OK |
| C3c 51105 do trigger | 51105; depois -1; fixture 0 | QueryFailedError 51105; reposição `SET LOCK_TIMEOUT -1` → **ENOTBEGUN** (engolido); depois **5000**/76 (repetição 5000/54); fixture D0000000 = 0 | **risco residual documentado confirmado** (lock-timeout.ts:30-36) |
| C4 UPDLOCK × withLockTimeout | 1222 em ~4,5–7 s | 1222 "Lock request time out period exceeded." em 5029 ms | OK |
| C4 controlo (sem A) | sem erro, <1 s | sem erro, 4 ms | OK |

SQL gerado pelo TypeORM (findOne com pessimistic_write): `... FROM "dbo"."vc_employees" "EmployeeEntity" WITH (UPDLOCK, ROWLOCK) WHERE (("EmployeeEntity"."id" = @0)) ...`

## Saídas literais

### v3b-preflight-saida.txt

```
GUARDA OK (preflight): db=vetcare_dev machine_igual_hostname=true
COLUNAS_OBRIGATORIAS_SEM_DEFAULT: ["vc_animals.color","vc_animals.name","vc_animals.sex","vc_animals.species_id","vc_clinical_visits.animal_id","vc_clinical_visits.employee_id","vc_clinical_visits.started_at","vc_employees.user_id","vc_reservations.animal_id","vc_reservations.client_id","vc_reservations.end_at","vc_reservations.start_at","vc_species.name","vc_users.email","vc_users.name","vc_users.password_hash"]
COLUNAS_OBRIGATORIAS_FORA_DA_FIXTURE: []
PRE_CONTAGEM_IDS_E_EMAILS: {"vc_species":0,"vc_users":0,"vc_employees":0,"vc_animals":0,"vc_reservations":0,"vc_clinical_visits":0,"emails_v3b":0,"nome_especie_v3b":0,"total":0}
POOL_NO_DATASOURCE: {"max":1,"min":0}
```

### v3b-c3-saida.txt

```
GUARDA OK (C3): db=vetcare_dev machine_igual_hostname=true
RESULTADO_C3 {
  "pre": {
    "vc_species": 0,
    "vc_users": 0,
    "vc_employees": 0,
    "vc_animals": 0,
    "vc_reservations": 0,
    "vc_clinical_visits": 0,
    "emails_v3b": 0,
    "nome_especie_v3b": 0,
    "total": 0
  },
  "c3a": {
    "dentro": {
      "lt": 5000,
      "spid": 76
    },
    "depois": {
      "lt": -1,
      "spid": 76
    },
    "spidIgual": true
  },
  "c3b": {
    "dentro": {
      "lt": 5000,
      "spid": 76
    },
    "erroMensagem": "x",
    "erroTipo": "Error",
    "depois": {
      "lt": -1,
      "spid": 76
    },
    "spidIgual": true
  },
  "c3c": {
    "fase": "visita",
    "erroTipo": "QueryFailedError",
    "erroNumero": 51105,
    "erroMensagem": "Error: A clinical visit can only be created for a CONFIRMED reservation.",
    "depois": {
      "lt": 5000,
      "spid": 76
    },
    "contagemPosRollback": {
      "vc_species": 0,
      "vc_users": 0,
      "vc_employees": 0,
      "vc_animals": 0,
      "vc_reservations": 0,
      "vc_clinical_visits": 0,
      "emails_v3b": 0,
      "nome_especie_v3b": 0,
      "total": 0
    }
  },
  "setsLockTimeout": [
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "erro ENOTBEGUN"
    }
  ]
}
```

### v3b-c3-repeticao-saida.txt

```
GUARDA OK (C3): db=vetcare_dev machine_igual_hostname=true
RESULTADO_C3 {
  "pre": {
    "vc_species": 0,
    "vc_users": 0,
    "vc_employees": 0,
    "vc_animals": 0,
    "vc_reservations": 0,
    "vc_clinical_visits": 0,
    "emails_v3b": 0,
    "nome_especie_v3b": 0,
    "total": 0
  },
  "c3a": {
    "dentro": {
      "lt": 5000,
      "spid": 54
    },
    "depois": {
      "lt": -1,
      "spid": 54
    },
    "spidIgual": true
  },
  "c3b": {
    "dentro": {
      "lt": 5000,
      "spid": 54
    },
    "erroMensagem": "x",
    "erroTipo": "Error",
    "depois": {
      "lt": -1,
      "spid": 54
    },
    "spidIgual": true
  },
  "c3c": {
    "fase": "visita",
    "erroTipo": "QueryFailedError",
    "erroNumero": 51105,
    "erroMensagem": "Error: A clinical visit can only be created for a CONFIRMED reservation.",
    "depois": {
      "lt": 5000,
      "spid": 54
    },
    "contagemPosRollback": {
      "vc_species": 0,
      "vc_users": 0,
      "vc_employees": 0,
      "vc_animals": 0,
      "vc_reservations": 0,
      "vc_clinical_visits": 0,
      "emails_v3b": 0,
      "nome_especie_v3b": 0,
      "total": 0
    }
  },
  "setsLockTimeout": [
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "erro ENOTBEGUN"
    }
  ]
}
```

### v3b-c4-saida.txt

```
GUARDA OK (C4): db=vetcare_dev machine_igual_hostname=true
RESULTADO_C4 {
  "tabelaVazia": false,
  "idEmployee": "01836936-52E1-F111-B30D-244BFE8D0DDF",
  "sessaoA": {
    "lido": true
  },
  "sessaoB": {
    "erroNumero": 1222,
    "erroTipo": "QueryFailedError",
    "erroMensagem": "Error: Lock request time out period exceeded.",
    "ms": 5029
  },
  "controlo": {
    "erroNumero": null,
    "erroMensagem": null,
    "lido": true,
    "ms": 4
  },
  "sqlGerado": [
    {
      "query": "SELECT \"EmployeeEntity\".\"id\" AS \"EmployeeEntity_id\", \"EmployeeEntity\".\"user_id\" AS \"EmployeeEntity_user_id\", \"EmployeeEntity\".\"employee_number\" AS \"EmployeeEntity_employee_number\", \"EmployeeEntity\".\"license_number\" AS \"EmployeeEntity_license_number\", \"EmployeeEntity\".\"hire_date\" AS \"EmployeeEntity_hire_date\", \"EmployeeEntity\".\"termination_date\" AS \"EmployeeEntity_termination_date\", \"EmployeeEntity\".\"is_available_for_bookings\" AS \"EmployeeEntity_is_available_for_bookings\", \"EmployeeEntity\".\"description\" AS \"EmployeeEntity_description\", \"EmployeeEntity\".\"notes\" AS \"EmployeeEntity_notes\", \"EmployeeEntity\".\"created_at\" AS \"EmployeeEntity_created_at\", \"EmployeeEntity\".\"updated_at\" AS \"EmployeeEntity_updated_at\" FROM \"dbo\".\"vc_employees\" \"EmployeeEntity\" WITH (UPDLOCK, ROWLOCK) WHERE ((\"EmployeeEntity\".\"id\" = @0)) ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY",
      "parameters": [
        "01836936-52E1-F111-B30D-244BFE8D0DDF"
      ]
    }
  ],
  "todasQueriesVcEmployees": 4,
  "setsLockTimeout": [
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT 5000;",
      "resultado": "ok"
    },
    {
      "sql": "SET LOCK_TIMEOUT -1;",
      "resultado": "ok"
    }
  ]
}
```

### v3b-compare-saida.txt

```
(node:19816) [DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.
(Use `node --trace-deprecation ...` to show where the warning was created)
IGUAL
tabelas=22 total_linhas=38
```
