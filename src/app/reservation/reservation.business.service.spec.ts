import { BadRequestException, ConflictException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { ClinicalVisitStatus } from "../clinical-visits/enums/clinical-visit-status.enum";
import { Actor, sameId } from "../core/authorization";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { toDbUtc } from "../core/persistence/utc-datetime";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { UsersEntity } from "../users/entities/users.entity";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { ReservationEntity } from "./entities/reservation.entity";
import { ClinicServiceEntity } from "../clinic-services/entities/clinic-service.entity";
import { EmployeeServiceEntity } from "../clinic-services/entities/employee-service.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { serializeHistoryEvent } from "../reservation-history/reservation-history.service";
import { assertTransition } from "./reservation-policy";
import { ReservationBusinessService } from "./reservation.business.service";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";

// Monday 2030-01-07, 10:00-10:30 in Lisbon (UTC in winter).
const START = "2030-01-07T10:00:00Z";
const END = "2030-01-07T10:30:00Z";
const startAt = new Date(START);
const endAt = new Date(END);
const MINUTE = 60_000;

const actor = (flags: Partial<Actor>): Actor => ({ id: "X", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
// Ana: veterinarian (active employee profile) and client with her own cat.
const ana = actor({ id: "ANA", isEmployee: true, isClient: true, employeeId: "E-ANA" });
const admin = actor({ id: "ADM", isAdmin: true });
const bob = actor({ id: "BOB", isClient: true });
const bookable = (id: string) => ({ id, userId: `U-${id}`, isAvailableForBookings: true, terminationDate: null, user: { id: `U-${id}`, isActive: true, deletedAt: null } });

function setup() {
  const accounts: Record<string, any> = {
    ANA: { id: "ANA", name: "Ana", email: "ana@x.pt", isActive: true },
    BOB: { id: "BOB", name: "Bob", email: "bob@x.pt", isActive: true },
    ADM: { id: "ADM", name: "Admin", email: "adm@x.pt", isActive: true },
  };
  const pets: Record<string, any> = { CAT: { id: "CAT", owner: { id: "ana" } }, DOG: { id: "DOG", owner: { id: "BOB" } } };
  const reservations = new Map<string, any>();
  const employees = new Map<string, any>([["E-1", bookable("E-1")], ["E-2", bookable("E-2")]]);
  const visits: any[] = [];
  const queryBuilders: any[] = [];
  const state = { overlaps: 0 };
  // Clinic services (30 min by default) and qualifications "employeeId:serviceId" (every employee qualified for SVC).
  const services: Record<string, any> = { SVC: { id: "SVC", code: "CONSULTATION", name: "Consultation", durationMinutes: 30, isActive: true } };
  const qualifications = new Set<string>(["E-1:SVC", "E-2:SVC", "E-ANA:SVC"]);

  const manager: any = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn(async () => [{ result: 0 }]),
    findOne: jest.fn(async (entity: unknown, { where }: any) => {
      if (entity === ReservationEntity) return reservations.has(where.id) ? { ...reservations.get(where.id) } : null;
      if (entity === EmployeeEntity) {
        const employee = employees.get(where.id);
        return employee ? { ...employee, user: undefined } : null;
      }
      // findOne excludes soft-deleted rows.
      if (entity === AnimalEntity) {
        const pet = pets[where.id];
        if (!pet || pet.deletedAt || (where.owner && !sameId(pet.owner?.id, where.owner.id))) return null;
        return { ...pet };
      }
      if (entity === UsersEntity) {
        const account = accounts[where.id] ?? [...employees.values()].find(employee => employee.userId === where.id)?.user;
        return account && !account.deletedAt ? { ...account } : null;
      }
      if (entity === ClinicServiceEntity) return services[where.id] ? { ...services[where.id] } : null;
      return null;
    }),
    find: jest.fn(async () => []),
    create: jest.fn((_entity: unknown, row: any) => ({ ...row })),
    save: jest.fn(async (row: any) => {
      const saved = { id: "R-NEW", ...row };
      reservations.set(saved.id, saved);
      return saved;
    }),
    update: jest.fn(async (_entity: unknown, { id }: any, changes: any) => Object.assign(reservations.get(id), changes)),
    count: jest.fn(async (entity: unknown, { where }: any) => entity === EmployeeServiceEntity
      ? Number(qualifications.has(`${where.employeeId}:${where.serviceId}`))
      : visits.filter(visit => sameId(visit.reservationId, where.reservationId)
      && (!where.status || where.status.value.includes(visit.status))).length),
    createQueryBuilder: jest.fn(() => {
      const qb: any = { params: {} };
      qb.where = jest.fn((_sql: string, params?: object) => (Object.assign(qb.params, params), qb));
      qb.andWhere = qb.where;
      qb.getCount = jest.fn(async () => state.overlaps);
      queryBuilders.push(qb);
      return qb;
    }),
  };
  const dataSource = { transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)) };
  const email = {
    sendReservationCreatedEmail: jest.fn(async () => undefined), sendReservationConfirmedEmail: jest.fn(async () => undefined),
    sendReservationRescheduledEmail: jest.fn(async () => undefined), sendReservationCancelledEmail: jest.fn(async () => undefined),
  };
  const settings = { getNonNegativeInteger: jest.fn(async (_code: SystemSettingCode) => 15) };
  const membership = { hasSystemRole: jest.fn(async () => true) };
  const history = { record: jest.fn(async () => undefined), list: jest.fn() };
  const reservationRepository = { findOne: jest.fn(async ({ where }: any) => {
    const row = reservations.get(where.id);
    return row ? { ...row, client: accounts.ANA, service: row.serviceId ? services[row.serviceId] ?? null : null } : null;
  }) };
  const usersRepository = { findOne: jest.fn(async ({ where }: any) => accounts[where.id] ?? null) };
  const animalRepository = { findOne: jest.fn(async ({ where }: any) => pets[where.id] ?? null) };

  /** Tutorship double: the pet's owner is its primary tutor; `secondary` adds secondary tutors per animal. */
  const secondary: Record<string, string[]> = {};
  const access = {
    isActiveTutor: jest.fn(async (animalId: string, userId: string) => sameId(pets[animalId]?.owner?.id, userId) || (secondary[animalId] ?? []).some(id => sameId(id, userId))),
  };
  const business = new ReservationBusinessService(new PersistenceService(), dataSource as any, email as any, settings as any,
    membership as any, history as any, reservationRepository as any, usersRepository as any, animalRepository as any, access as any);
  const addReservation = (row: Partial<ReservationEntity> & { id: string }) => {
    reservations.set(row.id, {
      animalId: "CAT", clientId: "ANA", serviceId: "SVC", employeeId: null, startAt, endAt, status: ReservationStatus.PENDING,
      confirmedAt: null, cancelledAt: null, ...row,
    });
  };
  const actions = () => history.record.mock.calls.map((call: any[]) => call[1].action);
  return { business, manager, history, settings, membership, reservations, visits, queryBuilders, state, addReservation, actions, accounts, pets, employees, access, secondary, services, qualifications };
}

