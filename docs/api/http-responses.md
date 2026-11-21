---
titulo: HTTP responses and global error handling
descricao: Internal implementation of the response envelope, domain errors, persistence error translation and success messages.
cobre: [src/app/core/http-response.module.ts, src/app/core/interceptors/**, src/app/core/filters/**, src/app/core/exceptions/**, src/app/core/enums/error-metadata.enum.ts, src/app/core/persistence/persistence.service.ts, src/app/core/decorators/response-message.decorator.ts]
visibilidade: interna
estado: verificado
verificado_em: 71269f9
---

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

Ids referenced in a request body (not the path) follow one rule: an id that is absent from the body or not a UUID fails DTO validation with 400 (`VALIDATION_ERROR`, e.g. `serviceId` is required by `@IsUUID()` in `src/app/reservation/dto/create-reservation.dto.ts`); a well-formed id with no matching row is 404 (`NOT_FOUND`) and an existing but inactive entry that the request would newly reference is 409 (`CONFLICT`), e.g. `serviceId` on POST /reservations and `serviceIds` on PUT /employees/:id/services. When inactive entries are hidden from the caller (non-administrators cannot see inactive services), they get 404 instead. Older catalog assignments (job titles, roles) still answer 400 for both cases.

Existing Nest exceptions remain supported: their category is inferred from the HTTP status when not declared explicitly. Validation message arrays are joined with `; ` in `friendlyMessage`; this contract does not include a structured field-error map.

`PersistenceService.translate` centralizes SQL Server translation for both `execute` and the global filter. There is no second filter sending persistence responses separately.

SQL Server errors with a fixed translation, besides the duplicate, reference and invalid-value cases of [../architecture.md](../architecture.md) (Persistence errors) (`src/app/core/persistence/persistence.service.ts`):

| SQL Server error | HTTP | friendlyMessage |
| --- | --- | --- |
| 1205 (deadlock victim) | 409 | The operation conflicted with a concurrent change; retry |
| 1222 (lock request timeout; 5 s in critical transactions) | 409 | The operation waited too long for a concurrent change; retry |
| 51104 (clinical visit animal or reservation changed) | 409 | The animal and reservation of a clinical visit cannot be changed |
| 51105 (visit for a reservation that is not CONFIRMED) | 409 | A clinical visit can only be started for a confirmed reservation |
| 51106 (reservation COMPLETED without a COMPLETED visit) | 409 | A reservation can only be completed through a completed clinical visit |
| 51107 (reservation cancelled, no-show or pending with an active visit) | 409 | The reservation has an active clinical visit; it cannot be cancelled, marked as no-show or set back to pending |

Msg 3616 can follow a trigger THROW (the migration notes that it may appear), and mssql reports the error before it in `precedingErrors`. The translator therefore classifies the error before 3616: a trigger THROW (51104 to 51107) keeps its own 409 above. A 3616 with no numbered error before it is returned as 500 with `INTERNAL_ERROR` and the generic message "The database could not complete the operation".

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

Moved to the consumer contract: [../public/index.md](../public/index.md#changes).

The filter handles HTTP requests. Startup failures, migrations and background tasks need their own logging and handling. Responses sent directly with `res.json()` bypass success transformation; controllers should return data to Nest. The existing JWT middleware throws exceptions for the global filter.

## Verification

Integration tests in `http-response.module.spec.ts` exercise the real module without a database: validation, guards, statuses, SQL failures, unknown routes and unexpected failures. Interceptor tests verify serialization, explicit messages, lists, files and body-free responses. Domain tests verify exception compatibility. Conventions for future changes are documented in the root `AGENTS.md`.
