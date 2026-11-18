import { HttpException } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { acquireEmployeeScheduleLock } from "../reservation/employee-schedule-lock";
import { findOpenReservations } from "../reservation/open-reservations";
import { ReplaceEmployeeSchedulesDto } from "./dto/employee-schedule.dto";
import { EmployeeSchedulesBusinessService } from "./employee-schedules.business.service";
import { EmployeeScheduleEntity } from "./entities/employee-schedule.entity";

// The applock needs SQL Server, so it is replaced; the rest of both modules stays real (openReservationsConflict etc.).
jest.mock("../reservation/employee-schedule-lock", () => ({
  acquireClinicClosuresLock: jest.fn(),
  acquireEmployeeScheduleLock: jest.fn(),
}));
jest.mock("../reservation/open-reservations", () => ({
  ...jest.requireActual("../reservation/open-reservations"),
  findOpenReservations: jest.fn(),
}));

type Row = Record<string, any>;

const admin: Actor = { id: "ADM", roleIds: [], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };
/** The employee's own account (U-E-1 is the user of profile E-1). */
const owner: Actor = { id: "U-E-1", roleIds: [], isAdmin: false, isEmployee: true, isClient: false, employeeId: "E-1" };
const stranger: Actor = { id: "U-OTHER", roleIds: [], isAdmin: false, isEmployee: false, isClient: true, employeeId: null };

/** Every lock, check and write in the order it happened (the assertions compare this sequence). */
const order: string[] = [];

const MONDAY_MORNING = { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", validFrom: "2030-01-01", validUntil: null };

const copy = (row: Row | undefined): Row | null => (row ? { ...row } : null);

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
  const employees = new Map<string, Row>([["E-1", { id: "E-1", userId: "U-E-1", terminationDate: null }]]);
  const schedules: Row[] = [{ id: "S-0", employeeId: "E-1", ...MONDAY_MORNING }];
  const open: Row[] = [];

  const find = jest.fn(async (entity: unknown, { where }: Row) =>
    entity === EmployeeScheduleEntity ? schedules.filter(row => row.employeeId === where.employeeId).map(row => ({ ...row })) : []);

  // Plain reads (outside the transaction), as used by list.
  const readManager = {
    findOne: jest.fn(async (entity: unknown, { where }: Row) => (entity === EmployeeEntity ? copy(employees.get(where.id)) : null)),
    find,
  };

  // Connection of the open transaction: withLockTimeout sends its SET LOCK_TIMEOUT batches here.
  const batch = jest.fn(async (_sql: string) => undefined);
  const manager: Row = {
    queryRunner: { isTransactionActive: true, databaseConnection: { request: () => ({ batch }) } },
    findOne: jest.fn(async (entity: unknown, options: Row) => {
      if (entity !== EmployeeEntity) return null;
      if (options.lock) order.push("lock:employee");
      return copy(employees.get(options.where.id));
    }),
    find,
    delete: jest.fn(async (_entity: unknown, { employeeId }: Row) => {
      order.push("delete");
      for (let i = schedules.length - 1; i >= 0; i--) if (schedules[i].employeeId === employeeId) schedules.splice(i, 1);
    }),
    insert: jest.fn(async (_entity: unknown, rows: Row[]) => {
      order.push("insert");
      rows.forEach((row, i) => schedules.push({ id: `S-NEW-${i}`, ...row }));
    }),
  };
  const dataSource = {
    manager: readManager,
    transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
  };

  jest.mocked(acquireEmployeeScheduleLock).mockImplementation(async (_manager, employeeId) => {
    order.push(`applock:employee:${employeeId}`);
  });
  jest.mocked(findOpenReservations).mockImplementation(async () => {
    order.push("open-reservations");
    return open.map(row => ({ ...row })) as any;
  });

  const service = new EmployeeSchedulesBusinessService(dataSource as any, new PersistenceService());
  return { service, manager, batch, dataSource, employees, schedules, open };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
});

describe("EmployeeSchedulesBusinessService.list", () => {
  it("refuses another non-admin user (403)", async () => {
    const t = setup();
    const error = await rejection(t.service.list("E-1", stranger));

    expect(error.getStatus()).toBe(403);
  });

  it("serves the employee's own schedule and administrators", async () => {
    const t = setup();
    const expected = [{ id: "S-0", dayOfWeek: 1, startTime: "09:00", endTime: "12:00", validFrom: "2030-01-01", validUntil: null }];

    await expect(t.service.list("E-1", owner)).resolves.toEqual(expected);
    await expect(t.service.list("E-1", admin)).resolves.toEqual(expected);
  });
});

