import { HttpStatus } from "@nestjs/common";

/** Shared error categories; public messages belong to the domain raising the error. */
export enum ErrorMetadata {
  NOT_FOUND = "NOT_FOUND",
  INVALID_VALUE = "INVALID_VALUE",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  IN_USE = "IN_USE",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  CONFLICT = "CONFLICT",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  HTTP_ERROR = "HTTP_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export const ErrorHttpStatus: Record<ErrorMetadata, HttpStatus> = {
  [ErrorMetadata.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorMetadata.INVALID_VALUE]: HttpStatus.BAD_REQUEST,
  [ErrorMetadata.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorMetadata.IN_USE]: HttpStatus.CONFLICT,
  [ErrorMetadata.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorMetadata.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorMetadata.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorMetadata.VALIDATION_ERROR]: HttpStatus.BAD_REQUEST,
  [ErrorMetadata.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorMetadata.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorMetadata.HTTP_ERROR]: HttpStatus.BAD_REQUEST,
  [ErrorMetadata.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export function metadataForHttpStatus(status: number): ErrorMetadata {
  switch (status) {
    case HttpStatus.BAD_REQUEST: return ErrorMetadata.INVALID_VALUE;
    case HttpStatus.UNAUTHORIZED: return ErrorMetadata.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN: return ErrorMetadata.FORBIDDEN;
    case HttpStatus.NOT_FOUND: return ErrorMetadata.NOT_FOUND;
    case HttpStatus.CONFLICT: return ErrorMetadata.CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY: return ErrorMetadata.VALIDATION_ERROR;
    case HttpStatus.TOO_MANY_REQUESTS: return ErrorMetadata.TOO_MANY_REQUESTS;
    case HttpStatus.SERVICE_UNAVAILABLE: return ErrorMetadata.SERVICE_UNAVAILABLE;
    default: return status >= 500 ? ErrorMetadata.INTERNAL_ERROR : ErrorMetadata.HTTP_ERROR;
  }
}
