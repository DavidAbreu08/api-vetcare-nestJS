export const AuthMessages = {
  INVALID_CREDENTIALS: "Invalid credentials",
  USER_NOT_FOUND_AUTHENTICATION: "User not Found!",
  INVALID_OLD_PASSWORD: "Old Password is invalid!",
  PASSWORD_CONFIRMATION_MISMATCH: "New Password and Confirm New Password must be the same!",
  PASSWORD_CHANGED: "Password changed successfully!",
  PASSWORD_RESET_REQUESTED: "If this user exists, they will receive an email!",
  /** Single answer for unknown, expired, already used tokens and for accounts that cannot be reset. */
  INVALID_RESET_TOKEN: "Invalid, expired or already used reset token",
  INVALID_RESET_TOKEN_FORMAT: "resetToken must be 64 lowercase hexadecimal characters",
  PASSWORD_RESET: "Password reset successfully!",
  /** Logged without the email address or the token. */
  PASSWORD_RESET_FAILED: "Password reset request could not be processed",
  RESET_EMAIL_FAILED: "Password reset email could not be sent",
} as const;
