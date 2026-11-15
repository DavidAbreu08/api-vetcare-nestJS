import { BadRequestException, Logger } from "@nestjs/common";
import { IsNull, MoreThan } from "typeorm";
import { PersistenceService } from "../core/persistence/persistence.service";
import { Actor } from "../core/authorization";
import { SystemRole } from "../core/enums/system-role.enum";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { EmployeesBusinessService } from "./employees.business.service";
import { EmployeeEntity } from "./entities/employee.entity";
import { EmployeeJobTitleEntity } from "./entities/employee-job-title.entity";
import { UsersEntity } from "../users/entities/users.entity";

const EMPLOYEE_ROLE = "20000000-0000-4000-8000-000000000002";
const PAST = "2000-01-01";
const admin: Actor = { id: "u-admin", roleIds: [], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };

describe("Employee profile rules", () => {
  let manager: any, employees: any, users: any, email: any, business: EmployeesBusinessService, stored: any, hasRole: boolean;

  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    hasRole = false;
    stored = { id: "E-1", userId: "U-1", terminationDate: null, hireDate: null, isAvailableForBookings: true };
    manager = {
      findOne: jest.fn(async (entity: unknown) => entity === EmployeeEntity ? stored : entity === UsersEntity ? { id: "U-1", email: "e@x.pt" } : null),
      find: jest.fn(async () => []),
      count: jest.fn(async (entity: unknown) => entity === UserRoleEntity ? Number(hasRole) : 0),
      create: jest.fn((_entity: unknown, row: unknown) => row),
      save: jest.fn(async (row: any) => ({ id: "E-1", ...row })),
      insert: jest.fn(), delete: jest.fn(),
    };
    employees = { findOne: jest.fn(async () => ({ ...stored, jobTitleLinks: [] })) };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    const settings = new SystemSettingsService({ loadAll: async () => [{ code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: EMPLOYEE_ROLE }] } as any);
    users = { createAccount: jest.fn(async (_m: unknown, data: any) => ({ user: { id: "U-NEW", email: data.email }, resetToken: "token" })) };
    email = { sendEmployeeWelcomeEmail: jest.fn(async () => undefined) };
    business = new EmployeesBusinessService(employees, dataSource as any, new PersistenceService(), users, settings, email);
  });

  it("forces a terminated employee to be unavailable for bookings and rejects an explicit true", async () => {
    await business.update("E-1", { terminationDate: PAST }, admin);
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ terminationDate: PAST, isAvailableForBookings: false }));
    manager.save.mockClear();
    await expect(business.update("E-1", { terminationDate: PAST, isAvailableForBookings: true }, admin)).rejects.toBeInstanceOf(BadRequestException);
    stored.terminationDate = PAST;
    await expect(business.update("E-1", { isAvailableForBookings: true }, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
    await expect(business.create({ userId: "U-1", terminationDate: PAST, isAvailableForBookings: true }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates terminated profiles as unavailable and without the EMPLOYEE role", async () => {
    await business.create({ userId: "U-1", terminationDate: PAST }, admin);
    expect(manager.create).toHaveBeenCalledWith(EmployeeEntity, expect.objectContaining({ userId: "U-1", isAvailableForBookings: false }));
    expect(manager.insert).not.toHaveBeenCalledWith(UserRoleEntity, expect.anything());
  });

  it("grants EMPLOYEE with the actor in the same transaction when the created profile is active", async () => {
    for (const terminationDate of [undefined, "2999-12-31"]) {
      manager.insert.mockClear();
      await business.create({ userId: "U-1", terminationDate }, admin);
      expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, { userId: "U-1", roleId: EMPLOYEE_ROLE, assignedBy: "u-admin" });
    }
  });

  it("adds EMPLOYEE to an existing client without touching their CLIENT role", async () => {
    await business.create({ userId: "U-1" }, admin);
    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, { userId: "U-1", roleId: EMPLOYEE_ROLE, assignedBy: "u-admin" });
    expect(manager.delete).not.toHaveBeenCalledWith(UserRoleEntity, expect.anything());
  });

  it("creates a new account with EMPLOYEE only when the profile is active, otherwise with no roles", async () => {
    users.createAccount.mockClear();
    await business.create({ user: { name: "Ana", email: "ana@x.pt" } }, admin);
    expect(users.createAccount).toHaveBeenLastCalledWith(manager, expect.objectContaining({ email: "ana@x.pt" }), [SystemRole.EMPLOYEE], "u-admin");
    await business.create({ user: { name: "Rui", email: "rui@x.pt" }, terminationDate: PAST }, admin);
    expect(users.createAccount).toHaveBeenLastCalledWith(manager, expect.objectContaining({ email: "rui@x.pt" }), [], "u-admin");
    expect(manager.create).toHaveBeenLastCalledWith(EmployeeEntity, expect.objectContaining({ userId: "U-NEW", isAvailableForBookings: false }));
    expect(email.sendEmployeeWelcomeEmail).toHaveBeenCalledTimes(2);
  });

  it("removes EMPLOYEE in the same transaction when an update terminates the profile, locking the row, and logs after commit", async () => {
    hasRole = true;
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await business.update("E-1", { terminationDate: PAST }, admin);
    expect(manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { id: "E-1" }, lock: { mode: "pessimistic_write" } });
    expect(manager.delete).toHaveBeenCalledWith(UserRoleEntity, { userId: "U-1", roleId: EMPLOYEE_ROLE });
    expect(manager.insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Employee role removed from user U-1 \(profile E-1 terminated\) by u-admin at \d{4}-/));
    manager.delete.mockClear();
    log.mockClear();
    hasRole = false;
    await business.update("E-1", { notes: "x" }, admin);
    expect(manager.delete).not.toHaveBeenCalledWith(UserRoleEntity, expect.anything());
    expect(log).not.toHaveBeenCalled();
  });

  it("filters isAvailableForBookings=true by a termination date that is null or in the future", async () => {
    employees.find = jest.fn(async () => []);
    await business.getAll({ isAvailableForBookings: true } as any);
    const where = employees.find.mock.calls[0][0].where;
    expect(where).toHaveLength(2);
    expect(where[0]).toEqual({ isAvailableForBookings: true, terminationDate: IsNull() });
    expect(where[1].terminationDate).toEqual(MoreThan(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
    await business.getAll({ isAvailableForBookings: false } as any);
    expect(employees.find.mock.calls[1][0].where).toEqual({ isAvailableForBookings: false });
  });

  it("keeps availability untouched for active employees and re-grants EMPLOYEE on reactivation", async () => {
    stored.terminationDate = PAST;
    stored.isAvailableForBookings = false;
    await business.update("E-1", { terminationDate: null, isAvailableForBookings: true }, admin);
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ terminationDate: null, isAvailableForBookings: true }));
    expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, { userId: "U-1", roleId: EMPLOYEE_ROLE, assignedBy: "u-admin" });
    manager.insert.mockClear();
    hasRole = true;
    await business.update("E-1", { notes: "x" }, admin);
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it("removes the EMPLOYEE role together with the deleted profile", async () => {
    await business.delete("E-1");
    expect(manager.delete).toHaveBeenCalledWith(EmployeeJobTitleEntity, { employeeId: "E-1" });
    expect(manager.delete).toHaveBeenCalledWith(EmployeeEntity, { id: "E-1" });
    expect(manager.delete).toHaveBeenCalledWith(UserRoleEntity, { userId: "U-1", roleId: EMPLOYEE_ROLE });
    expect(manager.delete).toHaveBeenCalledTimes(3);
  });

  it("never treats a terminated profile as bookable", () => {
    const user = { isActive: true } as UsersEntity;
    expect(business.isBookable({ isAvailableForBookings: true, terminationDate: PAST, user } as EmployeeEntity)).toBe(false);
    expect(business.isBookable({ isAvailableForBookings: true, terminationDate: null, user } as EmployeeEntity)).toBe(true);
    expect(business.isBookable({ isAvailableForBookings: true, terminationDate: "2999-01-10", user } as EmployeeEntity, "2999-01-10")).toBe(false);
  });
});
