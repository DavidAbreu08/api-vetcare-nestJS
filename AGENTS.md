<!-- project-docs:inicio -->
<!-- gerido por project-docs 0.2.0 · esquema 1 -->
# api-vetcare-angular

VetCare backend: REST API for veterinary clinic management (NestJS 11, TypeScript, TypeORM, SQL Server). It provides the API consumed by the `vetcare-angular` frontend; the contract is `docs/public/openapi.json` (regenerate with `npm run docs:openapi`, no database needed; also served at `/docs-json`).

## Commands
- Build: `npm run build`
- Tests: `npm test` (unit/integration, `src/**/*.spec.ts`); e2e smoke: `npm run test:e2e`; coverage: `npm run test:cov`
- Lint: `npm run lint` (runs with `--fix` and modifies files)
- OpenAPI contract: `npm run docs:openapi` (writes `docs/public/openapi.json`)
- Database: `npm run db:migrate`, `npm run db:migrations:show`, `npm run db:seed:admin` (require SQL Server and `.env.mssql.local`)

## Documentation
- To find where to look, use `node docs/tools/docs-find.mjs` first:
  `search <terms>` (topic), `files <path>` (which docs cover a file), `route <path> [method]` (contract).
- If you need to browse, start with `docs/index.md` and open only the documents the task needs.
- Document only facts proven in the code; mark the rest with `[não verificado]`.
- Do not fix documentation silently: propose the change with evidence and ask for approval.
- `docs/public/` is the consumer contract; everything else in `docs/` is internal.

## Tasks
- Each task's state is in `.agents/tasks/<branch>.md` (outside Git).
- Do not list tasks on start. Open only the state of the task the user names.
- When resuming, confirm the real state with `git status` and `git log` before trusting the summary.
- At the end of the work, the user runs `/finish` (Claude Code) or `$finish` (Codex).
<!-- project-docs:fim -->

# Project conventions

- Write API messages, Swagger descriptions, documentation, and email templates in English. Swagger groups use the English resource/table names (for example Animals, Breeds, Species, Animal Owners, and Clinical Visits). Do not translate user-provided data or change persisted enum values as part of wording changes.

## HTTP responses and errors

Apply these conventions to every new or modified API endpoint and service. See `docs/api/http-responses.md` (implementation) and `docs/public/index.md` (consumer contract) for the contract and examples.

- `HttpResponseModule` owns the global response envelope: `status`, `friendlyMessage`, `success`, `result`, and optional enum-valued `errorMetadata`. Do not add request, timestamp, headers, or arbitrary error objects to the body.
- Use Nest `HttpStatus` for HTTP status values and the shared `ErrorMetadata` enum for error categories. Do not introduce domain-specific error enums or public string codes.
- Raise domain errors through `applicationError(ErrorMetadata, domainMessage)`; use a domain message catalog where useful. Categories are global, messages remain contextual. Only use `ApplicationException` when an explicitly public application exception is needed. Never expose driver errors, stacks, credentials, or raw unexpected error messages.
- Services return operation data or null, not HTTP envelopes. Controllers use `@ResponseMessage` for public success messages and `@HttpCode` when setting the actual HTTP status. Never send JSON directly with Express `res.json()`.
- Do not add try/catch just to rethrow; handle recovery or translation only where there is domain context. Preserve causes for diagnostics. The global filter formats errors from services, guards, and pipes.
- Persistence error translation remains centralized in `PersistenceService.translate`; SQL Server codes must not spread into domain services.
- Preserve empty HEAD/204/304 responses, file streams, class serialization, authentication behavior, and intentional background/notification failure handling.
- Update Swagger/documentation and meaningful HTTP contract tests when changing this contract. Verify build and relevant tests before reporting completion.

## Routes and OpenAPI documentation

- Every API resource uses the central `/api/vetcare` prefix configured by `configureApiRouting` in `src/api-routing.ts`. Controllers declare resource-only paths (for example `@Controller("users")`), never repeat `api` or `vetcare`. HTTP integration fixtures must apply the same routing configuration. Swagger UI and JSON remain at `/docs` and `/docs-json`.
- Declare `@ApiTags` and meaningful `@ApiOperation` summaries on controllers/operations. Document JWT protection with `@ApiBearerAuth("bearer")` at the same scope as JWT guards; public endpoints must not show bearer authentication.
- Keep OpenAPI metadata with the controller and DTO. Do not infer authentication or domain tags from hardcoded URL lists in Swagger setup.
- Use mapped types from `@nestjs/swagger` for documented DTOs so inherited fields and optionality remain in their schemas. Nullable union properties need an explicit Swagger scalar type when runtime reflection loses it.
- Give numeric query DTO properties explicit TypeScript and OpenAPI types, including properties initialized with defaults (for example `skip: number = 0` with Swagger `type: "integer"`). Verify scalar controls and explicit success examples in the generated document, not only that the route exists.
- Use resource routes and PATCH for partial updates. The frontend is being rebuilt: do not retain legacy aliases or duplicate PUT/PATCH operations for compatibility. PUT is reserved for operations with replacement semantics. Do not reintroduce removed routes.
- Keep literal collection routes before generic `:id` routes and validate route/query inputs using pipes or DTOs. Document optional DELETE bodies as optional and describe query alternatives.
- Set action status codes explicitly: 200 for completed actions, 202 for background work, 201 for resource creation, 204 only when there is no response body.
- Keep `docs/api/routes.md` current when adding or changing routes. Run routing/OpenAPI integration tests to catch collisions and differences between documented and actual security/status codes.
