# VetCare API

## Description

VetCare API: veterinary clinic management built with NestJS and TypeScript.

The API uses the global `/api/vetcare` prefix, for example:

- `POST /api/vetcare/auth/login`
- `GET /api/vetcare/animal`
- `GET /api/vetcare/reservations`
- `GET /api/vetcare/clinic/hours`

Swagger: `/docs`. OpenAPI document: `/docs-json` while the server runs, or [docs/public/openapi.json](docs/public/openapi.json), generated with `npm run docs:openapi` (no database needed). See the [documentation index](docs/index.md), the [consumer contract](docs/public/index.md) and the internal [route inventory](docs/api/routes.md).

## Setup

```bash
npm install
```

Configuration is read from `.env.mssql.local` (or the file named by `VETCARE_ENV_FILE`); copy `.env.mssql.example` and fill in the values. The API needs SQL Server.

## Commands

```bash
npm run start:dev          # development, watch mode (port 3000)
npm run start:prod         # run the compiled build (dist/main)
npm run build              # compile
npm test                   # unit and integration tests
npm run test:e2e           # public HTTP smoke test
npm run test:cov           # coverage
npm run lint               # eslint --fix
npm run docs:openapi       # regenerate docs/public/openapi.json
npm run db:migrate         # apply TypeORM migrations
npm run db:migrations:show # migration status
npm run db:seed:admin      # create the administrator account (SEED_ADMIN_* variables)
```

## Documentation

Start with [docs/index.md](docs/index.md). Agent instructions are in [AGENTS.md](AGENTS.md).
