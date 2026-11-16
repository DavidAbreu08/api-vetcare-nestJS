import { createHash } from "crypto";
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "./generate-reset-token";

describe("generateResetToken", () => {
  it("returns 64 hex characters, its SHA-256 (utf8) and a one-hour expiry", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    const { token, tokenHash, expiresAt } = generateResetToken(now);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toHaveLength(32);
    expect(tokenHash.equals(createHash("sha256").update(token, "utf8").digest())).toBe(true);
    expect(tokenHash.toString("hex")).not.toBe(token);
    expect(tokenHash.equals(Buffer.from(token, "hex"))).toBe(false);
    expect(expiresAt.getTime() - now.getTime()).toBe(RESET_TOKEN_TTL_MS);
  });

  it("produces different tokens and matches HASHBYTES('SHA2_256', varchar) for hex text", () => {
    expect(generateResetToken().token).not.toBe(generateResetToken().token);
    // SHA-256("abc"), the value SQL Server returns for HASHBYTES('SHA2_256', 'abc').
    expect(hashResetToken("abc").toString("hex")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
