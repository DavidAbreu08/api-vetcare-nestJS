import { HttpException } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { acquireClinicClosuresLock, acquireEmployeeScheduleLock } from "../reservation/employee-schedule-lock";
import { findConfirmedReservationsBetween } from "../reservation/open-reservations";
import { UsersEntity } from "../users/entities/users.entity";
import { BlockedTimeBusinessService } from "./blocked-time.business.service";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";

// The applocks need SQL Server, so they are replaced; the rest of both modules stays real (openReservationsConflict etc.).
jest.mock("../reservation/employee-schedule-lock", () => ({
  acquireClinicClosuresLock: jest.fn(),
  acquireEmployeeScheduleLock: jest.fn(),
}));
jest.mock("../reservation/open-reservations", () => ({
  ...jest.requireActual("../reservation/open-reservations"),
  findConfirmedReservationsBetween: jest.fn(),
}));

type Row = Record<string, any>;

const START = "2030-01-07T10:00:00Z";
const END = "2030-01-07T11:00:00Z";
const startAt = new Date(START);
const endAt = new Date(END);
const admin: Actor = { id: "ADM", roleIds: [], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };

/** Every lock, check and write in the order it happened (the assertions compare this sequence). */
const order: string[] = [];

const copy = (row: Row | undefined): Row | null => (row ? { ...row } : null);
const dto = (fields: Partial<CreateBlockedTimeDto>) => fields as CreateBlockedTimeDto;

/** The error a promise rejects with; fails the test when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error("expected the call to reject");
}

/** Transaction manager and repository manager share one in-memory store; the module mocks record into `order`. */
function setup() {
  const blocks = new Map<string, Row>();
  const employees = new Map<string, Row>([["E-1", { id: "E-1", userId: "U-E-1", terminationDate: null }]]);
  const users = new Map<string, Row>([["U-E-1", { id: "U-E-1", isActive: true, deletedAt: null }]]);
  const confirmed: Row[] = [];

  // Plain reads (outside the transaction), as used by getById and by the snapshot read of update.
  const readManager = {
    findOne: jest.fn(async (entity: unknown, { where }: Row) => (entity === BlockedTimeEntity ? copy(blocks.get(where.id)) : null)),
  };

  // Connection of the open transaction: withLockTimeout sends its SET LOCK_TIMEOUT batches here.
  const batch = jest.fn(async (_sql: string) => undefined);
  const manager: Row = {
    queryRunner: { isTransactionActive: true, databaseConnection: { request: () => ({ batch }) } },
    findOne: jest.fn(async (entity: unknown, options: Row) => {
      if (entity === EmployeeEntity) {
        if (options.lock) order.push("lock:employee");
        return copy(employees.get(options.where.id));
      }
      if (entity === UsersEntity) return copy(users.get(options.where.id));
      if (entity === BlockedTimeEntity) {
        if (options.lock) order.push("lock:block");
        return copy(blocks.get(options.where.id));
      }
      return null;
    }),
    create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
    save: jest.fn(async (row: Row) => {
      order.push("save");
      const saved = { ...row, id: "B-NEW" };
      blocks.set(saved.id, saved);
      return saved;
    }),
    update: jest.fn(async (_entity: unknown, { id }: Row, changes: Row) => {
      order.push("update");
      Object.assign(blocks.get(id)!, changes);
    }),
    delete: jest.fn(async (_entity: unknown, { id }: Row) => {
      order.push("delete");
      blocks.delete(id);
    }),
  };
  const dataSource = { transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)) };

  jest.mocked(acquireClinicClosuresLock).mockImplementation(async (_manager, mode) => {
    order.push(`applock:clinic:${mode}`);
  });
  jest.mocked(acquireEmployeeScheduleLock).mockImplementation(async (_manager, employeeId) => {
    order.push(`applock:employee:${employeeId}`);
  });
  jest.mocked(findConfirmedReservationsBetween).mockImplementation(async (_manager, _from, _to, employeeIds) => {
    order.push(`confirmed:${employeeIds ? employeeIds.join(",") : "all"}`);
    return confirmed.map(row => ({ ...row })) as any;
  });

  const repository = { manager: readManager, createQueryBuilder: jest.fn() };
  const service = new BlockedTimeBusinessService(new PersistenceService(), dataSource as any, repository as any);
  return { service, manager, batch, dataSource, blocks, employees, users, confirmed };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
});

