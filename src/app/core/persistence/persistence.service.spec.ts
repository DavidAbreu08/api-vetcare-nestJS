import { BadRequestException, ConflictException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { PersistenceMessage } from "./persistence.messages";
import { PersistenceService } from "./persistence.service";

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
