import { BadRequestException, ConflictException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { PersistenceMessage } from "./persistence.messages";
import { PersistenceService } from "./persistence.service";
import { ErrorMetadata } from "../enums/error-metadata.enum";
import { ApplicationException } from "../exceptions/application.exception";

const sqlError = (number: number, message: string) =>
  new QueryFailedError("INSERT ...", [], Object.assign(new Error(message), { number }));

describe("PersistenceService error 547", () => {
  const persistence = new PersistenceService();

  it("maps CHECK constraint violations to 400 with their own message", async () => {
    const error = sqlError(547, 'The INSERT statement conflicted with the CHECK constraint "ck_vc_users_email_normalized".');
    const result = persistence.execute(() => Promise.reject(error));
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(persistence.execute(() => Promise.reject(error))).rejects.toThrow(PersistenceMessage.CheckViolation);
  });

  it("keeps FOREIGN KEY / REFERENCE violations as 409", async () => {
    for (const message of [
      'The INSERT statement conflicted with the FOREIGN KEY constraint "fk_vc_user_roles_role".',
      'The DELETE statement conflicted with the REFERENCE constraint "fk_vc_animals_owner".',
    ]) {
      await expect(persistence.execute(() => Promise.reject(sqlError(547, message)))).rejects.toBeInstanceOf(ConflictException);
    }
  });
});

describe("PersistenceService deadlocks", () => {
  it("maps SQL error 1205 (deadlock victim) to 409", async () => {
    const error = sqlError(1205, "Transaction (Process ID 52) was deadlocked on lock resources with another process.");
    await expect(new PersistenceService().execute(() => Promise.reject(error))).rejects.toThrow(PersistenceMessage.Deadlock);
    await expect(new PersistenceService().execute(() => Promise.reject(error))).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("PersistenceService translation", () => {
  const persistence = new PersistenceService();

  it("keeps already translated HTTP errors and unrelated failures unchanged", () => {
    const error = new ConflictException("Domain conflict");
    expect(persistence.translate(error)).toBe(error);
    expect(persistence.translate(null)).toBeNull();
    expect(persistence.translate("failure")).toBe("failure");
  });

  it("retains the original SQL cause with a shared duplicate category", () => {
    const source = sqlError(2627, "private SQL detail");
    const error = persistence.translate(source) as ConflictException;
    expect(error.getResponse()).toMatchObject({ errorMetadata: ErrorMetadata.ALREADY_EXISTS });
    expect(error.cause).toBe(source);
  });

  it("uses a safe message for unknown SQL errors", () => {
    const source = sqlError(123456, "private SQL detail");
    const error = persistence.translate(source) as ApplicationException;
    expect(error.getStatus()).toBe(500);
    expect(error.getResponse()).toEqual({ errorMetadata: ErrorMetadata.INTERNAL_ERROR, friendlyMessage: PersistenceMessage.Unavailable });
    expect(error.cause).toBe(source);
  });
});

describe("PersistenceService lock timeouts", () => {
  const persistence = new PersistenceService();

  it.each<[string, unknown]>([
    ["driver number", { number: 1222 }],
    ["driverError number", { driverError: { number: 1222 } }],
    ["originalError info number", { originalError: { info: { number: 1222 } } }],
  ])("maps SQL error 1222 (%s) to 409 with the lock timeout message", (_form, error) => {
    const translated = persistence.translate(error) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getStatus()).toBe(409);
    expect(translated.getResponse()).toEqual({ message: PersistenceMessage.LockTimeout, errorMetadata: ErrorMetadata.CONFLICT });
  });
});

describe("PersistenceService clinical visit rules", () => {
  const persistence = new PersistenceService();
  const trigger3616 = "An error was raised during trigger execution. The batch has been aborted and the user transaction, if any, has been rolled back.";

  it.each<[number, string]>([
    [51104, PersistenceMessage.VisitLinkImmutable],
    [51105, PersistenceMessage.VisitReservationNotConfirmed],
    [51106, PersistenceMessage.ReservationCompletedWithoutVisit],
    [51107, PersistenceMessage.ReservationHasActiveVisit],
  ])("maps trigger rule %i as the main error to 409 with its own message", (number, message) => {
    const translated = persistence.translate(sqlError(number, "private trigger detail")) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getResponse()).toEqual({ message, errorMetadata: ErrorMetadata.CONFLICT });
  });

  it.each<[string, unknown]>([
    ["trigger THROW in driverError.precedingErrors", {
      driverError: { number: 3616, message: trigger3616, precedingErrors: [{ number: 51107, message: "private trigger detail" }] },
    }],
    ["trigger THROW in top-level precedingErrors", {
      number: 3616, message: trigger3616, precedingErrors: [{ number: 51107, message: "private trigger detail" }],
    }],
    ["trigger THROW number only in precedingErrors originalError.info", {
      driverError: { number: 3616, message: trigger3616, precedingErrors: [{ originalError: { info: { number: 51107 } } }] },
    }],
  ])("maps a trigger rule followed by Msg 3616 (%s) to 409 ReservationHasActiveVisit", (_form, error) => {
    const translated = persistence.translate(error) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getResponse()).toEqual({ message: PersistenceMessage.ReservationHasActiveVisit, errorMetadata: ErrorMetadata.CONFLICT });
  });

  it("does not map a bare Msg 3616 to 409", () => {
    const translated = persistence.translate(sqlError(3616, trigger3616));
    expect(translated).not.toBeInstanceOf(ConflictException);
    expect(translated).toBeInstanceOf(ApplicationException);
    expect((translated as ApplicationException).getResponse()).toEqual({ errorMetadata: ErrorMetadata.INTERNAL_ERROR, friendlyMessage: PersistenceMessage.Unavailable });
  });
});

describe("PersistenceService regressions for 1205 and 2601", () => {
  const persistence = new PersistenceService();

  it("keeps SQL error 1205 (deadlock victim) mapped to Deadlock", () => {
    const translated = persistence.translate(sqlError(1205, "Transaction (Process ID 52) was deadlocked on lock resources with another process.")) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getResponse()).toEqual({ message: PersistenceMessage.Deadlock, errorMetadata: ErrorMetadata.CONFLICT });
  });

  it("keeps SQL error 2601 (unique index) mapped to 409 duplicate", () => {
    const translated = persistence.translate(sqlError(2601, "Cannot insert duplicate key row with unique index 'uq_example'.")) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getResponse()).toEqual({ message: PersistenceMessage.Duplicate, errorMetadata: ErrorMetadata.ALREADY_EXISTS });
  });
});

