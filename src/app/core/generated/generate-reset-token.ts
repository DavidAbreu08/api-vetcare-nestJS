import * as crypto from "crypto";
/**
 * Generates a secure random reset token with an expiration time.
 * @returns {object} An object containing the token and expiration date.
 */
export function generateResetToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // Expires in 1 hour

  return { token, expiresAt };
}
