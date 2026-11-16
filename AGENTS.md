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
