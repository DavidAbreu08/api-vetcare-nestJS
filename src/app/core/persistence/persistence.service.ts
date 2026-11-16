import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { PersistenceMessage } from "./persistence.messages";

/** SQL Server error numbers belong to infrastructure, never resource services. */
enum SqlServerError {
  DuplicateIndex = 2601,
  DuplicateConstraint = 2627,
  /** Raised for both CHECK and FOREIGN KEY/REFERENCE violations; the driver message tells them apart. */
  ConstraintViolation = 547,
  NullValue = 515,
  TruncatedValue = 2628,
  TruncatedValueLegacy = 8152,
  NumericOverflow = 8115,
  /** Transaction chosen as deadlock victim; the client may retry. */
  Deadlock = 1205,
}

type DriverError = {
  number?: number;
  message?: string;
  driverError?: DriverError;
  originalError?: { message?: string; info?: { number?: number; message?: string } };
};

/** SQL Server: "The INSERT statement conflicted with the CHECK constraint ..." (vs "... FOREIGN KEY/REFERENCE constraint"). */
function isCheckViolation(driver: DriverError | null): boolean {
  const messages = [
    driver?.message, driver?.driverError?.message, driver?.originalError?.message, driver?.originalError?.info?.message,
    driver?.driverError?.originalError?.message, driver?.driverError?.originalError?.info?.message,
  ];
  return messages.some(message => typeof message === "string" && /\bCHECK constraint\b/i.test(message));
}

/** Executes repository work and translates persistence failures into safe HTTP errors. */
@Injectable()
export class PersistenceService {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      const driver = error as DriverError | null;
      const number = driver?.driverError?.number ?? driver?.number ??
        driver?.driverError?.originalError?.info?.number ?? driver?.originalError?.info?.number;
      switch (number) {
        case SqlServerError.DuplicateIndex:
        case SqlServerError.DuplicateConstraint:
          throw new ConflictException(PersistenceMessage.Duplicate);
        case SqlServerError.ConstraintViolation:
          if (isCheckViolation(driver)) throw new BadRequestException(PersistenceMessage.CheckViolation);
          throw new ConflictException(PersistenceMessage.ReferenceConflict);
        case SqlServerError.NullValue:
        case SqlServerError.TruncatedValue:
        case SqlServerError.TruncatedValueLegacy:
        case SqlServerError.NumericOverflow:
          throw new BadRequestException(PersistenceMessage.InvalidValue);
        case SqlServerError.Deadlock:
          throw new ConflictException(PersistenceMessage.Deadlock);
        default:
          if (error instanceof QueryFailedError) {
            throw new InternalServerErrorException(PersistenceMessage.Unavailable);
          }
          throw error;
      }
    }
  }
}