describe("EmployeeSchedulesBusinessService.replace", () => {
  it("locks the profile (pessimistic_write) before the employee applock, then replaces the rows with delete + insert carrying employeeId", async () => {
    const t = setup();
    const dto: ReplaceEmployeeSchedulesDto = { periods: [{ dayOfWeek: 1, startTime: "08:00", endTime: "13:00", validFrom: "2030-01-01" }] };
    const rows = await t.service.replace("E-1", dto);

    expect(t.manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { id: "E-1" }, lock: { mode: "pessimistic_write" } });
    expect(acquireEmployeeScheduleLock).toHaveBeenCalledWith(t.manager, "E-1");
    expect(findOpenReservations).toHaveBeenCalledWith(t.manager, { employeeId: "E-1" });
    expect(t.manager.delete).toHaveBeenCalledWith(EmployeeScheduleEntity, { employeeId: "E-1" });
    expect(t.manager.insert).toHaveBeenCalledWith(EmployeeScheduleEntity, [
      expect.objectContaining({ employeeId: "E-1", dayOfWeek: 1, startTime: "08:00", endTime: "13:00", validFrom: "2030-01-01", validUntil: null }),
    ]);
    expect(order).toEqual(["lock:employee", "applock:employee:E-1", "open-reservations", "delete", "insert"]);
    expect(rows).toEqual([expect.objectContaining({ dayOfWeek: 1, startTime: "08:00", endTime: "13:00", validUntil: null })]);
  });

  it("unknown employee profile: 404 before the applock, nothing deleted or inserted", async () => {
    const t = setup();
    const dto: ReplaceEmployeeSchedulesDto = { periods: [{ dayOfWeek: 1, startTime: "08:00", endTime: "13:00", validFrom: "2030-01-01" }] };
    const error = await rejection(t.service.replace("E-9", dto));

    expect(error.getStatus()).toBe(404);
    expect(acquireEmployeeScheduleLock).not.toHaveBeenCalled();
    expect(t.manager.delete).not.toHaveBeenCalled();
    expect(t.manager.insert).not.toHaveBeenCalled();
  });

  it("CONFIRMED reservation that fits the current schedule but not the new one: 409 SCHEDULE_STRANDS_CONFIRMED, nothing deleted", async () => {
    const t = setup();
    // Monday 2030-01-07 10:00-10:30 UTC (Lisbon is UTC in January): inside 09:00-12:00 now, outside 14:00-18:00 next.
    t.open.push(
      { id: "R-1", status: ReservationStatus.CONFIRMED, startAt: new Date("2030-01-07T10:00:00Z"), endAt: new Date("2030-01-07T10:30:00Z"), employeeId: "E-1" },
      // A PENDING reservation in the same spot is not counted: the message must still say 1 confirmed reservation.
      { id: "R-2", status: ReservationStatus.PENDING, startAt: new Date("2030-01-07T10:30:00Z"), endAt: new Date("2030-01-07T11:00:00Z"), employeeId: "E-1" },
    );
    const dto: ReplaceEmployeeSchedulesDto = { periods: [{ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", validFrom: "2030-01-01" }] };
    const error = await rejection(t.service.replace("E-1", dto));

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: "SCHEDULE_STRANDS_CONFIRMED",
      message: "The new schedule would leave 1 confirmed reservation outside the employee's working hours; cancel or reschedule them first",
    });
    expect(order).toEqual(["lock:employee", "applock:employee:E-1", "open-reservations"]);
    expect(t.manager.delete).not.toHaveBeenCalled();
    expect(t.manager.insert).not.toHaveBeenCalled();
    expect(t.schedules).toEqual([{ id: "S-0", employeeId: "E-1", ...MONDAY_MORNING }]);
  });
});

describe("Schedule replacement under withLockTimeout", () => {
  it("sets LOCK_TIMEOUT 5000 on the transaction connection before the profile lock, and restores -1 after the insert", async () => {
    const t = setup();
    const dto: ReplaceEmployeeSchedulesDto = { periods: [{ dayOfWeek: 1, startTime: "08:00", endTime: "13:00", validFrom: "2030-01-01" }] };
    await t.service.replace("E-1", dto);
    const profileLock = t.manager.findOne.mock.invocationCallOrder[t.manager.findOne.mock.calls.findIndex(([, options]: any[]) => options.lock)];
    expect(t.batch.mock.calls).toEqual([["SET LOCK_TIMEOUT 5000;"], ["SET LOCK_TIMEOUT -1;"]]);
    expect(t.batch.mock.invocationCallOrder[0]).toBeLessThan(profileLock);
    expect(t.batch.mock.invocationCallOrder[1]).toBeGreaterThan(t.manager.insert.mock.invocationCallOrder[0]);
  });
});