afterEach(() => jest.restoreAllMocks());

describe("ReservationBusinessService.create", () => {
  const dto = { animalId: "CAT", serviceId: "SVC", startAt: START, endAt: END, reason: "check-up" } as any;

  it("creates a PENDING reservation with a CREATED event", async () => {
    const t = setup();
    await t.business.create(dto, ana);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({
      clientId: "ANA", employeeId: null, status: ReservationStatus.PENDING, startAt, endAt, confirmedAt: null,
    }));
    expect(t.actions()).toEqual([ReservationHistoryAction.CREATED]);
  });

  it("books an employee's own animal through the client path, even with ownerId equal to herself", async () => {
    const t = setup();
    await t.business.create({ ...dto, ownerId: "ana" }, ana);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({ clientId: "ANA", employeeId: null }));
    expect(t.membership.hasSystemRole).not.toHaveBeenCalled();
  });

  it("lets an employee book for another client, still PENDING and without assignment", async () => {
    const t = setup();
    await t.business.create({ ...dto, animalId: "DOG", ownerId: "BOB" }, ana);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({
      clientId: "BOB", employeeId: null, status: ReservationStatus.PENDING,
    }));
  });

  it("gives the CLIENT role nothing extra and requires it for a personal booking", async () => {
    const t = setup();
    await expect(t.business.create({ ...dto, animalId: "DOG", ownerId: "BOB" }, actor({ id: "ANA", isClient: true }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.business.create(dto, { ...ana, isClient: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("rejects pre-assignment of an employee by a non-admin (403)", async () => {
    const t = setup();
    await expect(t.business.create({ ...dto, animalId: "DOG", ownerId: "BOB", employeeId: "E-1" }, ana)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.business.create({ ...dto, employeeId: "E-1" }, ana)).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("lets an admin pre-assign: still PENDING, CREATED + EMPLOYEE_ASSIGNED, under the applock", async () => {
    const t = setup();
    await t.business.create({ ...dto, animalId: "DOG", ownerId: "BOB", employeeId: "E-1" }, admin);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({ employeeId: "E-1", status: ReservationStatus.PENDING }));
    expect(t.actions()).toEqual([ReservationHistoryAction.CREATED, ReservationHistoryAction.EMPLOYEE_ASSIGNED]);
    expect(t.manager.query).toHaveBeenCalledWith(expect.stringContaining("sp_getapplock"), ["vc_reservations:employee:e-1", 5000]);
  });

  it("rejects instants without offset (400)", async () => {
    const t = setup();
    await expect(t.business.create({ ...dto, startAt: "2030-01-07T10:00:00" }, ana)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ReservationBusinessService.assignEmployee", () => {
  it("assigns on PENDING (EMPLOYEE_ASSIGNED) and records a change as EMPLOYEE_CHANGED", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await t.business.assignEmployee("R-1", { employeeId: "E-1" }, admin);
    await t.business.assignEmployee("R-1", { employeeId: "E-2" }, admin);
    expect(t.actions()).toEqual([ReservationHistoryAction.EMPLOYEE_ASSIGNED, ReservationHistoryAction.EMPLOYEE_CHANGED]);
    expect(t.reservations.get("R-1")).toMatchObject({ employeeId: "E-2", status: ReservationStatus.PENDING });
  });

  it("refuses assignment outside PENDING (409)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() });
    await expect(t.business.assignEmployee("R-1", { employeeId: "E-2" }, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(t.history.record).not.toHaveBeenCalled();
  });
});

describe("ReservationBusinessService.confirm", () => {
  it("requires an assigned employee (409 EMPLOYEE_REQUIRED)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await expect(t.business.confirm("R-1", {}, admin)).rejects.toMatchObject({ response: { code: "EMPLOYEE_REQUIRED" } });
  });

  it("takes the applock with the transaction manager before counting overlaps, widened by the buffer", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", employeeId: "E-1" });
    await t.business.confirm("R-1", {}, admin);
    const qb = t.queryBuilders[0];
    expect(t.manager.query.mock.invocationCallOrder[0]).toBeLessThan(qb.getCount.mock.invocationCallOrder[0]);
    expect(t.settings.getNonNegativeInteger).toHaveBeenCalledWith(SystemSettingCode.RESERVATION_BUFFER_MINUTES);
    expect(qb.params).toMatchObject({
      employeeId: "E-1", confirmed: ReservationStatus.CONFIRMED, excludeId: "R-1",
      latestStart: toDbUtc(new Date(endAt.getTime() + 15 * MINUTE)), earliestEnd: toDbUtc(new Date(startAt.getTime() - 15 * MINUTE)),
    });
    expect(t.reservations.get("R-1")).toMatchObject({ status: ReservationStatus.CONFIRMED, confirmedAt: expect.any(Date) });
    expect(t.actions()).toEqual([ReservationHistoryAction.CONFIRMED]);
  });

  it("rejects an overlap with another confirmed reservation (409) without writing", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", employeeId: "E-1" });
    t.state.overlaps = 1;
    await expect(t.business.confirm("R-1", {}, admin)).rejects.toMatchObject({ response: { code: "EMPLOYEE_UNAVAILABLE" } });
    expect(t.manager.update).not.toHaveBeenCalled();
  });
});

describe("ReservationBusinessService.reschedule", () => {
  const dto = { startAt: "2030-01-08T10:00:00Z", endAt: "2030-01-08T10:30:00Z", reason: "client asked" };

  it("returns a CONFIRMED reservation to PENDING, clears confirmedAt and records RESCHEDULED", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() });
    await t.business.reschedule("R-1", dto, admin);
    expect(t.reservations.get("R-1")).toMatchObject({ status: ReservationStatus.PENDING, confirmedAt: null, startAt: new Date(dto.startAt) });
    const [, event] = t.history.record.mock.calls[0] as any[];
    expect(event).toMatchObject({ action: ReservationHistoryAction.RESCHEDULED, reason: "client asked", oldData: { status: "CONFIRMED", startAt: startAt.toISOString() } });
  });

  it("is blocked by an active visit but not by a VOIDED one", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() });
    t.visits.push({ reservationId: "R-1", status: ClinicalVisitStatus.IN_PROGRESS });
    await expect(t.business.reschedule("R-1", dto, admin)).rejects.toBeInstanceOf(ConflictException);
    t.visits[0].status = ClinicalVisitStatus.VOIDED;
    await expect(t.business.reschedule("R-1", dto, admin)).resolves.toBeDefined();
  });
});

