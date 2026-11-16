import { UnauthorizedException } from "@nestjs/common";
import { PersistenceService } from "src/app/core/persistence/persistence.service";
import { SystemSettingsService } from "src/app/system-settings/system-settings.service";
import { SystemSettingCode } from "src/app/system-settings/enums/system-setting-code.enum";
import { UsersBusinessService } from "src/app/users/users.business.service";
import { UsersService } from "src/app/users/users.service";
import { AuthService } from "../auth.service";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy revokes tokens issued before the last password change", () => {
  const CHANGED_AT = new Date("2026-11-16T10:00:05.700Z");
  const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  let passwordChangedAt: Date | null, strategy: JwtStrategy;

  beforeAll(() => { process.env.JWT_SECRET_KEY ??= "test-secret-for-jwt-strategy-spec"; });

  beforeEach(() => {
    passwordChangedAt = CHANGED_AT;
    const usersRepository = { findOne: jest.fn(async () => ({ id: "U-1", email: "a@b.pt", name: "A", isActive: true, passwordChangedAt })) };
    const employeesRepository = { findOne: jest.fn(async () => null) };
    const membership = { activeRolesOf: jest.fn(async () => []) };
    const settings = new SystemSettingsService({ loadAll: async () => [
      { code: SystemSettingCode.ADMIN_ROLE_ID, value: "20000000-0000-4000-8000-000000000001" },
      { code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: "20000000-0000-4000-8000-000000000002" },
      { code: SystemSettingCode.CLIENT_ROLE_ID, value: "20000000-0000-4000-8000-000000000003" },
    ] } as any);
    const business = new UsersBusinessService(new PersistenceService(), {} as any, usersRepository as any, employeesRepository as any, {} as any, settings, membership as any);
    const auth = new AuthService(new UsersService(business), {} as any, {} as any, {} as any, {} as any, new PersistenceService());
    strategy = new JwtStrategy(auth);
  });

  it("rejects a token whose iat precedes password_changed_at", async () => {
    await expect(strategy.validate({ sub: "U-1", iat: seconds("2026-11-16T10:00:04Z") })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts a token issued after the change, including the same second", async () => {
    await expect(strategy.validate({ sub: "U-1", iat: seconds("2026-11-16T10:00:05.900Z") })).resolves.toMatchObject({ id: "U-1" });
    await expect(strategy.validate({ sub: "U-1", iat: seconds("2026-11-16T11:00:00Z") })).resolves.toMatchObject({ id: "U-1" });
  });

  it("accepts any token when the password never changed", async () => {
    passwordChangedAt = null;
    await expect(strategy.validate({ sub: "U-1", iat: seconds("2000-01-01T00:00:00Z") })).resolves.toMatchObject({ id: "U-1" });
  });
});
