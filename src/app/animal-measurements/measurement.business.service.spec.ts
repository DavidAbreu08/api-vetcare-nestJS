import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { instanceToPlain } from "class-transformer";
import { validate } from "class-validator";
import { IsNull } from "typeorm";
import { Actor, isStaff } from "../core/authorization";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { PersistenceService } from "../core/persistence/persistence.service";
import { ClinicalVisitStatus } from "../clinical-visits/enums/clinical-visit-status.enum";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { MeasurementBusinessService } from "./measurement.business.service";
import { MeasurementController } from "./measurement.controller";
import { AnimalMeasurementEntity } from "./entities/animal-measurement.entity";
import { CreateMeasurementDto, DeleteMeasurementDto, UpdateMeasurementDto } from "./dto/create-measurement.dto";

const client: Actor = { id: "owner", roleIds: ["client-role"], isAdmin: false, isEmployee: false, isClient: true, employeeId: null };
const employee: Actor = { id: "employee", roleIds: ["employee-role"], isAdmin: false, isEmployee: true, isClient: false, employeeId: "E-1" };
const admin: Actor = { id: "admin", roleIds: ["admin-role"], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };
const LOCK = { mode: "pessimistic_write" };

/** Fluent QueryBuilder double; getOne/getMany results are configurable per test. */
function queryBuilder() {
  const q: any = {};
  for (const name of ["select", "addSelect", "where", "andWhere", "innerJoin", "leftJoin", "leftJoinAndSelect", "setParameters", "orderBy", "addOrderBy", "skip", "take"]) q[name] = jest.fn(() => q);
  q.getQuery = jest.fn(() => "SELECT ranked"); q.getParameters = jest.fn(() => ({}));
  q.getOne = jest.fn(); q.getMany = jest.fn().mockResolvedValue([]);
  return q;
}

