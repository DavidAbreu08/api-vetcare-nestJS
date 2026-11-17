import { BadRequestException, ConflictException, HttpException, Injectable } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { PersistenceMessage } from "./persistence.messages";
import { ErrorMetadata } from "../enums/error-metadata.enum";
import { ApplicationException } from "../exceptions/application.exception";

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
  /** Lock request time out period exceeded (SET LOCK_TIMEOUT); the client may retry. */
  LockTimeout = 1222,
  /** Clinical visit animal or reservation link was changed (trigger THROW). */
  VisitLinkImmutable = 51104,
  /** Clinical visit inserted for a reservation that is not CONFIRMED (trigger THROW). */
  VisitReservationNotConfirmed = 51105,
  /** Reservation set to COMPLETED without a COMPLETED clinical visit (trigger THROW). */
  ReservationCompletedWithoutVisit = 51106,
  /** Reservation cancelled, no-show or set to PENDING while its clinical visit is active (trigger THROW). */
  ReservationHasActiveVisit = 51107,
  /** Follows any error raised inside a trigger; the real cause is the error before it (precedingErrors). */
  TriggerAborted = 3616,
}

type DriverError = {
  number?: number;
  message?: string;
  driverError?: DriverError;
  originalError?: { message?: string; info?: { number?: number; message?: string } };
  /** Earlier errors of the same request; a trigger THROW lands here when SQL Server follows it with Msg 3616. */
  precedingErrors?: DriverError[];
};

/** SQL Server: "The INSERT statement conflicted with the CHECK constraint ..." (vs "... FOREIGN KEY/REFERENCE constraint"). */
function isCheckViolation(driver: DriverError | null): boolean {
  return driverMessages(driver).some(message => /\bCHECK constraint\b/i.test(message));
}

function driverMessages(driver: DriverError | null): string[] {
  // Behind Msg 3616 the real cause is one of the preceding errors, so their wording counts too (see effectiveErrorNumber).
  const behindTrigger = driverErrorNumber(driver) === SqlServerError.TriggerAborted
    ? precedingErrorsOf(driver).flatMap(item => [item?.message, item?.originalError?.info?.message]) : [];
  return [
    driver?.message, driver?.driverError?.message, driver?.originalError?.message, driver?.originalError?.info?.message,
    driver?.driverError?.originalError?.message, driver?.driverError?.originalError?.info?.message,
    ...behindTrigger,
  ].filter((message): message is string => typeof message === "string");
}

function driverErrorNumber(driver: DriverError | null): number | undefined {
  return driver?.driverError?.number ?? driver?.number ??
    driver?.driverError?.originalError?.info?.number ?? driver?.originalError?.info?.number;
}

/** Every precedingErrors item of the driver error, which mssql fills for multi-error requests. */
function precedingErrorsOf(driver: DriverError | null): DriverError[] {
  return [...(driver?.precedingErrors ?? []), ...(driver?.driverError?.precedingErrors ?? [])];
}

/** The main driver number followed by every number in precedingErrors, which mssql fills for multi-error requests. */
function driverErrorNumbers(driver: DriverError | null): number[] {
  return [driverErrorNumber(driver), ...precedingErrorsOf(driver).map(item => item?.number ?? item?.originalError?.info?.number)]
    .filter((number): number is number => number !== undefined);
}

const TRIGGER_RULE_NUMBERS: readonly number[] = [
  SqlServerError.VisitLinkImmutable, SqlServerError.VisitReservationNotConfirmed,
  SqlServerError.ReservationCompletedWithoutVisit, SqlServerError.ReservationHasActiveVisit,
];

/**
 * First clinical-integrity trigger number reported for the request. A THROW inside a trigger is followed by Msg 3616,
 * which mssql returns as the main error with the THROW in precedingErrors, so the main number alone is not enough.
 */
function triggerRuleNumber(driver: DriverError | null): number | undefined {
  return driverErrorNumbers(driver).find(number => TRIGGER_RULE_NUMBERS.includes(number));
}

/**
 * Number of the error that actually failed the request. Msg 3616 only says a trigger aborted the batch, so when it is the
 * main number, the error right before it (the last precedingErrors item that has a number) is the real cause.
 */
