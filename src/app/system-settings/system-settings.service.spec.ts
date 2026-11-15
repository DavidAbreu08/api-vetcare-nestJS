import { BadRequestException, ConflictException, InternalServerErrorException } from "@nestjs/common";
import { FindOperator } from "typeorm";
import { PersistenceService } from "../core/persistence/persistence.service";
import { SystemRole } from "../core/enums/system-role.enum";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { SystemSettingEntity } from "./entities/system-setting.entity";
import { SystemSettingCode } from "./enums/system-setting-code.enum";
import { SystemSettingsBusinessService } from "./system-settings.business.service";
import { SystemSettingsService } from "./system-settings.service";

const ADMIN_ID = "20000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "20000000-0000-4000-8000-000000000002";
const CLIENT_ID = "20000000-0000-4000-8000-000000000003";
const SPARE_ID = "20000000-0000-4000-8000-000000000004";
const rows = () => [
  { id: "s1", code: SystemSettingCode.ADMIN_ROLE_ID, value: ADMIN_ID.toUpperCase() },
  { id: "s2", code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: EMPLOYEE_ID },
  { id: "s3", code: SystemSettingCode.CLIENT_ROLE_ID, value: CLIENT_ID },
  { id: "s4", code: "SUPPORT_EMAIL", value: "help@example.com" },
];