describe("Reservation parties re-checked inside the transaction (B1, A3)", () => {
  const confirmable = { id: "R-1", employeeId: "E-1" };
  const dto = { startAt: "2030-01-08T10:00:00Z", endAt: "2030-01-08T10:30:00Z" };
  const lockCall = (t: ReturnType<typeof setup>, entity: unknown) =>
    t.manager.findOne.mock.calls.findIndex(([target, options]: any[]) => target === entity && options.lock?.mode === "pessimistic_write");

  it("confirms with the locks in the documented order: reservation -> animal -> client -> employee profile -> applock", async () => {
    const t = setup();
    t.addReservation(confirmable);
    await t.business.confirm("R-1", {}, admin);
    const order = [ReservationEntity, AnimalEntity, UsersEntity, EmployeeEntity]
      .map(entity => t.manager.findOne.mock.invocationCallOrder[lockCall(t, entity)]);
    expect(order.every(value => value !== undefined)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order[3]).toBeLessThan(t.manager.query.mock.invocationCallOrder[0]);
    expect(t.manager.findOne).toHaveBeenCalledWith(AnimalEntity, { where: { id: "CAT" }, lock: { mode: "pessimistic_write" } });
    expect(t.manager.findOne).toHaveBeenCalledWith(UsersEntity, { where: { id: "ANA" }, lock: { mode: "pessimistic_write" } });
    // The employee profile is locked without relations; its account is read in a later statement.
    expect(t.manager.findOne).toHaveBeenCalledWith(EmployeeEntity, { where: { id: "E-1" }, lock: { mode: "pessimistic_write" } });
    expect(t.manager.findOne).toHaveBeenCalledWith(UsersEntity, { where: { id: "U-E-1" } });
  });

  it("refuses to confirm when the animal was soft-deleted (409 ANIMAL_UNAVAILABLE) without writing", async () => {
    const t = setup();
    t.addReservation(confirmable);
    t.pets.CAT.deletedAt = new Date();
    await expect(t.business.confirm("R-1", {}, admin)).rejects.toMatchObject({ status: 409, response: { code: "ANIMAL_UNAVAILABLE" } });
    expect(t.manager.update).not.toHaveBeenCalled();
    expect(t.manager.query).not.toHaveBeenCalled();
  });

  it("refuses to confirm or reschedule for an inactive or deleted client (409 CLIENT_INACTIVE)", async () => {
    const t = setup();
    t.addReservation(confirmable);
    t.accounts.ANA.isActive = false;
    await expect(t.business.confirm("R-1", {}, admin)).rejects.toMatchObject({ response: { code: "CLIENT_INACTIVE" } });
    await expect(t.business.reschedule("R-1", dto, admin)).rejects.toMatchObject({ response: { code: "CLIENT_INACTIVE" } });
    t.accounts.ANA.isActive = true;
    t.accounts.ANA.deletedAt = new Date();
    await expect(t.business.reschedule("R-1", dto, admin)).rejects.toMatchObject({ response: { code: "CLIENT_INACTIVE" } });
    expect(t.manager.update).not.toHaveBeenCalled();
  });

  it("refuses to reschedule when the animal was soft-deleted, and creation re-checks both parties", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() });
    t.pets.CAT.deletedAt = new Date();
    await expect(t.business.reschedule("R-1", dto, admin)).rejects.toMatchObject({ response: { code: "ANIMAL_UNAVAILABLE" } });
    // Deactivated between the pre-check and the transaction.
    t.pets.CAT.deletedAt = null;
    const create = t.business.create({ animalId: "CAT", serviceId: "SVC", startAt: START, endAt: END } as any, ana);
    t.accounts.ANA.isActive = false;
    await expect(create).rejects.toMatchObject({ response: { code: "CLIENT_INACTIVE" } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("re-checks on creation, after locking animal and client, that the client is still an active tutor (409)", async () => {
    const t = setup();
    // Tutorship passes the pre-check; the animal is transferred (committed) just before the transaction locks it.
    const findOne = t.manager.findOne.getMockImplementation();
    t.manager.findOne.mockImplementation(async (entity: unknown, options: any) => {
      if (entity === AnimalEntity && options.lock) t.pets.CAT.owner = { id: "BOB" };
      return findOne(entity, options);
    });
    await expect(t.business.create({ animalId: "CAT", serviceId: "SVC", startAt: START, endAt: END } as any, ana)).rejects.toMatchObject({ status: 409, response: { code: "ANIMAL_OWNER_MISMATCH" } });
    expect(t.manager.save).not.toHaveBeenCalled();
    // The in-transaction check reads vc_animal_owners through the transaction manager, after both locks.
    const inTransaction = t.access.isActiveTutor.mock.calls.findIndex((call: any[]) => call[2] === t.manager);
    expect(t.access.isActiveTutor.mock.calls[inTransaction]).toEqual(["CAT", "ANA", t.manager]);
    const lockOrder = (entity: unknown) => t.manager.findOne.mock.invocationCallOrder[lockCall(t, entity)];
    expect(lockOrder(AnimalEntity)).toBeLessThan(lockOrder(UsersEntity));
    expect(lockOrder(UsersEntity)).toBeLessThan(t.access.isActiveTutor.mock.invocationCallOrder[inTransaction]);
    expect(t.manager.findOne).not.toHaveBeenCalledWith(AnimalEntity, expect.objectContaining({ where: expect.objectContaining({ owner: expect.anything() }) }));
  });

  it("sees an employee account deactivated by the transaction that held the profile lock (400)", async () => {
    const t = setup();
    t.addReservation(confirmable);
    t.employees.get("E-1").user.isActive = false;
    await expect(t.business.confirm("R-1", {}, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.manager.update).not.toHaveBeenCalled();
  });
});

describe("ReservationBusinessService.cancel", () => {
  it("cancels for the client before the start (cancelledAt + CANCELLED)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await t.business.cancel("R-1", {}, ana);
    expect(t.reservations.get("R-1")).toMatchObject({ status: ReservationStatus.CANCELLED, cancelledAt: expect.any(Date) });
    expect(t.actions()).toEqual([ReservationHistoryAction.CANCELLED]);
  });

  it("is blocked by an IN_PROGRESS or COMPLETED visit", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() });
    t.visits.push({ reservationId: "R-1", status: ClinicalVisitStatus.COMPLETED });
    await expect(t.business.cancel("R-1", {}, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a non-admin after the start (409) but lets an admin cancel", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    jest.spyOn(Date, "now").mockReturnValue(startAt.getTime() + MINUTE);
    await expect(t.business.cancel("R-1", {}, ana)).rejects.toMatchObject({ response: { code: "CANCEL_AFTER_START" } });
    await t.business.cancel("R-1", {}, admin);
    expect(t.reservations.get("R-1").status).toBe(ReservationStatus.CANCELLED);
  });

  it("refuses third parties (403)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await expect(t.business.cancel("R-1", {}, bob)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("ReservationBusinessService.markNoShow", () => {
  const confirmed = { id: "R-1", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() };

  it("is rejected before start + tolerance and accepted after it", async () => {
    const t = setup();
    t.addReservation(confirmed);
    jest.spyOn(Date, "now").mockReturnValue(startAt.getTime() + 14 * MINUTE);
    await expect(t.business.markNoShow("R-1", {}, admin)).rejects.toMatchObject({ response: { code: "NO_SHOW_TOO_EARLY" } });
    expect(t.settings.getNonNegativeInteger).toHaveBeenCalledWith(SystemSettingCode.RESERVATION_NO_SHOW_TOLERANCE_MINUTES);
    jest.spyOn(Date, "now").mockReturnValue(startAt.getTime() + 16 * MINUTE);
    await t.business.markNoShow("R-1", {}, admin);
    expect(t.reservations.get("R-1").status).toBe(ReservationStatus.NO_SHOW);
    expect(t.actions()).toEqual([ReservationHistoryAction.NO_SHOW]);
  });

  it("ignores a VOIDED visit", async () => {
    const t = setup();
    t.addReservation(confirmed);
    t.visits.push({ reservationId: "R-1", status: ClinicalVisitStatus.VOIDED });
    jest.spyOn(Date, "now").mockReturnValue(startAt.getTime() + 16 * MINUTE);
    await t.business.markNoShow("R-1", {}, admin);
    expect(t.reservations.get("R-1").status).toBe(ReservationStatus.NO_SHOW);
  });
});

describe("Reservation state machine and history projection", () => {
  it("allows only the documented transitions", () => {
    expect(() => assertTransition(ReservationStatus.PENDING, ReservationStatus.CONFIRMED)).not.toThrow();
    expect(() => assertTransition(ReservationStatus.CONFIRMED, ReservationStatus.NO_SHOW)).not.toThrow();
    for (const [from, to] of [
      [ReservationStatus.PENDING, ReservationStatus.COMPLETED], [ReservationStatus.PENDING, ReservationStatus.NO_SHOW],
      [ReservationStatus.CANCELLED, ReservationStatus.CONFIRMED], [ReservationStatus.COMPLETED, ReservationStatus.CANCELLED],
    ]) {
      expect(() => assertTransition(from, to)).toThrow(ConflictException);
    }
  });

  it("hides changedBy of other users from non-admins", () => {
    const row = { id: "H-1", reservationId: "R-1", action: "CONFIRMED", changedBy: "ADM", oldData: null, newData: '{"status":"CONFIRMED"}', reason: null, createdAt: new Date(0) } as any;
    expect(serializeHistoryEvent(row, ana)).toMatchObject({ changedBy: null, changedBySelf: false, newData: { status: "CONFIRMED" } });
    expect(serializeHistoryEvent(row, admin)).toMatchObject({ changedBy: "ADM", changedBySelf: true });
    expect(serializeHistoryEvent({ ...row, changedBy: "ana" }, ana)).toMatchObject({ changedBy: "ana", changedBySelf: true });
  });

  it("hides other accounts' client ids in CLIENT_CHANGED snapshots from non-admins, keeping their own", () => {
    const row = {
      id: "H-2", reservationId: "R-1", action: ReservationHistoryAction.CLIENT_CHANGED, changedBy: "ADM",
      oldData: '{"clientId":"BOB"}', newData: '{"clientId":"ana"}', reason: null, createdAt: new Date(0),
    } as any;
    expect(serializeHistoryEvent(row, ana)).toMatchObject({ changedBy: null, oldData: { clientId: null }, newData: { clientId: "ana" } });
    expect(serializeHistoryEvent(row, admin)).toMatchObject({ oldData: { clientId: "BOB" }, newData: { clientId: "ana" } });
    // Other actions keep their snapshots untouched.
    const other = { ...row, action: ReservationHistoryAction.EMPLOYEE_CHANGED, oldData: '{"employeeId":"E-1"}', newData: null };
    expect(serializeHistoryEvent(other, ana)).toMatchObject({ oldData: { employeeId: "E-1" }, newData: null });
  });
});

describe("Reservations of animals with several tutors (decisions 11, 13)", () => {
  const dto = { animalId: "CAT", serviceId: "SVC", startAt: START, endAt: END } as any;
  const carla = actor({ id: "CARLA", isClient: true });

  it("lets a secondary tutor book as the responsible client, re-checking the tutorship under the locks", async () => {
    const t = setup();
    t.accounts.CARLA = { id: "CARLA", name: "Carla", email: "carla@x.pt", isActive: true };
    t.secondary.CAT = ["CARLA"];
    await t.business.create(dto, carla);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({ animalId: "CAT", clientId: "CARLA" }));
    expect(t.access.isActiveTutor).toHaveBeenCalledWith("CAT", "CARLA", t.manager);
    // Staff booking for a secondary tutor of the animal.
    await t.business.create({ ...dto, ownerId: "CARLA" }, ana);
    expect(t.manager.create).toHaveBeenLastCalledWith(ReservationEntity, expect.objectContaining({ clientId: "CARLA" }));
  });

  it("refuses a client who is not (or no longer) a tutor of the animal (400), and staff booking for one", async () => {
    const t = setup();
    t.accounts.CARLA = { id: "CARLA", name: "Carla", email: "carla@x.pt", isActive: true };
    await expect(t.business.create(dto, carla)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.business.create({ ...dto, ownerId: "CARLA" }, ana)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("lets every active tutor read the animal's reservations and their history, but only the client or an admin cancel", async () => {
    const t = setup();
    t.secondary.CAT = ["CARLA"];
    t.addReservation({ id: "R-1" });
    await expect(t.business.getById("R-1", carla)).resolves.toMatchObject({ id: "R-1", clientId: "ANA" });
    await expect(t.business.cancel("R-1", {}, carla)).rejects.toBeInstanceOf(ForbiddenException);
    // A former tutor loses access to reservations they are not the client of.
    t.secondary.CAT = [];
    await expect(t.business.getById("R-1", carla)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps a reservation visible to its client after they stop being a tutor (they remain responsible for it)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", animalId: "DOG", clientId: "ANA" });
    expect(await t.access.isActiveTutor("DOG", "ANA")).toBe(false);
    await expect(t.business.getById("R-1", ana)).resolves.toMatchObject({ id: "R-1" });
    expect(await t.business.canRead(bob, { clientId: "ANA", employeeId: null, animalId: "DOG" })).toBe(true);
    expect(await t.business.canRead(actor({ id: "EVE", isClient: true }), { clientId: "ANA", employeeId: null, animalId: "DOG" })).toBe(false);
  });
});

describe("Reservation authorship (created_by, decisions 15 and 16)", () => {
  const dto = { animalId: "DOG", serviceId: "SVC", startAt: START, endAt: END } as any;
  const createdEvent = (t: ReturnType<typeof setup>) => (t.history.record.mock.calls as any[]).find(call => call[1].action === ReservationHistoryAction.CREATED)[1];

  it("a client booking their own animal is both client and author; CREATED.changedBy is the same actor", async () => {
    const t = setup();
    const view: any = await t.business.create(dto, bob);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({ clientId: "BOB", createdBy: "BOB" }));
    expect(createdEvent(t)).toMatchObject({ changedBy: "BOB" });
    // The history snapshot does not duplicate the author.
    expect(createdEvent(t).newData).not.toHaveProperty("createdBy");
    expect(view).toMatchObject({ createdBy: "BOB", createdBySelf: true });
  });

  it("staff and administrators booking for another client are the author, not the client", async () => {
    const t = setup();
    await t.business.create({ ...dto, ownerId: "BOB" }, ana);
    expect(t.manager.create).toHaveBeenLastCalledWith(ReservationEntity, expect.objectContaining({ clientId: "BOB", createdBy: "ANA" }));
    expect(createdEvent(t)).toMatchObject({ changedBy: "ANA" });
    await t.business.create({ ...dto, ownerId: "BOB", employeeId: "E-1" }, admin);
    expect(t.manager.create).toHaveBeenLastCalledWith(ReservationEntity, expect.objectContaining({ clientId: "BOB", createdBy: "ADM" }));
  });

  it("projects the author: admin sees it, the client sees createdBySelf=false and no employee id, the author grants no access", async () => {
    const t = setup();
    const created: any = await t.business.create({ ...dto, ownerId: "BOB" }, ana);
    expect(created).toMatchObject({ clientId: "BOB", createdBy: "ANA", createdBySelf: true });
    await expect(t.business.getById("R-NEW", bob)).resolves.toMatchObject({ clientId: "BOB", createdBy: null, createdBySelf: false });
    await expect(t.business.getById("R-NEW", admin)).resolves.toMatchObject({ createdBy: "ANA", createdBySelf: false });
    // Decision 16: the employee who booked for the client only sees it once it is assigned to her.
    await expect(t.business.getById("R-NEW", ana)).rejects.toBeInstanceOf(ForbiddenException);
    t.reservations.get("R-NEW").employeeId = "E-ANA";
    await expect(t.business.getById("R-NEW", ana)).resolves.toMatchObject({ createdBy: "ANA", createdBySelf: true });
  });

  it("assign, confirm, reschedule, no-show and cancel never write createdBy", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", createdBy: "ANA" });
    t.addReservation({ id: "R-2", createdBy: "ANA" });
    await t.business.assignEmployee("R-1", { employeeId: "E-1" }, admin);
    await t.business.confirm("R-1", {}, admin);
    await t.business.reschedule("R-1", { startAt: "2030-01-08T10:00:00Z", endAt: "2030-01-08T10:30:00Z" }, admin);
    await t.business.confirm("R-1", {}, admin);
    jest.spyOn(Date, "now").mockReturnValue(new Date("2030-01-08T10:16:00Z").getTime());
    await t.business.markNoShow("R-1", {}, admin);
    await t.business.cancel("R-2", {}, admin);
    expect(t.reservations.get("R-1")).toMatchObject({ status: ReservationStatus.NO_SHOW, createdBy: "ANA" });
    expect(t.reservations.get("R-2")).toMatchObject({ status: ReservationStatus.CANCELLED, createdBy: "ANA" });
    expect(t.manager.update.mock.calls.length).toBeGreaterThanOrEqual(6);
    for (const [, , changes] of t.manager.update.mock.calls as any[]) expect(changes).not.toHaveProperty("createdBy");
  });

  it("filters by createdBy only inside the caller's scope; non-admins only by their own id", async () => {
    const t = setup();
    // Another account's id: empty page without querying (the repository double has no query builder).
    await expect(t.business.list({ skip: 0, take: 10, createdBy: "ADM" } as any, bob)).resolves.toEqual([]);
  });

  it("rejects createdBy in the POST body (400, whitelist) and validates the createdBy filter", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const body = { animalId: id, serviceId: id, startAt: START, endAt: END };
    await expect(pipe.transform(body, { type: "body", metatype: CreateReservationDto })).resolves.toBeInstanceOf(CreateReservationDto);
    await expect(pipe.transform({ ...body, createdBy: id }, { type: "body", metatype: CreateReservationDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ createdBy: id }, { type: "query", metatype: ListReservationsQueryDto })).resolves.toMatchObject({ createdBy: id });
    await expect(pipe.transform({ createdBy: "nope" }, { type: "query", metatype: ListReservationsQueryDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("Clinic services in reservations (phase 5A)", () => {
  const dto = { animalId: "CAT", serviceId: "SVC", startAt: START } as any;
  const forBob = { animalId: "DOG", ownerId: "BOB", serviceId: "SVC", startAt: START } as any;
  const serviceReads = (t: ReturnType<typeof setup>) => t.manager.findOne.mock.calls.filter(([entity]: any[]) => entity === ClinicServiceEntity);
  const qualificationChecks = (t: ReturnType<typeof setup>) => t.manager.count.mock.calls.filter(([entity]: any[]) => entity === EmployeeServiceEntity);

  it("requires serviceId in the body (400) and accepts a body without endAt", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    await expect(pipe.transform({ animalId: id, startAt: START, endAt: END }, { type: "body", metatype: CreateReservationDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ animalId: id, serviceId: "nope", startAt: START }, { type: "body", metatype: CreateReservationDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ animalId: id, serviceId: id, startAt: START }, { type: "body", metatype: CreateReservationDto })).resolves.toMatchObject({ serviceId: id });
  });

  it("computes endAt = startAt + durationMinutes and records serviceId (CREATED snapshot included)", async () => {
    const t = setup();
    t.services.SVC.durationMinutes = 45;
    await t.business.create(dto, ana);
    expect(t.manager.create).toHaveBeenCalledWith(ReservationEntity, expect.objectContaining({
      serviceId: "SVC", startAt, endAt: new Date(startAt.getTime() + 45 * MINUTE),
    }));
    const [, created] = t.history.record.mock.calls[0] as any[];
    expect(created).toMatchObject({ action: ReservationHistoryAction.CREATED, newData: { serviceId: "SVC", endAt: "2030-01-07T10:45:00.000Z" } });
  });

  it("accepts the computed endAt from anyone, rejects a different one from non-admins (400 END_AT_MISMATCH) and lets administrators override it", async () => {
    const t = setup();
    await t.business.create({ ...dto, endAt: END }, ana);
    expect(t.manager.create).toHaveBeenLastCalledWith(ReservationEntity, expect.objectContaining({ endAt }));
    const longer = "2030-01-07T11:00:00Z";
    await expect(t.business.create({ ...dto, endAt: longer }, ana)).rejects.toMatchObject({ status: 400, response: { code: "END_AT_MISMATCH" } });
    await expect(t.business.create({ ...forBob, endAt: longer }, bob)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.manager.save).toHaveBeenCalledTimes(1);
    await t.business.create({ ...forBob, endAt: longer }, admin);
    expect(t.manager.create).toHaveBeenLastCalledWith(ReservationEntity, expect.objectContaining({ serviceId: "SVC", endAt: new Date(longer) }));
    // The administrator override still follows the clinic window rules.
    await expect(t.business.create({ ...forBob, endAt: "2030-01-07T21:00:00Z" }, admin)).rejects.toMatchObject({ response: { code: "OUTSIDE_BUSINESS_HOURS" } });
  });

  it("refuses a missing (404) or inactive service without writing: 409 SERVICE_INACTIVE for administrators, 404 for everyone else", async () => {
    const t = setup();
    await expect(t.business.create({ ...dto, serviceId: "NOPE" }, ana)).rejects.toMatchObject({ status: 404, response: { message: "Service not found" } });
    await expect(t.business.create({ ...forBob, serviceId: "NOPE" }, admin)).rejects.toMatchObject({ status: 404 });
    t.services.SVC.isActive = false;
    // Non-administrators never learn that an inactive service exists (same as GET /services/:id).
    const hidden = await t.business.create(dto, ana).catch((error: any) => error);
    expect(hidden).toMatchObject({ status: 404, response: { message: "Service not found" } });
    expect(hidden.response.code).toBeUndefined();
    await expect(t.business.create(forBob, admin)).rejects.toMatchObject({ status: 409, response: { code: "SERVICE_INACTIVE" } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("reads the service with a shared lock after the animal and client locks and before the employee profile and the applock", async () => {
    const t = setup();
    await t.business.create({ ...forBob, employeeId: "E-1" }, admin);
    const order = (predicate: (call: any[]) => boolean) => t.manager.findOne.mock.invocationCallOrder[t.manager.findOne.mock.calls.findIndex(predicate)];
    const service = order(([entity, options]) => entity === ClinicServiceEntity && options.lock?.mode === "pessimistic_read");
    expect(t.manager.findOne).toHaveBeenCalledWith(ClinicServiceEntity, { where: { id: "SVC" }, lock: { mode: "pessimistic_read" } });
    expect(order(([entity, options]) => entity === AnimalEntity && !!options.lock)).toBeLessThan(service);
    expect(order(([entity, options]) => entity === UsersEntity && !!options.lock)).toBeLessThan(service);
    expect(service).toBeLessThan(order(([entity, options]) => entity === EmployeeEntity && !!options.lock));
    expect(service).toBeLessThan(t.manager.query.mock.invocationCallOrder[0]);
  });

  it("does not let an inactive service block assign, confirm or reschedule of existing reservations", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.services.SVC.isActive = false;
    await t.business.assignEmployee("R-1", { employeeId: "E-1" }, admin);
    await t.business.confirm("R-1", {}, admin);
    await t.business.reschedule("R-1", { startAt: "2030-01-08T10:00:00Z" }, admin);
    expect(t.actions()).toEqual([ReservationHistoryAction.EMPLOYEE_ASSIGNED, ReservationHistoryAction.CONFIRMED, ReservationHistoryAction.RESCHEDULED]);
    expect(serviceReads(t)).toHaveLength(0);
  });

  it("rejects an employee not qualified for the service on pre-assignment, assign, confirm and reschedule (400 EMPLOYEE_NOT_QUALIFIED)", async () => {
    const t = setup();
    t.qualifications.delete("E-1:SVC");
    const notQualified = { status: 400, response: { code: "EMPLOYEE_NOT_QUALIFIED", message: "The employee is not qualified for this service" } };
    await expect(t.business.create({ ...forBob, employeeId: "E-1" }, admin)).rejects.toMatchObject(notQualified);
    t.addReservation({ id: "R-1" });
    await expect(t.business.assignEmployee("R-1", { employeeId: "E-1" }, admin)).rejects.toMatchObject(notQualified);
    t.addReservation({ id: "R-2", employeeId: "E-1" });
    await expect(t.business.confirm("R-2", {}, admin)).rejects.toMatchObject(notQualified);
    t.addReservation({ id: "R-3", status: ReservationStatus.CONFIRMED, employeeId: "E-1", confirmedAt: new Date() });
    await expect(t.business.reschedule("R-3", { startAt: "2030-01-08T10:00:00Z" }, admin)).rejects.toMatchObject(notQualified);
    expect(t.manager.save).not.toHaveBeenCalled();
    expect(t.manager.update).not.toHaveBeenCalled();
    // The check fails before sp_getapplock.
    expect(t.manager.query).not.toHaveBeenCalled();
    expect(qualificationChecks(t).map(([, options]: any[]) => options.where)).toEqual(Array(4).fill({ employeeId: "E-1", serviceId: "SVC" }));
  });

  it("checks the qualification after locking the employee profile and before the applock", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", employeeId: "E-2" });
    await t.business.confirm("R-1", {}, admin);
    const profileLock = t.manager.findOne.mock.invocationCallOrder[t.manager.findOne.mock.calls.findIndex(([entity, options]: any[]) => entity === EmployeeEntity && !!options.lock)];
    const check = t.manager.count.mock.invocationCallOrder[t.manager.count.mock.calls.findIndex(([entity]: any[]) => entity === EmployeeServiceEntity)];
    expect(profileLock).toBeLessThan(check);
    expect(check).toBeLessThan(t.manager.query.mock.invocationCallOrder[0]);
  });

  it("does not check qualifications for legacy reservations without a service (service_id NULL)", async () => {
    const t = setup();
    t.qualifications.clear();
    t.addReservation({ id: "R-1", serviceId: null });
    await t.business.assignEmployee("R-1", { employeeId: "E-1" }, admin);
    await t.business.confirm("R-1", {}, admin);
    await t.business.reschedule("R-1", { startAt: "2030-01-08T10:00:00Z", endAt: "2030-01-08T10:20:00Z" }, admin);
    expect(t.reservations.get("R-1")).toMatchObject({ status: ReservationStatus.PENDING, employeeId: "E-1", serviceId: null });
    expect(qualificationChecks(t)).toHaveLength(0);
    await expect(t.business.getById("R-1", admin)).resolves.toMatchObject({ serviceId: null, service: null });
  });

  it("keeps the frozen interval: a new duration changes neither existing reservations nor a reschedule without endAt", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", employeeId: "E-1" });
    t.services.SVC.durationMinutes = 90;
    await t.business.confirm("R-1", {}, admin);
    expect(t.reservations.get("R-1")).toMatchObject({ startAt, endAt });
    const newStart = new Date("2030-01-08T10:00:00Z");
    await t.business.reschedule("R-1", { startAt: newStart.toISOString() }, admin);
    expect(t.reservations.get("R-1")).toMatchObject({ startAt: newStart, endAt: new Date(newStart.getTime() + 30 * MINUTE) });
    for (const [, , changes] of t.manager.update.mock.calls as any[]) expect(changes).not.toHaveProperty("serviceId");
    const [, event] = t.history.record.mock.calls[1] as any[];
    expect(event).toMatchObject({ action: ReservationHistoryAction.RESCHEDULED, oldData: { serviceId: "SVC" }, newData: { serviceId: "SVC", endAt: "2030-01-08T10:30:00.000Z" } });
  });

  it("projects the service summary { id, code, name, durationMinutes } in responses", async () => {
    const t = setup();
    const view: any = await t.business.create(dto, ana);
    expect(view).toMatchObject({ serviceId: "SVC", service: { id: "SVC", code: "CONSULTATION", name: "Consultation", durationMinutes: 30 } });
    expect(Object.keys(view.service).sort()).toEqual(["code", "durationMinutes", "id", "name"]);
  });

  it("loads the service relation in every reservation loader (detail, write responses and list)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    const repository = (t.business as any).reservationRepository;
    await t.business.getById("R-1", admin);
    expect(repository.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ relations: expect.objectContaining({ service: true }) }));
    const joins: string[] = [];
    const qb: any = { leftJoinAndSelect: (path: string) => (joins.push(path), qb), getMany: async () => [{ ...t.reservations.get("R-1"), service: t.services.SVC }] };
    qb.withDeleted = qb.andWhere = qb.orderBy = qb.addOrderBy = qb.skip = qb.take = () => qb;
    repository.createQueryBuilder = () => qb;
    const [listed]: any[] = await t.business.list({ skip: 0, take: 10 } as any, admin);
    expect(joins).toContain("reservation.service");
    expect(listed.service).toEqual({ id: "SVC", code: "CONSULTATION", name: "Consultation", durationMinutes: 30 });
  });
});
