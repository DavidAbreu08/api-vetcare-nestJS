# HTTP responses and global error handling

`HttpResponseModule`, imported by `AppModule`, registers the success interceptor and exception filter for every controller. Individual endpoints do not need to register them.

```ts
interface HttpResponse<T = unknown> {
  status: HttpStatus;
  friendlyMessage: string;
  success: boolean;
  result: T | null;
  errorMetadata?: ErrorMetadata;
}
```

The body status matches the actual HTTP status. Successful responses omit `errorMetadata`; errors have `result: null`. Headers remain in the HTTP headers. Request and timestamp fields are not included.

## Domain errors

`ErrorMetadata` is a global enum. Public messages belong to their domain and are written in English.

```ts
throw applicationError(
  ErrorMetadata.NOT_FOUND,
  MeasurementErrorMessages[ErrorMetadata.NOT_FOUND],
);
```

`applicationError` preserves Nest subclasses (`NotFoundException`, `ConflictException`, etc.) used by existing catches and tests. When a category is not specific enough to describe a rule, supply a domain-specific message. Do not add try/catch blocks solely to rethrow the same error.

Messages supplied to `applicationError` and `ApplicationException` are explicitly public, including 5xx failures: use safe domain messages, never driver messages. The filter hides messages from other 5xx exceptions and unknown errors by default. The optional cause is never serialized. Global logs record the error type and stack locations without SQL messages or parameters.

Existing Nest exceptions remain supported: their category is inferred from the HTTP status when not declared explicitly. Validation message arrays are joined with `; ` in `friendlyMessage`; this contract does not include a structured field-error map.

`PersistenceService.translate` centralizes SQL Server translation for both `execute` and the global filter. There is no second filter sending persistence responses separately.

## Successful responses

Services return data and the interceptor places it in `result`. The default message is `Operation completed successfully.`. To provide a specific message:

```ts
@ResponseMessage('Measurement created successfully.')
@Post()
create(@Body() dto: CreateMeasurementDto) {
  return this.service.create(dto);
}
```

The decorator accepts message constants and can also be applied to an entire controller. Do not return an already formatted `HttpResponse` manually: the interceptor owns the envelope.

Existing services return data or `null`, without `{ statusCode, message }` wrappers. Acknowledgement messages are defined in controller decorators. The interceptor does not detect old envelopes: every returned object is treated as operation data. Use `@HttpCode` to set an operation's HTTP status when needed.

Business objects containing `message` and other fields are preserved as data. Existing serialization excludes private fields before wrapping the result. Responses with status 204 or 304, and HEAD responses, have no body; `StreamableFile` retains its original stream.

## Frontend impact

- Data previously returned at the root now appears in `result`: for example, `response.token` becomes `response.result.token`.
- Public `message` becomes `friendlyMessage`; `statusCode` becomes `status`.
- Former domain-specific codes (`EMPLOYEE_UNAVAILABLE`, `INVALID_TRANSITION`, etc.) become generic categories, usually `CONFLICT` or `INVALID_VALUE`.
- Extra conflict details (IDs, counts and other fields) are excluded from error responses. They can remain available internally for domain rules and diagnosis, but the filter emits only the agreed contract.
- Swagger documents the global envelope.

The filter handles HTTP requests. Startup failures, migrations and background tasks need their own logging and handling. Responses sent directly with `res.json()` bypass success transformation; controllers should return data to Nest. The existing JWT middleware throws exceptions for the global filter.

## Verification

Integration tests in `http-response.module.spec.ts` exercise the real module without a database: validation, guards, statuses, SQL failures, unknown routes and unexpected failures. Interceptor tests verify serialization, explicit messages, lists, files and body-free responses. Domain tests verify exception compatibility. Conventions for future changes are documented in the root `AGENTS.md`.