describe("PersistenceService errors behind Msg 3616", () => {
  const persistence = new PersistenceService();
  const trigger3616 = "An error was raised during trigger execution. The batch has been aborted and the user transaction, if any, has been rolled back.";

  it.each<[string, number, string, unknown]>([
    ["lock timeout 1222", 1222, "Lock request time out period exceeded.", { message: PersistenceMessage.LockTimeout, errorMetadata: ErrorMetadata.CONFLICT }],
    ["deadlock 1205", 1205, "Transaction (Process ID 52) was deadlocked on lock resources with another process.", { message: PersistenceMessage.Deadlock, errorMetadata: ErrorMetadata.CONFLICT }],
    ["unique index 2601", 2601, "Cannot insert duplicate key row with unique index 'uq_example'.", { message: PersistenceMessage.Duplicate, errorMetadata: ErrorMetadata.ALREADY_EXISTS }],
  ])("translates the error before Msg 3616 (%s) to its own 409", (_name, number, message, expected) => {
    const translated = persistence.translate({ driverError: { number: 3616, message: trigger3616, precedingErrors: [{ number, message }] } }) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getStatus()).toBe(409);
    expect(translated.getResponse()).toEqual(expected);
  });

  it("answers 400 with the CHECK wording of the error before Msg 3616", () => {
    const error = { driverError: { number: 3616, message: trigger3616, precedingErrors: [{ number: 547, message: 'The INSERT statement conflicted with the CHECK constraint "ck_vc_users_email_normalized".' }] } };
    const translated = persistence.translate(error) as BadRequestException;
    expect(translated).toBeInstanceOf(BadRequestException);
    expect(translated.getResponse()).toEqual({ message: PersistenceMessage.CheckViolation, errorMetadata: ErrorMetadata.INVALID_VALUE });
  });

  it("keeps the trigger rule ahead of the error before it", () => {
    const error = { driverError: { number: 3616, message: trigger3616, precedingErrors: [{ number: 1222, message: "Lock request time out period exceeded." }, { number: 51107, message: "private trigger detail" }] } };
    const translated = persistence.translate(error) as ConflictException;
    expect(translated).toBeInstanceOf(ConflictException);
    expect(translated.getResponse()).toEqual({ message: PersistenceMessage.ReservationHasActiveVisit, errorMetadata: ErrorMetadata.CONFLICT });
  });
});
