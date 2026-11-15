import { ArgumentsHost, Catch, ExceptionFilter, HttpException, InternalServerErrorException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { PersistenceService } from "./persistence.service";
import { PersistenceMessage } from "./persistence.messages";

/** Fallback for repository reads or infrastructure queries outside explicit execute calls. */
@Catch(QueryFailedError)
export class PersistenceExceptionFilter implements ExceptionFilter {
  constructor(private readonly persistence: PersistenceService) {}

  async catch(exception: QueryFailedError, host: ArgumentsHost): Promise<void> {
    try {
      await this.persistence.execute(() => Promise.reject(exception));
    } catch (error: unknown) {
      const responseError = error instanceof HttpException
        ? error
        : new InternalServerErrorException(PersistenceMessage.Unavailable);
      host.switchToHttp().getResponse().status(responseError.getStatus()).json(responseError.getResponse());
    }
  }
}