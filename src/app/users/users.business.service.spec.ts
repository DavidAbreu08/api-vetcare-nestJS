import { BadRequestException, ConflictException, ForbiddenException, Logger } from "@nestjs/common";
import { FindOperator, In } from "typeorm";
import { PersistenceService } from "../core/persistence/persistence.service";
import { Actor } from "../core/authorization";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { UsersEntity } from "./entities/users.entity";
import { ResetTokenEntity } from "src/auth/entities/reset-token.entity";
import { isIssuedAfterPasswordChange, UsersBusinessService } from "./users.business.service";
import { createHash } from "crypto";
import { ReservationStatus } from "../core/enums/reservation-status.enum";

const ADMIN_ID = "20000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "20000000-0000-4000-8000-000000000002";
const CLIENT_ID = "20000000-0000-4000-8000-000000000003";
const ROLES = [
  { id: ADMIN_ID, code: "ADMIN", name: "Administrador", isActive: true },
  { id: EMPLOYEE_ID, code: "EMPLOYEE", name: "Funcionário", isActive: true },
  { id: CLIENT_ID, code: "CLIENT", name: "Cliente", isActive: true },
];
const admin: Actor = { id: "u-admin", roleIds: [ADMIN_ID], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };

describe("User role management", () => {
  let manager: any, business: UsersBusinessService, otherAdmins: number, currentRows: any[], profile: { id?: string; terminationDate: string | null } | null;
  /** Open reservations returned by findOpenReservations, per filter column (clientId / employeeId). */
  let open: Record<string, any[]>, account: any;
  /** Tutorship side (AnimalAccessService): animals of which U-1 is the active primary tutor. */
  let animalAccess: any, primaryOf: string[];

  beforeEach(() => {
    otherAdmins = 0;
    profile = null;
    primaryOf = [];
    animalAccess = {
      primaryAnimalIdsOf: jest.fn(async () => primaryOf),
      closeSecondaryTutorships: jest.fn(async () => ["DOG"]),
    };
    open = {};
    account = { id: "U-1", isActive: true, email: "a@b.pt", nif: null };
    currentRows = [{ userId: "U-1", roleId: ADMIN_ID.toUpperCase(), assignedBy: "original-admin", createdAt: new Date(2020, 0, 1) }];
    manager = {
      findOne: jest.fn(async (entity: unknown) => entity === UsersEntity ? { ...account }
        : entity === EmployeeEntity ? profile : { id: ADMIN_ID, isActive: true }),
      find: jest.fn(async (entity: unknown, options: any) => entity === UserRoleEntity ? currentRows
        : ROLES.filter(role => (options.where.id as FindOperator<string[]>).value.includes(role.id))),
      count: jest.fn(async (_entity: unknown, options: any) => options.where.userId instanceof FindOperator
        ? otherAdmins : Number(currentRows.some(row => row.roleId.toLowerCase() === ADMIN_ID))),
      delete: jest.fn(), insert: jest.fn(), softDelete: jest.fn(), save: jest.fn(async (row: unknown) => row),
      createQueryBuilder: jest.fn(() => {
        let column = "";
        const qb: any = {};
        qb.select = qb.orderBy = qb.addOrderBy = qb.andWhere = () => qb;
        qb.where = (sql: string) => ((column = sql.replace(/^r\.(\w+) = :value$/, "$1")), qb);
        qb.getMany = async () => open[column] ?? [];
        return qb;
      }),
    };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    const settings = new SystemSettingsService({ loadAll: async () => [
      { code: SystemSettingCode.ADMIN_ROLE_ID, value: ADMIN_ID },
      { code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: EMPLOYEE_ID },
      { code: SystemSettingCode.CLIENT_ROLE_ID, value: CLIENT_ID },
    ] } as any);
    business = new UsersBusinessService(new PersistenceService(), dataSource as any, {} as any, {} as any, {} as any, settings, {} as any, animalAccess as any);
  });

  afterEach(() => jest.restoreAllMocks());

  describe("last administrator", () => {
    it("prevents the last active administrator from losing the administrator role", async () => {
      await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).rejects.toBeInstanceOf(ConflictException);
      await expect(business.replaceRoles("U-1", [], admin)).rejects.toBeInstanceOf(ConflictException);
      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it("allows the change when another active administrator remains, serializing on the role row, and logs it", async () => {
      otherAdmins = 1;
      const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).resolves.toEqual({ userId: "U-1", roles: [{ id: CLIENT_ID, code: "CLIENT", name: "Cliente" }] });
      expect(manager.findOne).toHaveBeenCalledWith(RoleEntity, { where: { id: ADMIN_ID }, lock: { mode: "pessimistic_write" } });
      expect(manager.delete).toHaveBeenCalledWith(UserRoleEntity, { userId: "U-1", roleId: In([ADMIN_ID.toUpperCase()]) });
      expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, [{ userId: "U-1", roleId: CLIENT_ID, assignedBy: "u-admin" }]);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Administrator role removed from user U-1 by u-admin at \d{4}-/));
    });

    it("skips the check when the administrator role is kept or the user is not an administrator", async () => {
      await expect(business.replaceRoles("U-1", [ADMIN_ID.toUpperCase(), CLIENT_ID], admin)).resolves.toBeDefined();
      currentRows = [];
      jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
      await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).resolves.toBeDefined();
      expect(manager.findOne).not.toHaveBeenCalledWith(RoleEntity, expect.anything());
    });

    it("applies to soft deletion and deactivation, and removes reset tokens explicitly on delete", async () => {
      await expect(business.delete("U-1")).rejects.toBeInstanceOf(ConflictException);
      await expect(business.update("U-1", { isActive: false }, admin)).rejects.toBeInstanceOf(ConflictException);
      expect(manager.softDelete).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      otherAdmins = 2;
      await business.delete("U-1");
      // Account row locked before the reset tokens are deleted (users -> tokens, as in AuthService).
      expect(manager.findOne).toHaveBeenCalledWith(UsersEntity, { where: { id: "U-1" }, lock: { mode: "pessimistic_write" } });
      expect(manager.delete).toHaveBeenCalledWith(ResetTokenEntity, { user: { id: "U-1" } });
      expect(manager.softDelete).toHaveBeenCalledWith(UsersEntity, { id: "U-1" });
    });
  });

  it("preserves kept assignments (assigned_by, created_at) and only inserts new ones with the actor", async () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await business.replaceRoles("U-1", [ADMIN_ID, CLIENT_ID], admin);
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, [{ userId: "U-1", roleId: CLIENT_ID, assignedBy: "u-admin" }]);
    expect(currentRows[0]).toMatchObject({ assignedBy: "original-admin", createdAt: new Date(2020, 0, 1) });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs administrator role assignments with actor, target and date", async () => {
    currentRows = [];
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await business.replaceRoles("U-1", [ADMIN_ID], admin);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Administrator role assigned to user U-1 by u-admin at \d{4}-\d{2}-\d{2}T/));
  });

  describe("employee role follows the employee profile", () => {
    beforeEach(() => { currentRows = [{ userId: "U-1", roleId: EMPLOYEE_ID }]; });

    it("rejects removing EMPLOYEE while the profile is active (no or future termination)", async () => {
      for (const terminationDate of [null, "2999-12-31"]) {
        profile = { terminationDate };
        await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).rejects.toBeInstanceOf(ConflictException);
      }
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it("allows removing EMPLOYEE once the profile is terminated or absent", async () => {
      profile = { terminationDate: "2000-01-01" };
      await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).resolves.toBeDefined();
      profile = null;
      await expect(business.replaceRoles("U-1", [], admin)).resolves.toBeDefined();
    });

    it("lets an active employee also hold CLIENT (and a client gain EMPLOYEE with a profile)", async () => {
      profile = { terminationDate: null };
      await expect(business.replaceRoles("U-1", [EMPLOYEE_ID, CLIENT_ID], admin)).resolves.toMatchObject({
        roles: [expect.objectContaining({ code: "EMPLOYEE" }), expect.objectContaining({ code: "CLIENT" })],
      });
      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, [{ userId: "U-1", roleId: CLIENT_ID, assignedBy: "u-admin" }]);
      currentRows = [{ userId: "U-1", roleId: CLIENT_ID }];
      manager.insert.mockClear();
      await business.replaceRoles("U-1", [CLIENT_ID, EMPLOYEE_ID], admin);
      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, [{ userId: "U-1", roleId: EMPLOYEE_ID, assignedBy: "u-admin" }]);
    });

    it("never grants EMPLOYEE to an account without an active profile", async () => {
      currentRows = [];
      await expect(business.replaceRoles("U-1", [EMPLOYEE_ID], admin)).rejects.toBeInstanceOf(ConflictException);
      profile = { terminationDate: null };
      await expect(business.replaceRoles("U-1", [EMPLOYEE_ID], admin)).resolves.toBeDefined();
    });
  });

  it("rejects unknown roles and new assignments of inactive roles", async () => {
    await expect(business.replaceRoles("U-1", ["20000000-0000-4000-8000-0000000000ff"], admin)).rejects.toBeInstanceOf(BadRequestException);
    manager.find.mockImplementation(async (entity: unknown) => entity === UserRoleEntity ? [] : [{ id: CLIENT_ID, isActive: false }]);
    await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses (409) to soft-delete a user with an active employee profile, locking the profile", async () => {
    otherAdmins = 2;
    for (const terminationDate of [null, "2999-12-31"]) {
      profile = { terminationDate };
      await expect(business.delete("U-1")).rejects.toBeInstanceOf(ConflictException);
    }
    expect(manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { userId: "U-1" }, lock: { mode: "pessimistic_write" } });
    expect(manager.softDelete).not.toHaveBeenCalled();
    profile = { terminationDate: "2000-01-01" };
    await business.delete("U-1");
    expect(manager.softDelete).toHaveBeenCalledWith(UsersEntity, { id: "U-1" });
  });

  describe("open reservations block deactivation and deletion (A1, A2)", () => {
    const row = (id: string, status = ReservationStatus.PENDING) => ({ id, status, startAt: new Date("2999-01-01T10:00:00Z") });
    beforeEach(() => { currentRows = []; });

    it("refuses to deactivate or delete a client with open reservations (409 with their ids)", async () => {
      open.clientId = [row("R-1"), row("R-2", ReservationStatus.CONFIRMED)];
      for (const run of [() => business.update("U-1", { isActive: false }, admin), () => business.delete("U-1")]) {
        const error = await run().catch(e => e);
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({
          code: "CLIENT_HAS_OPEN_RESERVATIONS", reservationIds: ["R-1", "R-2"],
          reservations: [{ id: "R-1", status: "PENDING", startAt: "2999-01-01T10:00:00.000Z" }, expect.objectContaining({ id: "R-2" })],
        });
      }
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.softDelete).not.toHaveBeenCalled();
      // Account locked before the reservations are read.
      expect(manager.findOne).toHaveBeenCalledWith(UsersEntity, { where: { id: "U-1" }, lock: { mode: "pessimistic_write" } });
      expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(manager.createQueryBuilder.mock.invocationCallOrder[0]);
    });

    it("refuses to deactivate an account whose employee profile has open reservations assigned, locking the profile", async () => {
      profile = { id: "E-1", terminationDate: null };
      open.employeeId = [row("R-9", ReservationStatus.CONFIRMED)];
      await expect(business.update("U-1", { isActive: false }, admin)).rejects.toMatchObject({
        response: { code: "EMPLOYEE_HAS_OPEN_RESERVATIONS", reservationIds: ["R-9"] },
      });
      expect(manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { userId: "U-1" }, lock: { mode: "pessimistic_write" } });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it("deactivates and deletes when nothing is open, and ignores reservations on other updates", async () => {
      await expect(business.update("U-1", { isActive: false }, admin)).resolves.toBeDefined();
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      open.clientId = [row("R-1")];
      manager.createQueryBuilder.mockClear();
      await expect(business.update("U-1", { name: "Novo" }, admin)).resolves.toBeDefined();
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
      open.clientId = [];
      await business.delete("U-1");
      expect(manager.softDelete).toHaveBeenCalledWith(UsersEntity, { id: "U-1" });
    });
  });

  describe("tutorships of the account (decision 14, B3)", () => {
    beforeEach(() => { currentRows = []; });

    it("refuses (409 with the animals) to delete the active primary tutor of non-deleted animals, after locking the account", async () => {
      primaryOf = ["CAT", "DOG"];
      const error = await business.delete("U-1", admin).catch(e => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: "PRIMARY_TUTOR_OF_ANIMALS", animalIds: ["CAT", "DOG"] });
      expect(animalAccess.primaryAnimalIdsOf).toHaveBeenCalledWith(manager, "U-1");
      expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(animalAccess.primaryAnimalIdsOf.mock.invocationCallOrder[0]);
      expect(animalAccess.closeSecondaryTutorships).not.toHaveBeenCalled();
      expect(manager.softDelete).not.toHaveBeenCalled();
    });

    it("closes the account's secondary tutorships (ACCOUNT_DELETED, by the actor) in the deletion transaction", async () => {
      await business.delete("U-1", admin);
      expect(animalAccess.closeSecondaryTutorships).toHaveBeenCalledWith(manager, "U-1", "ACCOUNT_DELETED", "u-admin");
      expect(animalAccess.closeSecondaryTutorships.mock.invocationCallOrder[0]).toBeLessThan(manager.softDelete.mock.invocationCallOrder[0]);
      expect(manager.softDelete).toHaveBeenCalledWith(UsersEntity, { id: "U-1" });
    });

    it("does not touch tutorships when an account is deactivated (reversible; it only loses access while inactive)", async () => {
      await business.update("U-1", { isActive: false }, admin);
      expect(animalAccess.primaryAnimalIdsOf).not.toHaveBeenCalled();
      expect(animalAccess.closeSecondaryTutorships).not.toHaveBeenCalled();
    });

    it("applies the same rule when the CLIENT role is removed (ROLE_CHANGED), and ignores other role changes", async () => {
      currentRows = [{ userId: "U-1", roleId: CLIENT_ID }];
      primaryOf = ["CAT"];
      await expect(business.replaceRoles("U-1", [], admin)).rejects.toMatchObject({ response: { code: "PRIMARY_TUTOR_OF_ANIMALS", animalIds: ["CAT"] } });
      expect(manager.delete).not.toHaveBeenCalled();
      primaryOf = [];
      await business.replaceRoles("U-1", [], admin);
      expect(animalAccess.closeSecondaryTutorships).toHaveBeenCalledWith(manager, "U-1", "ROLE_CHANGED", "u-admin");
      animalAccess.primaryAnimalIdsOf.mockClear();
      currentRows = [{ userId: "U-1", roleId: CLIENT_ID }];
      await business.replaceRoles("U-1", [CLIENT_ID], admin);
      expect(animalAccess.primaryAnimalIdsOf).not.toHaveBeenCalled();
    });
  });

  it("refuses new role assignments to an inactive account (409) but still allows removals (A4)", async () => {
    currentRows = [{ userId: "U-1", roleId: CLIENT_ID }];
    account.isActive = false;
    await expect(business.replaceRoles("U-1", [CLIENT_ID, ADMIN_ID], admin)).rejects.toMatchObject({ status: 409 });
    expect(manager.insert).not.toHaveBeenCalled();
    await expect(business.replaceRoles("U-1", [], admin)).resolves.toBeDefined();
    expect(manager.findOne).toHaveBeenCalledWith(UsersEntity, { where: { id: "U-1" }, lock: { mode: "pessimistic_write" } });
    account.isActive = true;
    await expect(business.replaceRoles("U-1", [CLIENT_ID], admin)).resolves.toBeDefined();
  });

  it("registers public accounts with CLIENT only and a null assigned_by", async () => {
    manager.findOne.mockImplementation(async () => null);
    manager.create = jest.fn((_entity: unknown, row: unknown) => row);
    manager.save.mockImplementation(async (row: any) => ({ id: "U-NEW", ...row }));
    const created = await business.create({ name: " Ana ", email: " Ana@X.pt ", password: "Secret#123" } as any);
    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalledWith(UserRoleEntity, [{ userId: "U-NEW", roleId: CLIENT_ID, assignedBy: null }]);
    expect(created).toMatchObject({ id: "U-NEW", name: "Ana", email: "ana@x.pt" });
    expect(created).not.toHaveProperty("passwordHash");
  });

  describe("loadActor flags", () => {
    let usersRepository: any, employeesRepository: any, membership: any;
    const load = (roleIds: string[], employee: { id: string; terminationDate: string | null } | null) => {
      usersRepository = { findOne: jest.fn(async () => ({ id: "U-1", email: "a@b.pt", name: "A", isActive: true })) };
      employeesRepository = { findOne: jest.fn(async () => employee) };
      membership = { activeRolesOf: jest.fn(async () => roleIds.map(id => ({ id: id.toUpperCase() }))) };
      const settings = new SystemSettingsService({ loadAll: async () => [
        { code: SystemSettingCode.ADMIN_ROLE_ID, value: ADMIN_ID },
        { code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: EMPLOYEE_ID },
        { code: SystemSettingCode.CLIENT_ROLE_ID, value: CLIENT_ID },
      ] } as any);
      const service = new UsersBusinessService(new PersistenceService(), {} as any, usersRepository, employeesRepository, {} as any, settings, membership, {} as any);
      return service.loadActor("U-1");
    };

    it("treats EMPLOYEE holders with an active profile (no or future termination) as employees", async () => {
      for (const terminationDate of [null, "2999-12-31"]) {
        await expect(load([EMPLOYEE_ID], { id: "E-1", terminationDate })).resolves.toMatchObject({
          isEmployee: true, isAdmin: false, roleIds: [EMPLOYEE_ID], employeeId: "E-1",
        });
      }
      expect(employeesRepository.findOne).toHaveBeenCalledWith({ where: { userId: "U-1" }, select: { id: true, terminationDate: true } });
    });

    it("does not treat a terminated profile (or a missing one) as employee and drops EMPLOYEE from roleIds", async () => {
      await expect(load([EMPLOYEE_ID, CLIENT_ID], { id: "E-1", terminationDate: "2000-01-01" })).resolves.toMatchObject({
        isEmployee: false, isClient: true, roleIds: [CLIENT_ID], employeeId: "E-1",
      });
      await expect(load([EMPLOYEE_ID], null)).resolves.toMatchObject({ isEmployee: false, roleIds: [], employeeId: null });
    });

    it("keeps both flags for an account that is client and active employee", async () => {
      await expect(load([CLIENT_ID, EMPLOYEE_ID], { id: "E-1", terminationDate: null })).resolves.toMatchObject({
        isEmployee: true, isClient: true, isAdmin: false, roleIds: [CLIENT_ID, EMPLOYEE_ID], employeeId: "E-1",
      });
    });

    it("keeps a profile without the EMPLOYEE role from gaining staff access", async () => {
      await expect(load([CLIENT_ID], { id: "E-1", terminationDate: null })).resolves.toMatchObject({ isEmployee: false, roleIds: [CLIENT_ID] });
    });
  });

  it("returns both roles and the employee profile in the /auth/me contract", async () => {
    const usersRepository = { findOne: jest.fn(async () => ({ id: "U-1", name: "Ana", email: "ana@x.pt", isActive: true, passwordHash: "h" })) };
    const employeesRepository = { findOne: jest.fn(async () => ({ id: "E-1", userId: "U-1", terminationDate: null, jobTitleLinks: [] })) };
    const membership = { activeRolesOf: jest.fn(async () => [ROLES[2], ROLES[1]]) };
    const service = new UsersBusinessService(new PersistenceService(), {} as any, usersRepository as any, employeesRepository as any, {} as any, {} as any, membership as any, {} as any);
    const me: any = await service.getAccountProfile("U-1");
    expect(me.roles.map((role: any) => role.code)).toEqual(["CLIENT", "EMPLOYEE"]);
    expect(me.employee).toMatchObject({ id: "E-1", userId: "U-1" });
    expect(me).not.toHaveProperty("passwordHash");
  });

  it("reserves email and activation changes for administrators", async () => {
    const client: Actor = { ...admin, id: "U-1", isAdmin: false, isClient: true, roleIds: [CLIENT_ID] };
    await expect(business.update("U-1", { isActive: false }, client)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.update("U-1", { email: "x@y.pt" }, client)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("Welcome tokens of accounts created without a password", () => {
  it("stores only the SHA-256 of the token and sends the plain token by email", async () => {
    const manager = {
      findOne: jest.fn(async () => null),
      create: jest.fn((_entity: unknown, row: unknown) => row),
      save: jest.fn(async (row: any) => ({ id: "U-NEW", ...row })),
      insert: jest.fn(),
    };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    const settings = new SystemSettingsService({ loadAll: async () => [{ code: SystemSettingCode.CLIENT_ROLE_ID, value: CLIENT_ID }] } as any);
    const email = { sendClientWelcomeEmail: jest.fn(async () => undefined) };
    const business = new UsersBusinessService(new PersistenceService(), dataSource as any, {} as any, {} as any, email as any, settings, {} as any, {} as any);

    await business.createClient({ name: "Ana", email: "ana@x.pt" } as any, admin);

    const [, token] = email.sendClientWelcomeEmail.mock.calls[0] as unknown as [string, string];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const tokenRow = manager.insert.mock.calls.find(([entity]) => entity === ResetTokenEntity)?.[1];
    expect(tokenRow).toMatchObject({ userId: "U-NEW", usedAt: null });
    expect(tokenRow.tokenHash).toEqual(createHash("sha256").update(token, "utf8").digest());
    expect(tokenRow.createdAt).toBeInstanceOf(Date);
    expect(tokenRow.expiresAt.getTime() - tokenRow.createdAt.getTime()).toBe(60 * 60 * 1000);
    for (const call of [...manager.insert.mock.calls, ...manager.save.mock.calls, ...manager.create.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(token);
    }
  });
});

describe("isIssuedAfterPasswordChange (JWT iat in seconds)", () => {
  const changedAt = new Date("2026-11-16T10:00:05.700Z");
  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  it("rejects tokens issued in an earlier second and accepts the same or a later second", () => {
    expect(isIssuedAfterPasswordChange(at("2026-11-16T10:00:04.999Z"), changedAt)).toBe(false);
    expect(isIssuedAfterPasswordChange(at("2026-11-16T09:00:00Z"), changedAt)).toBe(false);
    // Login right after the change, within the same second, must keep working.
    expect(isIssuedAfterPasswordChange(at("2026-11-16T10:00:05.900Z"), changedAt)).toBe(true);
    expect(isIssuedAfterPasswordChange(at("2026-11-16T10:30:00Z"), changedAt)).toBe(true);
  });

  it("accepts any token when the password never changed, and rejects a token without iat otherwise", () => {
    expect(isIssuedAfterPasswordChange(at("2000-01-01T00:00:00Z"), null)).toBe(true);
    expect(isIssuedAfterPasswordChange(undefined, null)).toBe(true);
    expect(isIssuedAfterPasswordChange(undefined, changedAt)).toBe(false);
  });
});
