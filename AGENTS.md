# Project conventions

## HTTP responses and errors

Apply these conventions to every new or modified API endpoint and service. See `docs/HTTP_RESPONSES.md` for the contract and examples.

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
- Prefer resource routes and PATCH for partial updates. Preserve existing compatibility URLs unless a breaking migration is explicitly requested; mark legacy aliases as deprecated and identify the preferred operation.
- Keep literal collection routes before generic `:id` routes and validate route/query inputs using pipes or DTOs. Document optional DELETE bodies as optional and describe query alternatives.
- Set action status codes explicitly: 200 for completed actions, 202 for background work, 201 for resource creation, 204 only when there is no response body.
- Keep `docs/API_ROUTES.md` current when adding or changing routes. Run routing/OpenAPI integration tests to catch collisions and differences between documented and actual security/status codes.
