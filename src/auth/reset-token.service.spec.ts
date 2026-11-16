import { Logger } from "@nestjs/common";
import { ResetTokenService, USED_RESET_TOKEN_RETENTION_MS } from "./reset-token.service";

describe("ResetTokenService cleanup", () => {
  afterEach(() => jest.restoreAllMocks());

  it("deletes expired tokens and tokens used more than 24 hours ago, logging through Logger", async () => {
    const repository = { deleteStale: jest.fn(async () => 4) };
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const consoleLog = jest.spyOn(console, "log");
    await new ResetTokenService(repository as any).deleteStaleTokens();
    const [now, usedBefore] = repository.deleteStale.mock.calls[0] as unknown as [Date, Date];
    expect(now.getTime() - usedBefore.getTime()).toBe(USED_RESET_TOKEN_RETENTION_MS);
    expect(USED_RESET_TOKEN_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("4"));
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("logs a constant and does not throw when the cleanup fails", async () => {
    const repository = { deleteStale: jest.fn(async () => { throw new Error("db down"); }) };
    const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    await expect(new ResetTokenService(repository as any).deleteStaleTokens()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Reset token cleanup failed");
  });
});