describe("BlockedTimeBusinessService.create", () => {
  it("closure (no employeeId): takes the clinic closures applock Exclusive, never the employee profile or applock, and stores createdBy = the actor", async () => {
    const t = setup();
    const view = await t.service.create({ startAt: START, endAt: END, reason: "Feriado", createdBy: "EVIL" } as CreateBlockedTimeDto, admin);

    expect(acquireClinicClosuresLock).toHaveBeenCalledWith(t.manager, "Exclusive");
    expect(t.manager.findOne).not.toHaveBeenCalledWith(EmployeeEntity, expect.anything());
    expect(acquireEmployeeScheduleLock).not.toHaveBeenCalled();
    expect(t.manager.create).toHaveBeenCalledWith(BlockedTimeEntity, expect.objectContaining({ employeeId: null, createdBy: "ADM" }));
    expect(view).toMatchObject({ employeeId: null, createdBy: "ADM", reason: "Feriado" });
    expect(order).toEqual(["applock:clinic:Exclusive", "confirmed:all", "save"]);
  });

  it("individual (employeeId): locks the profile (pessimistic_write) before the employee applock, then checks and writes under it", async () => {
    const t = setup();
    await t.service.create(dto({ startAt: START, endAt: END, employeeId: "E-1" }), admin);

    expect(t.manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { id: "E-1" }, lock: { mode: "pessimistic_write" } });
    expect(acquireClinicClosuresLock).not.toHaveBeenCalled();
    expect(acquireEmployeeScheduleLock).toHaveBeenCalledWith(t.manager, "E-1");
    expect(t.manager.create).toHaveBeenCalledWith(BlockedTimeEntity, expect.objectContaining({ employeeId: "E-1", createdBy: "ADM" }));
    expect(order).toEqual(["lock:employee", "applock:employee:E-1", "confirmed:E-1", "save"]);
  });

  it("unknown employee profile: 404 before any applock, nothing written", async () => {
    const t = setup();
    const error = await rejection(t.service.create(dto({ startAt: START, endAt: END, employeeId: "E-9" }), admin));

    expect(error.getStatus()).toBe(404);
    expect(acquireEmployeeScheduleLock).not.toHaveBeenCalled();
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("inactive account: 409 EMPLOYEE_INACTIVE before the applock, nothing written", async () => {
    const t = setup();
    t.users.get("U-E-1")!.isActive = false;
    const error = await rejection(t.service.create(dto({ startAt: START, endAt: END, employeeId: "E-1" }), admin));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: "EMPLOYEE_INACTIVE" });
    expect(acquireEmployeeScheduleLock).not.toHaveBeenCalled();
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("terminated profile (termination date in the past): 409 EMPLOYEE_INACTIVE before the applock", async () => {
    const t = setup();
    t.employees.get("E-1")!.terminationDate = "2000-01-01";
    const error = await rejection(t.service.create(dto({ startAt: START, endAt: END, employeeId: "E-1" }), admin));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: "EMPLOYEE_INACTIVE" });
    expect(acquireEmployeeScheduleLock).not.toHaveBeenCalled();
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("CONFIRMED reservations of the employee that intersect the block: 409 BLOCK_OVERLAPS_CONFIRMED (count in the message), nothing written", async () => {
    const t = setup();
    t.confirmed.push(
      { id: "R-1", status: ReservationStatus.CONFIRMED, startAt, endAt, employeeId: "E-1" },
      { id: "R-2", status: ReservationStatus.CONFIRMED, startAt, endAt, employeeId: "E-1" },
    );
    const error = await rejection(t.service.create(dto({ startAt: START, endAt: END, employeeId: "E-1" }), admin));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: "BLOCK_OVERLAPS_CONFIRMED",
      message: "The block overlaps 2 confirmed reservations of the employee; cancel or reschedule them first",
    });
    expect(findConfirmedReservationsBetween).toHaveBeenCalledWith(t.manager, startAt, endAt, ["E-1"]);
    expect(t.manager.save).not.toHaveBeenCalled();
    expect(t.blocks.size).toBe(0);
  });

  it("CONFIRMED reservations of anyone that intersect a closure: 409 BLOCK_OVERLAPS_CONFIRMED, nothing written", async () => {
    const t = setup();
    t.confirmed.push({ id: "R-1", status: ReservationStatus.CONFIRMED, startAt, endAt, employeeId: "E-1" });
    const error = await rejection(t.service.create(dto({ startAt: START, endAt: END }), admin));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: "BLOCK_OVERLAPS_CONFIRMED",
      message: "The block overlaps 1 confirmed reservation; cancel or reschedule them first",
    });
    expect(findConfirmedReservationsBetween).toHaveBeenCalledWith(t.manager, startAt, endAt, undefined);
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("endAt not after startAt (equal or before): 400 INVALID_INTERVAL before any transaction", async () => {
    const t = setup();
    for (const [from, to] of [[START, START], [END, START]]) {
      const error = await rejection(t.service.create(dto({ startAt: from, endAt: to }), admin));
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({ code: "INVALID_INTERVAL" });
    }
    expect(t.dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe("BlockedTimeBusinessService.update", () => {
  it("scope in the snapshot differs from the locked row (no dto.employeeId): 409 BLOCKED_TIME_CHANGED, the scope is locked before the row", async () => {
    const t = setup();
    t.blocks.set("B-1", { id: "B-1", employeeId: "E-1", startAt, endAt, reason: null, createdBy: "ADM" });
    // Another transaction turns the block into a clinic-wide closure while this one waits for the employee applock.
    jest.mocked(acquireEmployeeScheduleLock).mockImplementationOnce(async (_manager, employeeId) => {
      order.push(`applock:employee:${employeeId}`);
      t.blocks.get("B-1")!.employeeId = null;
    });

    const error = await rejection(t.service.update("B-1", { reason: "novo" } as UpdateBlockedTimeDto));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: "BLOCKED_TIME_CHANGED" });
    expect(order).toEqual(["lock:employee", "applock:employee:E-1", "lock:block"]);
    expect(t.manager.update).not.toHaveBeenCalled();
  });
});

describe("BlockedTimeBusinessService.delete", () => {
  it("locks only the block row and deletes it: no employee profile, no applock", async () => {
    const t = setup();
    t.blocks.set("B-1", { id: "B-1", employeeId: "E-1", startAt, endAt, reason: null, createdBy: "ADM" });
    await t.service.delete("B-1");

    expect(t.manager.findOne).toHaveBeenCalledTimes(1);
    expect(t.manager.findOne).toHaveBeenCalledWith(BlockedTimeEntity, { where: { id: "B-1" }, lock: { mode: "pessimistic_write" } });
    expect(t.manager.delete).toHaveBeenCalledWith(BlockedTimeEntity, { id: "B-1" });
    expect(acquireClinicClosuresLock).not.toHaveBeenCalled();
    expect(acquireEmployeeScheduleLock).not.toHaveBeenCalled();
    expect(order).toEqual(["lock:block", "delete"]);
    expect(t.blocks.has("B-1")).toBe(false);
  });
});

describe("Blocked times under withLockTimeout", () => {
  it("sets LOCK_TIMEOUT 5000 on the transaction connection before the first query of a block, and restores -1 after the save", async () => {
    const t = setup();
    await t.service.create(dto({ startAt: START, endAt: END, employeeId: "E-1" }), admin);
    const queries = Object.values(t.manager).filter(jest.isMockFunction).flatMap(fn => fn.mock.invocationCallOrder);
    expect(t.batch.mock.calls).toEqual([["SET LOCK_TIMEOUT 5000;"], ["SET LOCK_TIMEOUT -1;"]]);
    expect(t.batch.mock.invocationCallOrder[0]).toBeLessThan(Math.min(...queries));
    expect(t.batch.mock.invocationCallOrder[1]).toBeGreaterThan(Math.max(...queries));
  });
});
