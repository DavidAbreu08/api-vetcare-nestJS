import * as crypto from "crypto";

/** Lifetime of a password reset / welcome token. */
export const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;

/** SHA-256 of the token text (utf8): the only form ever stored in vc_reset_tokens.token_hash. */
export function hashResetToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}

/**
 * Generates a random reset token (32 bytes as 64 lowercase hex characters) with its expiry.
 * Only tokenHash is persisted; the plain token travels exclusively in the email link.
 */
export function generateResetToken(now: Date = new Date()): { token: string; tokenHash: Buffer; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS) };
}
