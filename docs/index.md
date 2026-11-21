<!-- project-docs:inicio -->
# Index - api-vetcare-angular

Read this index first and open only what the task needs. Everything outside `public/` is internal.

| Document | Description (1 line) | Cobre |
|---|---|---|
| [component.yaml](component.yaml) | Identity, stack, confirmed commands and provided contracts | - |
| [architecture.md](architecture.md) | Request pipeline, layers, resource organization, persistence errors, lock order | `src/main.ts`, `src/app.module.ts`, `src/app/core/**`, `src/auth/**`, `src/email/**` |
| [api/index.md](api/index.md) | Internal API implementation by module, route inventory, response/error handling | `src/app/**`, `src/auth/**` |
| [database.md](database.md) | SQL Server integrity rules (constraints, triggers), UTC and naming conventions, how to write and run migrations | `src/database/**`, `src/app/**/entities/*.entity.ts` |
| [public/index.md](public/index.md) | Consumer contract: authentication, conventions, envelope, errors, version, tags, changes | `src/api-routing.ts`, `src/swagger*.ts` |
<!-- project-docs:fim -->
