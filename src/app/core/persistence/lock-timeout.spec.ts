import { EntityManager } from "typeorm";
import { withLockTimeout } from "./lock-timeout";

/**
 * EntityManager double whose query runner has an open transaction. Every batch is recorded as "batch:<sql>" in `events`
 * (and may be made to fail by `failBatch`), so the order of the SET statements and of `work` can be asserted.
 */
function transactionManager(failBatch: (sql: string) => Error | undefined = () => undefined) {
  const events: string[] = [];
  const batch = jest.fn(async (sql: string) => {
    events.push(`batch:${sql}`);
    const failure = failBatch(sql);
    if (failure) throw failure;
  });
  const manager = {
    queryRunner: { isTransactionActive: true, databaseConnection: { request: () => ({ batch }) } },
  } as unknown as EntityManager;
  return { manager, events, batch };
}

/** The error mssql raises when the transaction is no longer begun (the server ended it and released the connection). */
const notBegun = () => Object.assign(new Error("Transaction has not begun. Call begin() first."), { code: "ENOTBEGUN" });
const isReset = (sql: string) => sql === "SET LOCK_TIMEOUT -1;";

describe("withLockTimeout", () => {
  it("sets the timeout before work, restores -1 after it, and returns the result of work", async () => {
    const { manager, events, batch } = transactionManager();
    const work = jest.fn(async () => {
      events.push("work");
      return "result";
    });

    await expect(withLockTimeout(manager, work)).resolves.toBe("result");
    expect(events).toEqual(["batch:SET LOCK_TIMEOUT 5000;", "work", "batch:SET LOCK_TIMEOUT -1;"]);
    expect(work).toHaveBeenCalledWith(manager);
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it("restores -1 when work rejects, and rethrows the original error", async () => {
    const { manager, events } = transactionManager();
    const original = new Error("work failed");

    await expect(withLockTimeout(manager, async () => { throw original; })).rejects.toBe(original);
    expect(events).toEqual(["batch:SET LOCK_TIMEOUT 5000;", "batch:SET LOCK_TIMEOUT -1;"]);
  });

  it("rethrows the error of work, not the reset failure, when the reset also fails (ENOTBEGUN)", async () => {
    const { manager } = transactionManager(sql => (isReset(sql) ? notBegun() : undefined));
    const original = new Error("1222 lock request time out");

    await expect(withLockTimeout(manager, async () => { throw original; })).rejects.toBe(original);
  });

  it("returns the result of work when only the reset fails (ENOTBEGUN)", async () => {
    const { manager } = transactionManager(sql => (isReset(sql) ? notBegun() : undefined));

    await expect(withLockTimeout(manager, async () => "ok")).resolves.toBe("ok");
  });

  it("uses the given timeout in the SET batch", async () => {
    const { manager, events } = transactionManager();

    await withLockTimeout(manager, async () => { events.push("work"); }, 2500);
    expect(events).toEqual(["batch:SET LOCK_TIMEOUT 2500;", "work", "batch:SET LOCK_TIMEOUT -1;"]);
  });

  it.each([1.5, -1, NaN])("rejects the timeout %p without touching the connection or running work", async timeoutMs => {
    const { manager, batch } = transactionManager();
    const work = jest.fn(async () => "never");

    await expect(withLockTimeout(manager, work, timeoutMs)).rejects.toThrow("non-negative integer");
    expect(batch).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("does not run work when the SET fails, and the error propagates", async () => {
    const failure = new Error("connection lost");
    const { manager, batch } = transactionManager(sql => (sql === "SET LOCK_TIMEOUT 5000;" ? failure : undefined));
    const work = jest.fn(async () => "never");

    await expect(withLockTimeout(manager, work)).rejects.toBe(failure);
    expect(work).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledTimes(1);
  });

  describe("outside an active SQL Server transaction", () => {
    const batch = jest.fn(async () => undefined);
    beforeEach(() => batch.mockClear());

    it.each([
      ["has no query runner", undefined],
      ["has no active transaction", { isTransactionActive: false, databaseConnection: { request: () => ({ batch }) } }],
      ["has no SQL Server connection", { isTransactionActive: true, databaseConnection: undefined }],
      ["has a connection without request", { isTransactionActive: true, databaseConnection: {} }],
    ])("refuses to run work when the manager %s", async (_label, queryRunner) => {
      const manager = { queryRunner } as unknown as EntityManager;
      const work = jest.fn(async () => "never");

      await expect(withLockTimeout(manager, work)).rejects.toThrow("withLockTimeout must run inside an active SQL Server transaction");
      expect(work).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    });
  });
});