function effectiveErrorNumber(driver: DriverError | null): number | undefined {
  const main = driverErrorNumber(driver);
  if (main !== SqlServerError.TriggerAborted) return main;
  const numbers = driverErrorNumbers(driver);
  return numbers.length > 1 ? numbers[numbers.length - 1] : main;
}

/**
 * True when the error is a duplicate-key violation (2601 unique index, 2627 unique constraint) of the named index
 * or constraint, so a resource can map one specific uniqueness rule to its own message without handling SQL Server
 * error numbers itself. The driver message quotes the name ("... with unique index 'uq_...'").
 */
export function isUniqueViolationOf(error: unknown, name: string): boolean {
  const driver = error as DriverError | null;
  const number = driverErrorNumber(driver);
  if (number !== SqlServerError.DuplicateIndex && number !== SqlServerError.DuplicateConstraint) return false;
  const quoted = `'${name.toLowerCase()}'`;
  return driverMessages(driver).some(message => message.toLowerCase().includes(quoted));
}

/**
 * True when the error is a FOREIGN KEY/REFERENCE violation (547 without the CHECK wording), so a resource can give a
 * referenced-row deletion its own message without handling SQL Server error numbers itself.
 */
export function isReferenceViolation(error: unknown): boolean {
  const driver = error as DriverError | null;
  return driverErrorNumber(driver) === SqlServerError.ConstraintViolation && !isCheckViolation(driver);
}

/** Executes repository work and translates persistence failures into safe HTTP errors. */
@Injectable()
export class PersistenceService {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  /**
   * Shared by explicit repository operations and the global HTTP fallback; trigger THROWs (51104–51107) arrive in precedingErrors behind Msg 3616.
   * 3616 (trigger aborted) is translated by the error that precedes it.
   */
  translate(error: unknown): unknown {
    if (error instanceof HttpException) return error;
    const driver = error as DriverError | null;
    const number = triggerRuleNumber(driver) ?? effectiveErrorNumber(driver);
    switch (number) {
      case SqlServerError.DuplicateIndex:
      case SqlServerError.DuplicateConstraint:
        return new ConflictException({ message: PersistenceMessage.Duplicate, errorMetadata: ErrorMetadata.ALREADY_EXISTS }, { cause: error });
      case SqlServerError.ConstraintViolation:
        if (isCheckViolation(driver)) return new BadRequestException({ message: PersistenceMessage.CheckViolation, errorMetadata: ErrorMetadata.INVALID_VALUE }, { cause: error });
        return new ConflictException({ message: PersistenceMessage.ReferenceConflict, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      case SqlServerError.NullValue:
      case SqlServerError.TruncatedValue:
      case SqlServerError.TruncatedValueLegacy:
      case SqlServerError.NumericOverflow:
        return new BadRequestException({ message: PersistenceMessage.InvalidValue, errorMetadata: ErrorMetadata.INVALID_VALUE }, { cause: error });
      case SqlServerError.Deadlock:
        return new ConflictException({ message: PersistenceMessage.Deadlock, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      case SqlServerError.LockTimeout:
        return new ConflictException({ message: PersistenceMessage.LockTimeout, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      case SqlServerError.VisitLinkImmutable:
        return new ConflictException({ message: PersistenceMessage.VisitLinkImmutable, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      case SqlServerError.VisitReservationNotConfirmed:
        return new ConflictException({ message: PersistenceMessage.VisitReservationNotConfirmed, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      case SqlServerError.ReservationCompletedWithoutVisit:
        return new ConflictException({ message: PersistenceMessage.ReservationCompletedWithoutVisit, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      case SqlServerError.ReservationHasActiveVisit:
        return new ConflictException({ message: PersistenceMessage.ReservationHasActiveVisit, errorMetadata: ErrorMetadata.CONFLICT }, { cause: error });
      default:
        if (error instanceof QueryFailedError) {
          return new ApplicationException(ErrorMetadata.INTERNAL_ERROR, PersistenceMessage.Unavailable, error);
        }
        return error;
    }
  }
}