describe("Typed measurement policies", () => {
  let repo: any, animals: any, types: any, visits: any, manager: any, q: any, business: MeasurementBusinessService;
  /** Active tutors of the animal (AnimalAccessService double). */
  let tutors: string[], access: any;
  const stored = (row: Partial<AnimalMeasurementEntity>) => Object.assign(new AnimalMeasurementEntity(), {
    id: "m", animalId: "animal", measurementTypeId: "type", measurementType: { id: "type", code: "WEIGHT", isActive: false },
    value: "12.000000", recordedBy: "author", updatedBy: null, clinicalVisitId: null, measuredAt: null, ...row,
  });
  beforeEach(() => {
    q = queryBuilder();
    manager = { findOne: jest.fn(), save: jest.fn(async (value: any) => value) };
    repo = {
      create: jest.fn(value => Object.assign(new AnimalMeasurementEntity(), value)), save: jest.fn(async value => ({ ...value, id: "new" })),
      remove: jest.fn(), createQueryBuilder: jest.fn(() => q), manager: { transaction: jest.fn(work => work(manager)) },
    };
    animals = { findOne: jest.fn().mockResolvedValue({ owner: { id: "owner" } }) };
    types = { requireActive: jest.fn().mockResolvedValue({ id: "type", code: "TEMPERATURE" }) };
    visits = { withWritableVisit: jest.fn((_visit, _animal, _actor, work) => work(manager)) };
    tutors = ["owner"];
    access = { canReadAnimal: jest.fn(async (who: Actor) => isStaff(who) || tutors.includes(who.id)) };
    business = new MeasurementBusinessService(repo, animals, new PersistenceService(), types, visits, access);
  });

  it("records signed temperature with the authenticated staff author and ignores spoofed properties", async () => {
    q.getOne.mockImplementation(async () => repo.save.mock.results[0]?.value);
    const row = await business.create({ animalId: "animal", measurementTypeId: "type", value: -1.123456, recordedBy: "spoof" } as any, employee);
    expect(row).toMatchObject({ id: "new", recordedBy: "employee", value: "-1.123456", measurementTypeId: "type" });
    expect(row!.measuredAt).toBeInstanceOf(Date);
    expect(q.andWhere).toHaveBeenCalledWith("measurement.id = :id", { id: "new" });
  });

  it("accepts custom signed types without changing the schema", async () => {
    types.requireActive.mockResolvedValue({ id: "custom", code: "CUSTOM_SCORE" });
    q.getOne.mockResolvedValue(stored({ id: "new" }));
    await business.create({ animalId: "a", measurementTypeId: "custom", value: -2 }, admin);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ value: "-2.000000", recordedBy: "admin" }));
  });

  it("gives clients read-only access: create, update and delete are forbidden, reading their animal works", async () => {
    await expect(business.create({ animalId: "animal", measurementTypeId: "type", value: 1 }, client)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.update("m", { notes: "x" }, client)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.delete("m", { reason: "x" }, client)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    q.getOne.mockResolvedValue(stored({}));
    await expect(business.get("m", client)).resolves.toMatchObject({ id: "m" });
  });

  it("hides updatedBy from clients in get and list (recordedBy and clinicalVisitStatus kept, rows not mutated)", async () => {
    const row = stored({ updatedBy: "editor", clinicalVisitId: "visit", clinicalVisit: { id: "visit", status: ClinicalVisitStatus.COMPLETED } as any });
    q.getOne.mockResolvedValue(row);
    q.getMany.mockResolvedValue([row]);
    for (const result of [await business.get("m", client), (await business.list({ skip: 0, take: 10 } as any, client))[0]]) {
      expect(result).toBeInstanceOf(AnimalMeasurementEntity);
      const plain = instanceToPlain(result);
      expect(plain).not.toHaveProperty("updatedBy");
      expect(plain).toMatchObject({ recordedBy: "author", clinicalVisitStatus: ClinicalVisitStatus.COMPLETED });
      expect(plain.clinicalVisit).toBeUndefined();
    }
    expect(row.updatedBy).toBe("editor");
  });

  it("shows updatedBy to employees and administrators in get, list, create and update", async () => {
    q.getOne.mockResolvedValue(stored({ id: "new", updatedBy: "editor" }));
    q.getMany.mockResolvedValue([stored({ updatedBy: "editor" })]);
    manager.findOne.mockResolvedValue(stored({}));
    for (const actor of [employee, admin]) {
      const results = [
        await business.get("m", actor), (await business.list({ skip: 0, take: 10 } as any, actor))[0],
        await business.create({ animalId: "animal", measurementTypeId: "type", value: 1 }, actor),
        await business.update("m", { notes: "x" }, actor),
      ];
      for (const result of results) expect(instanceToPlain(result)).toMatchObject({ recordedBy: "author", updatedBy: "editor" });
    }
  });

  it("lets employees update but not delete", async () => {
    await expect(business.delete("m", { reason: "duplicate" }, employee)).rejects.toBeInstanceOf(ForbiddenException);
    expect(q.getOne).not.toHaveBeenCalled();
    q.getOne.mockResolvedValue(stored({}));
    manager.findOne.mockResolvedValue(stored({}));
    await expect(business.update("m", { notes: "checked" }, employee)).resolves.toBeDefined();
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ notes: "checked", updatedBy: "employee" }));
  });

  it("updates under a row lock, keeps the original author and type and records the editor", async () => {
    q.getOne.mockResolvedValue(stored({}));
    manager.findOne.mockResolvedValue(stored({ notes: null }));
    await business.update("m", { notes: "reviewed", value: 13 }, employee);
    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(AnimalMeasurementEntity, { where: { id: "m", deletedAt: IsNull() }, lock: LOCK });
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ notes: "reviewed", value: "13.000000", recordedBy: "author", updatedBy: "employee", measurementTypeId: "type" }));
    // The type is immutable: an inactive historical type does not block corrections.
    expect(types.requireActive).not.toHaveBeenCalled();
    expect(visits.withWritableVisit).not.toHaveBeenCalled();
  });

  it("validates updated values against the existing type and preserves unknown legacy times", async () => {
    q.getOne.mockResolvedValue(stored({}));
    await expect(business.update("m", { value: -1 }, employee)).rejects.toBeInstanceOf(BadRequestException);
    manager.findOne.mockResolvedValue(stored({ measuredAt: null }));
    await business.update("m", { notes: "ok" }, employee);
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ measuredAt: null, value: "12.000000" }));
  });

  it("updates clinical measurements only through the visit lock (IN_PROGRESS rule), then locks the row", async () => {
    q.getOne.mockResolvedValue(stored({ clinicalVisitId: "visit" }));
    manager.findOne.mockResolvedValue(stored({ clinicalVisitId: "visit" }));
    await business.update("m", { notes: "x" }, employee);
    expect(visits.withWritableVisit).toHaveBeenCalledWith("visit", "animal", employee, expect.any(Function));
    expect(repo.manager.transaction).not.toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenCalledWith(AnimalMeasurementEntity, expect.objectContaining({ lock: LOCK }));
  });

  it("soft-deletes for administrators with reason and author, and hides deleted rows from reads", async () => {
    q.getOne.mockResolvedValue(stored({}));
    manager.findOne.mockResolvedValue(stored({}));
    await expect(business.delete("m", { reason: "  duplicate entry " }, admin)).resolves.toBeNull();
    expect(manager.findOne).toHaveBeenCalledWith(AnimalMeasurementEntity, { where: { id: "m", deletedAt: IsNull() }, lock: LOCK });
    const saved = manager.save.mock.calls[0][0];
    expect(saved).toMatchObject({ deletedBy: "admin", deleteReason: "duplicate entry", recordedBy: "author" });
    expect(saved.deletedAt).toBeInstanceOf(Date);
    expect(repo.remove).not.toHaveBeenCalled();
    // Every read excludes soft-deleted rows; a deleted row is therefore not found.
    expect(q.where).toHaveBeenCalledWith("measurement.deletedAt IS NULL");
    q.getOne.mockResolvedValue(null);
    await expect(business.get("m", admin)).rejects.toBeInstanceOf(NotFoundException);
    manager.findOne.mockResolvedValue(null);
    q.getOne.mockResolvedValue(stored({}));
    await expect(business.delete("m", { reason: "again" }, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("never deletes clinical measurements", async () => {
    q.getOne.mockResolvedValue(stored({ clinicalVisitId: "visit" }));
    await expect(business.delete("m", { reason: "x" }, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("rejects nulls, overflow, rounding, non-finite values and negative weight", async () => {
    for (const value of [null, NaN, Infinity, 1000000000, 1.0000001]) await expect(business.create({ animalId: "a", measurementTypeId: "t", value } as any, employee)).rejects.toBeInstanceOf(BadRequestException);
    types.requireActive.mockResolvedValue({ id: "t", code: "WEIGHT" });
    await expect(business.create({ animalId: "a", measurementTypeId: "t", value: -1 }, employee)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prevents access to another owner and soft-deleted animals", async () => {
    q.getOne.mockResolvedValue(stored({}));
    tutors = ["other"];
    animals.findOne.mockResolvedValueOnce({ id: "animal" }).mockResolvedValueOnce(null);
    await expect(business.get("m", client)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.get("m", client)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects future, timezone-less and null times", async () => {
    for (const measuredAt of ["2999-01-01T00:00:00Z", "2025-01-01T12:00:00", null]) await expect(business.create({ animalId: "a", measurementTypeId: "t", value: 1, measuredAt } as any, employee)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates typed HTTP inputs", async () => {
    const dto = Object.assign(new CreateMeasurementDto(), { animalId: "bad", measurementTypeId: null, value: 1.1234567, measuredAt: "2025-01-01T12:00:00" });
    expect((await validate(dto)).map(error => error.property)).toEqual(expect.arrayContaining(["animalId", "measurementTypeId", "value", "measuredAt"]));
  });

  it("rejects measurementTypeId on PATCH and a missing or blank delete reason (project ValidationPipe)", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
    const body = (metatype: any, value: unknown) => pipe.transform(value, { type: "body", metatype });
    await expect(body(UpdateMeasurementDto, { measurementTypeId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(UpdateMeasurementDto, { recordedBy: "someone" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(UpdateMeasurementDto, { notes: "ok" })).resolves.toBeInstanceOf(UpdateMeasurementDto);
    for (const value of [{}, { reason: "   " }, { reason: "x".repeat(501) }]) await expect(body(DeleteMeasurementDto, value)).rejects.toBeInstanceOf(BadRequestException);
    await expect(body(DeleteMeasurementDto, { reason: "duplicate" })).resolves.toEqual({ reason: "duplicate" });
  });

  it("exposes clinicalVisitStatus without serializing the clinical visit", () => {
    const row = stored({ clinicalVisitId: "visit", clinicalVisit: { id: "visit", status: ClinicalVisitStatus.VOIDED, clinicalNotes: "secret" } as any });
    const plain = instanceToPlain(row);
    expect(plain).toMatchObject({ clinicalVisitId: "visit", clinicalVisitStatus: ClinicalVisitStatus.VOIDED });
    expect(plain.clinicalVisit).toBeUndefined();
    expect(instanceToPlain(stored({})).clinicalVisitStatus).toBeNull();
  });

  it("lists with the clinical visit status (id and status only) and without soft-deleted rows", async () => {
    await business.list({ skip: 0, take: 10 } as any, client);
    expect(q.leftJoin).toHaveBeenCalledWith("measurement.clinicalVisit", "clinicalVisit");
    expect(q.addSelect).toHaveBeenCalledWith(["clinicalVisit.id", "clinicalVisit.status"]);
    expect(q.where).toHaveBeenCalledWith("measurement.deletedAt IS NULL");
    // Active tutors (primary or secondary), not vc_animals.owner_id.
    expect(q.andWhere).toHaveBeenCalledWith(expect.stringMatching(/^EXISTS \(SELECT 1 FROM vc_animal_owners ao_tutor WHERE ao_tutor\.animal_id = measurement\.animalId AND ao_tutor\.user_id = :tutorId AND ao_tutor\.ended_at IS NULL\)$/), { tutorId: "owner" });
    expect(q.innerJoin).not.toHaveBeenCalledWith("animal.owner", "owner");
  });

  it("ranks all types independently in one batch, preserves inactive history and ignores VOIDED visits and deleted rows", async () => {
    const rows = [{ animalId: "a", value: "12.125000", measurementType: { code: "WEIGHT", isActive: false } }, { animalId: "a", value: "30.500000", measurementType: { code: "HEIGHT" } }];
    q.getMany.mockResolvedValue(rows);
    const result = await business.latestMany(["a", "b"]);
    expect(result.get("a")).toEqual({ weight: 12.125, height: 30.5, latestMeasurements: rows });
    expect(result.get("b")).toEqual({ weight: null, height: null, latestMeasurements: [] });
    expect(q.addSelect).toHaveBeenCalledWith(expect.stringContaining("PARTITION BY measurement.animalId, measurement.measurementTypeId"), "position");
    expect(q.andWhere).toHaveBeenCalledWith(expect.stringContaining("measurement.measuredAt <= SYSUTCDATETIME()"));
    expect(q.addSelect).toHaveBeenCalledWith(["clinicalVisit.id", "clinicalVisit.status"]);
    expect(q.andWhere).toHaveBeenCalledWith("measurement.deletedAt IS NULL");
    expect(q.andWhere).toHaveBeenCalledWith("(clinicalVisit.id IS NULL OR clinicalVisit.status <> :voided)", { voided: ClinicalVisitStatus.VOIDED });
    expect(q.getMany).toHaveBeenCalledTimes(1);
  });

  it("chunks batches below SQL Server parameter limits", async () => {
    const latest = jest.spyOn(business, "latestMany");
    expect((await business.latestMany(Array.from({ length: 2101 }, (_, i) => String(i)))).size).toBe(2101);
    expect(q.getMany).toHaveBeenCalledTimes(3);
    expect(latest).toHaveBeenCalledTimes(4);
  });
});

describe("Measurement routes by system role", () => {
  const ROLE = { admin: "20000000-0000-4000-8000-000000000001", employee: "20000000-0000-4000-8000-000000000002", client: "20000000-0000-4000-8000-000000000003" };
  const settings = new SystemSettingsService({ loadAll: jest.fn().mockResolvedValue([
    { code: SystemSettingCode.ADMIN_ROLE_ID, value: ROLE.admin },
    { code: SystemSettingCode.EMPLOYEE_ROLE_ID, value: ROLE.employee },
    { code: SystemSettingCode.CLIENT_ROLE_ID, value: ROLE.client },
  ]) } as any);
  const guard = new RolesGuard(new Reflector(), settings);
  const allowed = (handler: keyof MeasurementController, role: keyof typeof ROLE) => guard.canActivate({
    getHandler: () => MeasurementController.prototype[handler],
    getClass: () => MeasurementController,
    switchToHttp: () => ({ getRequest: () => ({ user: { roleIds: [ROLE[role]] } }) }),
  } as unknown as ExecutionContext);

  it.each([
    ["list", true, true, true], ["get", true, true, true],
    ["create", true, true, false], ["update", true, true, false],
    ["delete", true, false, false],
  ] as const)("%s: admin %s, employee %s, client %s", async (handler, admin, employee, client) => {
    await expect(allowed(handler, "admin")).resolves.toBe(admin);
    await expect(allowed(handler, "employee")).resolves.toBe(employee);
    await expect(allowed(handler, "client")).resolves.toBe(client);
  });
});
