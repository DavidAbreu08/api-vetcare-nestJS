import { applicationError } from "../exceptions/application-error";
import { ErrorMetadata } from "../enums/error-metadata.enum";
import { ValueTransformer } from "typeorm";

export const UtcDateTimeMessage = {
  Unrepresentable: "This instant cannot be stored by the server clock (daylight-saving gap); choose another time",
} as const;

/**
 * The mssql driver runs with useUTC:false: it writes and reads datetime2 using the process-local wall clock.
 * UTC columns therefore travel as a Date whose LOCAL components equal the UTC components of the instant.
 * When the server runs in UTC this is the identity. A UTC wall clock that does not exist locally
 * (spring-forward gap of the server timezone) cannot be represented and is rejected instead of shifted.
 */
export function toDbUtc(instant: Date): Date {
  const local = new Date(
    instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate(),
    instant.getUTCHours(), instant.getUTCMinutes(), instant.getUTCSeconds(), instant.getUTCMilliseconds(),
  );
  if (local.getHours() !== instant.getUTCHours() || local.getMinutes() !== instant.getUTCMinutes() || local.getDate() !== instant.getUTCDate()) {
    throw applicationError(ErrorMetadata.INVALID_VALUE, UtcDateTimeMessage.Unrepresentable);
  }
  return local;
}

/** Inverse of toDbUtc: the driver's local components are the stored UTC wall clock. */
export function fromDbUtc(value: Date): Date {
  return new Date(Date.UTC(
    value.getFullYear(), value.getMonth(), value.getDate(),
    value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds(),
  ));
}

/** Column transformer for datetime2(3) columns holding UTC instants (start_at, end_at, confirmed_at...). */
export const utcDateTimeTransformer: ValueTransformer = {
  to: (value: Date | null | undefined) => (value instanceof Date ? toDbUtc(value) : value),
  from: (value: Date | null | undefined) => (value instanceof Date ? fromDbUtc(value) : value),
};

/** Strict ISO-8601 timestamp with an explicit offset or Z (timestamps without offset are rejected). */
export const ISO_INSTANT_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parses an ISO instant with offset; null when the text is not a valid instant. */
export function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT_WITH_OFFSET.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
