import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ErrorMetadata, metadataForHttpStatus } from "../enums/error-metadata.enum";
import { ApplicationException } from "../exceptions/application.exception";
import { isApplicationError } from "../exceptions/application-error";
import { HttpResponse } from "../interface/http-response.interface";
import { PersistenceService } from "../persistence/persistence.service";

const INTERNAL_MESSAGE = "An internal error occurred. Please try again later.";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly persistence: PersistenceService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const error = this.persistence.translate(exception);
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = error instanceof HttpException ? error.getResponse() : undefined;
    const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const messages = body.friendlyMessage ?? body.message ?? (typeof payload === "string" ? payload : undefined);
    const validation = status === HttpStatus.BAD_REQUEST && Array.isArray(messages);
    const declaredMetadata = body.errorMetadata;
    const metadata = Object.values(ErrorMetadata).includes(declaredMetadata as ErrorMetadata)
      ? declaredMetadata as ErrorMetadata
      : validation ? ErrorMetadata.VALIDATION_ERROR : metadataForHttpStatus(status);
    const publicMessage = Array.isArray(messages)
      ? messages.filter((message): message is string => typeof message === "string").join("; ")
      : typeof messages === "string" ? messages : undefined;

    // Do not serialize legacy domain payload extras or driver details into the public envelope.
    const response: HttpResponse<null> = {
      status,
      friendlyMessage: status >= 500 && !(error instanceof ApplicationException) && !isApplicationError(error)
        ? INTERNAL_MESSAGE
        : publicMessage || (status >= 500 ? INTERNAL_MESSAGE : "The operation could not be completed."),
      success: false,
      result: null,
      errorMetadata: metadata,
    };

    if (status >= 500) {
      // Log locations, not exception messages/objects: SQL errors can embed statements, parameters and credentials.
      const cause = error instanceof Error && "cause" in error ? error.cause : exception;
      const source = cause instanceof Error ? cause : error instanceof Error ? error : undefined;
      const frames = source?.stack?.split("\n").filter(line => /^\s+at\s/.test(line)).join("\n");
      this.logger.error(`HTTP ${status}: ${source?.name ?? "UnknownError"}`, frames);
    }

    const adapter = this.adapterHost.httpAdapter;
    const rawResponse = host.switchToHttp().getResponse();
    if (!adapter.isHeadersSent(rawResponse)) adapter.reply(rawResponse, response, status);
  }
}
