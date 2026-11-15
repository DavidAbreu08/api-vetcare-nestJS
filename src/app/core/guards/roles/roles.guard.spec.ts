import { ExecutionContext, InternalServerErrorException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { SystemRole } from "../../enums/system-role.enum";
import { SystemSettingCode } from "../../../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../../../system-settings/system-settings.service";
import { MessagesHelper } from "../../../helpers/messages.helper";
import { Roles } from "../../decorators/roles.decorator";

const ADMIN_ID = "20000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "20000000-0000-4000-8000-000000000002";
const CLIENT_ID = "20000000-0000-4000-8000-000000000003";

class Endpoints {
  @Roles(SystemRole.ADMIN) adminOnly() {}
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE) staff() {}
  open() {}
}

function context(handler: keyof Endpoints, user: unknown): ExecutionContext {
  return {
    getHandler: () => Endpoints.prototype[handler],
    getClass: () => Endpoints,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard with system-role settings", () => {
  let settings: SystemSettingsService;
  let business: { loadAll: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    business = { loadAll: jest.fn().mockResolvedValue([
      { code: SystemSettingCode.ADMIN_ROLE_ID, value: ADMIN_ID },
      { code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: EMPLOYEE_ID },
      { code: SystemSettingCode.CLIENT_ROLE_ID, value: CLIENT_ID },
    ]) };
    settings = new SystemSettingsService(business as any);
    guard = new RolesGuard(new Reflector(), settings);
  });

  it("stores setting keys, never role ids or codes, in route metadata", () => {
    expect(Reflect.getMetadata(MessagesHelper.ROLES_KEY, Endpoints.prototype.adminOnly)).toEqual([SystemSettingCode.ADMIN_ROLE_ID]);
  });

  it("allows routes without @Roles to any authenticated user", async () => {
    await expect(guard.canActivate(context("open", { roleIds: [] }))).resolves.toBe(true);
    expect(business.loadAll).not.toHaveBeenCalled();
  });

  it("allows a user holding ANY of the resolved role ids, case-insensitively", async () => {
    await expect(guard.canActivate(context("adminOnly", { roleIds: [ADMIN_ID.toUpperCase()] }))).resolves.toBe(true);
    await expect(guard.canActivate(context("staff", { roleIds: [CLIENT_ID, EMPLOYEE_ID] }))).resolves.toBe(true);
  });

  it("denies users without a matching role, without roles or without a user", async () => {
    await expect(guard.canActivate(context("adminOnly", { roleIds: [EMPLOYEE_ID, CLIENT_ID] }))).resolves.toBe(false);
    await expect(guard.canActivate(context("staff", { roleIds: [] }))).resolves.toBe(false);
    await expect(guard.canActivate(context("staff", { role: "97" }))).resolves.toBe(false);
    await expect(guard.canActivate(context("staff", undefined))).resolves.toBe(false);
  });

  it("follows a changed setting instead of a hard-coded role", async () => {
    const replacement = "20000000-0000-4000-8000-0000000000aa";
    business.loadAll.mockResolvedValue([{ code: SystemSettingCode.ADMIN_ROLE_ID, value: replacement }]);
    await expect(guard.canActivate(context("adminOnly", { roleIds: [ADMIN_ID] }))).resolves.toBe(false);
    await expect(guard.canActivate(context("adminOnly", { roleIds: [replacement] }))).resolves.toBe(true);
  });

  it("fails closed when a required setting is missing or malformed", async () => {
    business.loadAll.mockResolvedValue([{ code: SystemSettingCode.ADMIN_ROLE_ID, value: "not-a-uuid" }]);
    await expect(guard.canActivate(context("adminOnly", { roleIds: ["not-a-uuid"] }))).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
