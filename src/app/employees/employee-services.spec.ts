import { BadRequestException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { In } from "typeorm";
import { Actor } from "../core/authorization";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { ReplaceEmployeeServicesDto } from "../clinic-services/dto/clinic-service.dto";
import { ClinicServiceEntity } from "../clinic-services/entities/clinic-service.entity";
import { EmployeeServiceEntity } from "../clinic-services/entities/employee-service.entity";
import { EmployeesBusinessService } from "./employees.business.service";
import { EmployeeEntity } from "./entities/employee.entity";

const admin: Actor = { id: "ADM", roleIds: [], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };
const self: Actor = { id: "U-1", roleIds: [], isAdmin: false, isEmployee: true, isClient: false, employeeId: "E-1" };
const other: Actor = { id: "U-2", roleIds: [], isAdmin: false, isEmployee: true, isClient: false, employeeId: "E-2" };
const service = (id: string, name: string, isActive = true) => ({ id, code: id.replace("-", "_"), name, description: null, durationMinutes: 30, isActive, createdAt: new Date(0), updatedAt: new Date(0) });

/** PUT/GET /employees/:id/services: qualifications replaced under the employee profile lock. */
describe("Employee service qualifications", () => {
  let manager: any, employees: any, business: EmployeesBusinessService, catalog: Record<string, any>, held: Set<string>, open: any[];
  /** Runs after the first (unlocked) read of the current qualifications: simulates a concurrent transaction. */
  let afterSnapshot: (() => void) | null;

  beforeEach(() => {
    catalog = { "S-A": service("S-A", "Vaccination"), "S-B": service("S-B", "Consultation"), "S-OLD": service("S-OLD", "Legacy", false), "S-OFF": service("S-OFF", "Off", false) };
    held = new Set(["s-a", "s-old"]);
    open = [];
    afterSnapshot = null;
    manager = {
      findOne: jest.fn(async (entity: unknown, { where }: any) => (entity === EmployeeEntity && where.id === "E-1" ? { id: "E-1", userId: "U-1" } : null)),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === ClinicServiceEntity) return options.where.id.value.filter((id: string) => catalog[id.toUpperCase()]).map((id: string) => ({ ...catalog[id.toUpperCase()] }));
        if (entity === EmployeeServiceEntity) {
          const rows = [...held].map(serviceId => ({ employeeId: "E-1", serviceId: serviceId.toUpperCase(), ...(options.relations ? { service: catalog[serviceId.toUpperCase()] } : {}) }));
          if (afterSnapshot) { const hook = afterSnapshot; afterSnapshot = null; hook(); }
          return rows;
        }
        return [];
      }),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        qb.select = qb.where = qb.andWhere = qb.orderBy = qb.addOrderBy = () => qb;
        qb.getMany = async () => open;
        return qb;
      }),
      delete: jest.fn(async (_entity: unknown, where: any) => { for (const id of where.serviceId.value) held.delete(id); }),
      insert: jest.fn(async (_entity: unknown, rows: any[]) => { for (const row of rows) held.add(row.serviceId); }),
    };
    employees = { findOne: jest.fn(async ({ where }: any) => (where.id === "E-1" ? { id: "E-1", userId: "U-1" } : null)), manager };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    business = new EmployeesBusinessService(employees, dataSource as any, new PersistenceService(), {} as any, {} as any, {} as any);
  });

  it("lets administrators and the employee itself read the qualifications (inactive services included), sorted by name", async () => {
    const list = await business.getServices("E-1", self);
    expect(list.map(entry => entry.name)).toEqual(["Legacy", "Vaccination"]);
    expect(list[0]).toMatchObject({ id: "S-OLD", isActive: false, durationMinutes: 30 });
    await expect(business.getServices("E-1", admin)).resolves.toHaveLength(2);
    await expect(business.getServices("E-1", other)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.getServices("E-9", admin)).rejects.toMatchObject({ status: 404 });
  });

  it("replaces the whole list under the profile lock, keeping held inactive services and not rewriting kept rows", async () => {
    const list = await business.replaceServices("E-1", { serviceIds: ["S-OLD", "s-b"] });
    expect(manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { id: "E-1" }, lock: { mode: "pessimistic_write" } });
    const lock = manager.findOne.mock.invocationCallOrder[manager.findOne.mock.calls.findIndex(([, options]: any[]) => !!options.lock)];
    expect(lock).toBeLessThan(manager.delete.mock.invocationCallOrder[0]);
    expect(lock).toBeLessThan(manager.insert.mock.invocationCallOrder[0]);
    expect(manager.delete).toHaveBeenCalledWith(EmployeeServiceEntity, { employeeId: "E-1", serviceId: In(["s-a"]) });
    expect(manager.insert).toHaveBeenCalledWith(EmployeeServiceEntity, [{ employeeId: "E-1", serviceId: "s-b" }]);
    expect(list.map(entry => entry.id).sort()).toEqual(["S-B", "S-OLD"]);
  });

  it("clears every qualification with an empty list, and is a no-op when nothing changes", async () => {
    await expect(business.replaceServices("E-1", { serviceIds: [] })).resolves.toEqual([]);
    manager.delete.mockClear();
    held = new Set(["s-a"]);
    await business.replaceServices("E-1", { serviceIds: ["S-A"] });
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown services (404) and new qualifications for inactive services (409 SERVICE_INACTIVE) without writing", async () => {
    await expect(business.replaceServices("E-1", { serviceIds: ["S-A", "S-NOPE"] })).rejects.toMatchObject({ status: 404, response: { message: "Service not found", code: "SERVICE_NOT_FOUND" } });
    await expect(business.replaceServices("E-1", { serviceIds: ["S-A", "S-OFF"] })).rejects.toMatchObject({
      status: 409, response: { code: "SERVICE_INACTIVE", message: "The service is inactive; new qualifications require active services" },
    });
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
    await expect(business.replaceServices("E-9", { serviceIds: [] })).rejects.toMatchObject({ status: 404 });
  });

  it("locks the services to add (shared, HOLDLOCK, by id) before the profile, and only those", async () => {
    await business.replaceServices("E-1", { serviceIds: ["S-OLD", "s-b", "s-a"] });
    const lockedRead = manager.find.mock.calls.findIndex(([entity, options]: any[]) => entity === ClinicServiceEntity && !!options.lock);
    expect(manager.find.mock.calls[lockedRead][1]).toEqual({ where: { id: In(["s-b"]) }, order: { id: "ASC" }, lock: { mode: "pessimistic_read" } });
    const profileLock = manager.findOne.mock.invocationCallOrder[manager.findOne.mock.calls.findIndex(([, options]: any[]) => !!options.lock)];
    expect(manager.find.mock.invocationCallOrder[lockedRead]).toBeLessThan(profileLock);
    expect(profileLock).toBeLessThan(manager.insert.mock.invocationCallOrder[0]);
    // Kept services are only checked for existence, never locked.
    expect(manager.find.mock.calls.filter(([entity, options]: any[]) => entity === ClinicServiceEntity && options.lock)).toHaveLength(1);
  });

  it("refuses (409 SERVICE_INACTIVE) a service deactivated concurrently before its shared lock, without locking the profile", async () => {
    // PATCH /services/:id committed the deactivation while it held UPDLOCK; the shared read sees it.
    afterSnapshot = () => { catalog["S-B"].isActive = false; };
    await expect(business.replaceServices("E-1", { serviceIds: ["S-A", "S-B"] })).rejects.toMatchObject({ status: 409, response: { code: "SERVICE_INACTIVE" } });
    expect(manager.findOne.mock.calls.some(([, options]: any[]) => !!options.lock)).toBe(false);
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it("returns 409 QUALIFICATIONS_CHANGED when, under the profile lock, a service that was not locked must now be added", async () => {
    // Another transaction removed S-A between the unlocked snapshot and the profile lock.
    afterSnapshot = () => { held.delete("s-a"); };
    await expect(business.replaceServices("E-1", { serviceIds: ["S-A", "S-B"] })).rejects.toMatchObject({
      status: 409, response: { code: "QUALIFICATIONS_CHANGED", message: "Qualifications changed; reload and retry" },
    });
    expect(manager.insert).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it("does not insert a locked service that a concurrent transaction already added", async () => {
    afterSnapshot = () => { held.add("s-b"); };
    await business.replaceServices("E-1", { serviceIds: ["S-A", "S-B", "S-OLD"] });
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it("refuses (409) to remove a qualification while the employee has open reservations of that service", async () => {
    open = [
      { id: "R-1", status: ReservationStatus.PENDING, employeeId: "E-1", serviceId: "S-A" },
      { id: "R-2", status: ReservationStatus.CONFIRMED, employeeId: "E-1", serviceId: "S-A" },
      { id: "R-3", status: ReservationStatus.CONFIRMED, employeeId: "E-1", serviceId: "S-OLD" },
      { id: "R-4", status: ReservationStatus.PENDING, employeeId: "E-1", serviceId: null },
    ];
    await expect(business.replaceServices("E-1", { serviceIds: ["S-OLD"] })).rejects.toMatchObject({
      status: 409, response: { errorMetadata: "IN_USE", message: "The employee has 2 open reservations of a service being removed; cancel or reassign them first" },
    });
    expect(manager.delete).not.toHaveBeenCalled();
    // Keeping S-A (only legacy and other-service reservations remain open) is allowed.
    await expect(business.replaceServices("E-1", { serviceIds: ["S-A", "S-OLD", "S-B"] })).resolves.toHaveLength(3);
  });

  it("validates the body: UUID list without duplicates", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    await expect(pipe.transform({ serviceIds: [id] }, { type: "body", metatype: ReplaceEmployeeServicesDto })).resolves.toMatchObject({ serviceIds: [id] });
    for (const body of [{}, { serviceIds: ["nope"] }, { serviceIds: [id, id.toUpperCase()] }, { serviceIds: id }]) {
      await expect(pipe.transform(body, { type: "body", metatype: ReplaceEmployeeServicesDto })).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
