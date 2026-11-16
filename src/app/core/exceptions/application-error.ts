import {
  BadRequestException, ConflictException, ForbiddenException, HttpException,
  InternalServerErrorException, NotFoundException, ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ErrorMetadata, ErrorHttpStatus } from "../enums/error-metadata.enum";

const publicApplicationErrors = new WeakSet<HttpException>();

export function isApplicationError(error: unknown): error is HttpException {
  return error instanceof HttpException && publicApplicationErrors.has(error);
}

/** Adds an application category while preserving Nest exception subclasses used by domain catches. */
export function applicationError(metadata: ErrorMetadata.CONFLICT | ErrorMetadata.ALREADY_EXISTS | ErrorMetadata.IN_USE, message: string, cause?: unknown, details?: Record<string, unknown>): ConflictException;
export function applicationError(metadata: ErrorMetadata, message: string, cause?: unknown, details?: Record<string, unknown>): HttpException;
export function applicationError(metadata: ErrorMetadata, message: string, cause?: unknown, details?: Record<string, unknown>): HttpException {
  // Details are internal domain context; the global HTTP filter publishes only the agreed envelope.
  const response = { ...details, ...(details ? { statusCode: ErrorHttpStatus[metadata] } : {}), message, errorMetadata: metadata };
  const options = { cause };
  const create = (): HttpException => {
    switch (metadata) {
      case ErrorMetadata.NOT_FOUND: return new NotFoundException(response, options);
      case ErrorMetadata.INVALID_VALUE:
      case ErrorMetadata.VALIDATION_ERROR: return new BadRequestException(response, options);
      case ErrorMetadata.ALREADY_EXISTS:
      case ErrorMetadata.IN_USE:
      case ErrorMetadata.CONFLICT: return new ConflictException(response, options);
      case ErrorMetadata.UNAUTHORIZED: return new UnauthorizedException(response, options);
      case ErrorMetadata.FORBIDDEN: return new ForbiddenException(response, options);
      case ErrorMetadata.SERVICE_UNAVAILABLE: return new ServiceUnavailableException(response, options);
      case ErrorMetadata.INTERNAL_ERROR: return new InternalServerErrorException(response, options);
      default: return new HttpException(response, ErrorHttpStatus[metadata], options);
    }
  };
  const error = create();
  publicApplicationErrors.add(error);
  return error;
}
