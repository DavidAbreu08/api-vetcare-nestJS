import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuthController, FORGOT_PASSWORD_LIMIT, PASSWORD_RECOVERY_THROTTLE_TTL_MS, RESET_PASSWORD_LIMIT } from "./auth.controller";

/** @Throttle stores per-throttler metadata under THROTTLER:LIMIT<name> / THROTTLER:TTL<name>. */
const throttle = (handler: keyof AuthController) => {
  const target = AuthController.prototype[handler];
  return {
    guards: Reflect.getMetadata(GUARDS_METADATA, target) ?? [],
    limit: Reflect.getMetadata("THROTTLER:LIMITdefault", target),
    ttl: Reflect.getMetadata("THROTTLER:TTLdefault", target),
  };
};

describe("AuthController rate limiting", () => {
  it("limits forgot-password and reset-password per IP over 15 minutes", () => {
    expect(throttle("forgotPassword")).toEqual({ guards: [ThrottlerGuard], limit: FORGOT_PASSWORD_LIMIT, ttl: PASSWORD_RECOVERY_THROTTLE_TTL_MS });
    expect(throttle("resetPassword")).toEqual({ guards: [ThrottlerGuard], limit: RESET_PASSWORD_LIMIT, ttl: PASSWORD_RECOVERY_THROTTLE_TTL_MS });
    expect([FORGOT_PASSWORD_LIMIT, RESET_PASSWORD_LIMIT, PASSWORD_RECOVERY_THROTTLE_TTL_MS]).toEqual([5, 10, 15 * 60 * 1000]);
  });

  it("does not throttle the other routes and the guard is not global", () => {
    for (const handler of ["login", "getProfile", "changePassword"] as const) {
      expect(throttle(handler).guards).not.toContain(ThrottlerGuard);
      expect(throttle(handler).limit).toBeUndefined();
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, AuthController)).toBeUndefined();
  });
});
