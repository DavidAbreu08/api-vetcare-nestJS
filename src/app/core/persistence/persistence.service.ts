import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { PersistenceMessage } from "./persistence.messages";

/** SQL Server error numbers belong to infrastructure, never resource services. */
enum SqlServerError {
  DuplicateIndex = 2601,
  DuplicateConstraint = 2627,
  ReferenceConstraint = 547,
  NullValue = 515,
  TruncatedValue = 2628,
  TruncatedValueLegacy = 8152,
  NumericOverflow = 8115,
}

type DriverError = {
  number?: number;
  driverError?: DriverError;
  originalError?: { info?: { number?: number } };
};

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
        case SqlServerError.ReferenceConstraint:
          throw new ConflictException(PersistenceMessage.ReferenceConflict);
        case SqlServerError.NullValue:
        case SqlServerError.TruncatedValue:
        case SqlServerError.TruncatedValueLegacy:
        case SqlServerError.NumericOverflow:
          throw new BadRequestException(PersistenceMessage.InvalidValue);
        default:
          if (error instanceof QueryFailedError) {
            throw new InternalServerErrorException(PersistenceMessage.Unavailable);
          }
          throw error;
      }
    }
  }
}