describe("SystemSettingsService", () => {
  let repo: any, manager: any, roleRows: any[], holders: number, missingEmployees: number, transactions: number;
  let business: SystemSettingsBusinessService, service: SystemSettingsService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockImplementation(async () => rows()),
      findOneBy: jest.fn().mockImplementation(async ({ id }) => rows().find(row => row.id === id) ?? null),
    };
    roleRows = [ADMIN_ID, EMPLOYEE_ID, CLIENT_ID, SPARE_ID].map(id => ({ id, isActive: true }));
    holders = 1;
    missingEmployees = 0;
    transactions = 0;
    const query: any = {};
    for (const name of ["innerJoin", "where", "andWhere"]) query[name] = jest.fn(() => query);
    query.getCount = jest.fn(async () => missingEmployees);
    manager = {
      findOne: jest.fn(async (_entity: unknown, options: any) => rows().find(row => row.id === options.where.id) ?? null),
      find: jest.fn(async (entity: unknown, options: any) => {
        const values = (options.where.id ?? options.where.code) as FindOperator<string[]>;
        if (entity === SystemSettingEntity) return rows().filter(row => values.value.includes(row.code));
        return roleRows.filter(role => values.value.includes(role.id));
      }),
      count: jest.fn(async () => holders),
      createQueryBuilder: jest.fn(() => query),
      save: jest.fn(async (row: unknown) => row),
    };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => { transactions++; return work(manager); }) };
    business = new SystemSettingsBusinessService(repo, dataSource as any, new PersistenceService());
    service = new SystemSettingsService(business);
  });

  afterEach(() => jest.restoreAllMocks());

  it("resolves system roles to lowercase role ids and derives flags", async () => {
    await expect(service.resolveRoleId(SystemRole.ADMIN)).resolves.toBe(ADMIN_ID);
    await expect(service.resolveRoleIds([SystemRole.EMPLOYEE, SystemRole.CLIENT, SystemRole.EMPLOYEE])).resolves.toEqual([EMPLOYEE_ID, CLIENT_ID]);
    await expect(service.systemRoleFlags([CLIENT_ID.toUpperCase()])).resolves.toEqual({ isAdmin: false, isEmployee: false, isClient: true });
    await expect(service.isReferencedRole(ADMIN_ID)).resolves.toBe(true);
    await expect(service.isReferencedRole("20000000-0000-4000-8000-0000000000ff")).resolves.toBe(false);
  });

  it("caches settings across lookups and reloads after the TTL", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    await service.resolveRoleId(SystemRole.ADMIN);
    await service.resolveRoleId(SystemRole.CLIENT);
    await service.getValue("SUPPORT_EMAIL");
    expect(repo.find).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000 + SystemSettingsService.CACHE_TTL_MS);
    await service.resolveRoleId(SystemRole.ADMIN);
    expect(repo.find).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed load", async () => {
    repo.find.mockRejectedValueOnce(new Error("down"));
    await expect(service.resolveRoleId(SystemRole.ADMIN)).rejects.toThrow("down");
    await expect(service.resolveRoleId(SystemRole.ADMIN)).resolves.toBe(ADMIN_ID);
    expect(repo.find).toHaveBeenCalledTimes(2);
  });

  it("fails closed for missing or malformed role settings", async () => {
    repo.find.mockResolvedValue([{ code: SystemSettingCode.ADMIN_ROLE_ID, value: "admin" }]);
    await expect(service.resolveRoleId(SystemRole.ADMIN)).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(service.resolveRoleId(SystemRole.CLIENT)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("invalidates the cache after the update transaction ends, even when it fails", async () => {
    await service.resolveRoleId(SystemRole.EMPLOYEE);
    await service.update("s2", { value: EMPLOYEE_ID });
    await service.resolveRoleId(SystemRole.EMPLOYEE);
    expect(repo.find).toHaveBeenCalledTimes(2);
    roleRows = [];
    await expect(service.update("s2", { value: SPARE_ID })).rejects.toBeInstanceOf(BadRequestException);
    await service.resolveRoleId(SystemRole.EMPLOYEE);
    expect(repo.find).toHaveBeenCalledTimes(3);
  });

  it("validates and saves in one transaction, locking every role setting and the previous/new role rows", async () => {
    await service.update("s2", { value: SPARE_ID });
    expect(transactions).toBe(1);
    const settingsCall = manager.find.mock.calls.find(([entity]: unknown[]) => entity === SystemSettingEntity)[1];
    expect(settingsCall.lock).toEqual({ mode: "pessimistic_write" });
    expect(settingsCall.where.code.value).toEqual(expect.arrayContaining([
      SystemSettingCode.ADMIN_ROLE_ID, SystemSettingCode.EMPLOYEE_ROLE_ID, SystemSettingCode.CLIENT_ROLE_ID,
    ]));
    const roleCall = manager.find.mock.calls.find(([entity]: unknown[]) => entity === RoleEntity)[1];
    expect(roleCall.lock).toEqual({ mode: "pessimistic_write" });
    expect(roleCall.where.id.value).toEqual([SPARE_ID, EMPLOYEE_ID]);
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ id: "s2", value: SPARE_ID }));
  });

  it("requires role settings to reference an existing, active role and normalizes the id", async () => {
    expect(await service.update("s2", { value: ` ${EMPLOYEE_ID.toUpperCase()} ` })).toMatchObject({ value: EMPLOYEE_ID });
    for (const value of ["not-a-uuid", null]) await expect(service.update("s2", { value })).rejects.toBeInstanceOf(BadRequestException);
    roleRows = [{ id: SPARE_ID, isActive: false }];
    await expect(service.update("s2", { value: SPARE_ID })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses (409) a role id already referenced by another *_ROLE_ID setting", async () => {
    await expect(service.update("s2", { value: CLIENT_ID.toUpperCase() })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update("s3", { value: ADMIN_ID })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update("s1", { value: ` ${EMPLOYEE_ID} ` })).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("keeps the administrator role setting on a role with active holders", async () => {
    holders = 0;
    await expect(service.update("s1", { value: SPARE_ID })).rejects.toBeInstanceOf(ConflictException);
    expect(manager.count).toHaveBeenCalledWith(UserRoleEntity, expect.anything());
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("refuses to re-point EMPLOYEE_ROLE_ID when an active employee would lose the employee role", async () => {
    missingEmployees = 2;
    await expect(service.update("s2", { value: SPARE_ID })).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("stores non-role settings verbatim, locking only their own row", async () => {
    expect(await service.update("s4", { value: "ops@example.com" })).toMatchObject({ value: "ops@example.com" });
    expect(manager.find).toHaveBeenCalledTimes(1);
    expect(manager.find.mock.calls[0][1].where.code.value).toEqual(["SUPPORT_EMAIL"]);
  });
});
