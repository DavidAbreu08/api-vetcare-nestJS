import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { Actor, sameId } from "../core/authorization";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { PersistenceMessage } from "../core/persistence/persistence.messages";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { EmployeeServiceEntity } from "../clinic-services/entities/employee-service.entity";
import { UsersEntity } from "../users/entities/users.entity";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { ClinicalVisitBusinessService } from "./clinical-visit.business.service";
import { ClinicalVisitMessage } from "./clinical-visit.messages";
import { ClinicalVisitEntity } from "./entities/clinical-visit.entity";
import { ClinicalVisitStatus } from "./enums/clinical-visit-status.enum";

const actor = (flags: Partial<Actor>): Actor => ({ id: "X", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
const admin = actor({ id: "ADM", isAdmin: true });
const vet1 = actor({ id: "U-E-1", isEmployee: true, employeeId: "E-1" });
const vet2 = actor({ id: "U-E-2", isEmployee: true, employeeId: "E-2" });
const owner = actor({ id: "OWNER", isClient: true });
const stranger = actor({ id: "OTHER", isClient: true });
/** Employee profile (vc_employees row, without its account). */
const employee = (id: string) => ({ id, userId: `U-${id}`, terminationDate: null, isAvailableForBookings: true });
/** Account (vc_users row) of the employee's profile. */
const account = (id: string) => ({ id: `U-${id}`, name: id, isActive: true, deletedAt: null });

function setup() {
  const reservations = new Map<string, any>();
  const visits = new Map<string, any>();
  const employees = new Map<string, any>([["E-1", employee("E-1")], ["E-2", employee("E-2")]]);
  const users = new Map<string, any>([["U-E-1", account("E-1")], ["U-E-2", account("E-2")]]);
  /** Qualifications (vc_employee_services) as "employeeId|serviceId": E-1 and E-2 hold SVC-1 by default. */
  const qualifications = new Set<string>(["E-1|SVC-1", "E-2|SVC-1"]);
  /** Employee profile with its account, as the visit's employee relation is loaded. */
  const withAccount = (employeeId: string) => ({ ...employees.get(employeeId), user: users.get(`U-${employeeId}`) });
  const animals: Record<string, any> = { CAT: { id: "CAT" }, DOG: { id: "DOG" } };

  /** Reservation query builder honouring the employee and status filters of assignedAnimalIds. */
  const reservationQueryBuilder = jest.fn(() => {
    const params: any = {};
    const qb: any = {};
    qb.select = () => qb;
    qb.where = qb.andWhere = (_sql: string, values?: object) => (Object.assign(params, values), qb);
    qb.getRawMany = async () => [...reservations.values()]
      .filter(r => sameId(r.employeeId, params.employeeId) && params.accessStatuses.includes(r.status) && params.animalIds.includes(r.animalId))
      .map(r => ({ animalId: r.animalId }));
    return qb;
  });
  // Connection of the open transaction: withLockTimeout sends its SET LOCK_TIMEOUT batches here.
  const batch = jest.fn(async (_sql: string) => undefined);
  const manager: any = {
    queryRunner: { isTransactionActive: true, databaseConnection: { request: () => ({ batch }) } },
    findOne: jest.fn(async (entity: unknown, { where }: any) => {
      if (entity === ReservationEntity) return reservations.has(where.id) ? { ...reservations.get(where.id) } : null;
      if (entity === ClinicalVisitEntity) return visits.has(where.id) ? { ...visits.get(where.id) } : null;
      if (entity === EmployeeEntity) return employees.has(where.id) ? { ...employees.get(where.id) } : null;
      if (entity === UsersEntity) return users.has(where.id) ? { ...users.get(where.id) } : null;
      if (entity === AnimalEntity) return animals[where.id] ?? null;
      return null;
    }),
    count: jest.fn(async (entity: unknown, { where }: any) => {
      if (entity === EmployeeServiceEntity) return qualifications.has(`${where.employeeId}|${where.serviceId}`) ? 1 : 0;
      if (entity === ClinicalVisitEntity) return [...visits.values()].filter(v => sameId(v.reservationId, where.reservationId)).length;
      throw new Error("unexpected count entity");
    }),
    find: jest.fn(async (_entity: unknown, { where }: any) => [...visits.values()]
      .filter(v => sameId(v.animalId, where.animalId) && v.status === where.status).map(v => ({ id: v.id }))),
    create: jest.fn((_entity: unknown, row: any) => ({ ...row })),
    save: jest.fn(async (row: any) => {
      const saved = { id: "V-NEW", ...row };
      visits.set(saved.id, saved);
      return saved;
    }),
    update: jest.fn(async (entity: unknown, { id }: any, changes: any) => Object.assign((entity === ReservationEntity ? reservations : visits).get(id), changes)),
    createQueryBuilder: jest.fn(() => reservationQueryBuilder()),
  };
  const dataSource = { transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)) };
  const history = { record: jest.fn(async () => undefined) };
  const visitRepository = {
    findOne: jest.fn(async ({ where }: any) => (visits.has(where.id)
      ? { ...visits.get(where.id), animal: { id: visits.get(where.id).animalId, owner: { id: "OWNER" } }, employee: withAccount(visits.get(where.id).employeeId) }
      : null)),
  };
  const reservationRepository = { createQueryBuilder: reservationQueryBuilder };
  /** Active tutors per animal (AnimalAccessService double); OWNER tutors every animal. */
  const tutors: Record<string, string[]> = { CAT: ["OWNER"], DOG: ["OWNER"] };
  const access = { isActiveTutor: jest.fn(async (animalId: string, userId: string) => (tutors[animalId] ?? []).some(id => sameId(id, userId))) };
  const business = new ClinicalVisitBusinessService(new PersistenceService(), dataSource as any, history as any, visitRepository as any, reservationRepository as any, access as any);
  const addReservation = (row: any) => reservations.set(row.id, { animalId: "CAT", clientId: "OWNER", employeeId: "E-1", serviceId: "SVC-1", status: ReservationStatus.CONFIRMED, confirmedAt: new Date(), ...row });
  const addVisit = (row: any) => visits.set(row.id, {
    reservationId: null, animalId: "CAT", employeeId: "E-1", status: ClinicalVisitStatus.IN_PROGRESS,
    startedAt: new Date(Date.now() - 60_000), endedAt: null, clinicalNotes: "secret notes", voidReason: null, voidedBy: null, ...row,
  });
  return { business, manager, batch, history, reservations, visits, employees, users, qualifications, addReservation, addVisit, reservationQueryBuilder, tutors, access };
}

describe("ClinicalVisitBusinessService.start", () => {
  it("starts an IN_PROGRESS visit from a CONFIRMED reservation for its assigned employee", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await t.business.start({ reservationId: "R-1" }, vet1);
    expect(t.manager.create).toHaveBeenCalledWith(ClinicalVisitEntity, expect.objectContaining({
      reservationId: "R-1", animalId: "CAT", employeeId: "E-1", status: ClinicalVisitStatus.IN_PROGRESS, startedAt: expect.any(Date), endedAt: null,
    }));
  });

  it("starts a visit without reservation (urgency)", async () => {
    const t = setup();
    await t.business.start({ animalId: "DOG" }, vet2);
    expect(t.manager.create).toHaveBeenCalledWith(ClinicalVisitEntity, expect.objectContaining({ reservationId: null, animalId: "DOG", employeeId: "E-2" }));
  });

  it("requires a CONFIRMED reservation (409)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1", status: ReservationStatus.PENDING, confirmedAt: null });
    await expect(t.business.start({ reservationId: "R-1" }, vet1)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a second visit for the reservation, VOIDED included (409)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.addVisit({ id: "V-1", reservationId: "R-1", status: ClinicalVisitStatus.VOIDED });
    await expect(t.business.start({ reservationId: "R-1" }, vet1)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses an animal different from the reservation's (400)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await expect(t.business.start({ reservationId: "R-1", animalId: "DOG" }, vet1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lets only the assigned employee or an admin start it; the admin may name another responsible", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await expect(t.business.start({ reservationId: "R-1" }, vet2)).rejects.toBeInstanceOf(ForbiddenException);
    await t.business.start({ reservationId: "R-1", employeeId: "E-2" }, admin);
    expect(t.manager.create).toHaveBeenLastCalledWith(ClinicalVisitEntity, expect.objectContaining({ reservationId: "R-1", employeeId: "E-2" }));
  });

  it("defaults the admin's visit to the reservation's employee", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await t.business.start({ reservationId: "R-1" }, admin);
    expect(t.manager.create).toHaveBeenCalledWith(ClinicalVisitEntity, expect.objectContaining({ employeeId: "E-1" }));
  });
});

describe("Visit start: responsible profile lock, account and service qualification", () => {
  const notQualified = { status: 400, response: { code: "EMPLOYEE_NOT_QUALIFIED", message: "The employee is not qualified for this service" } };

  it("rejects a reservation whose responsible employee is not qualified for its service (400), without saving", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.qualifications.delete("E-1|SVC-1");
    await expect(t.business.start({ reservationId: "R-1" }, vet1)).rejects.toMatchObject(notQualified);
    expect(t.manager.count).toHaveBeenCalledWith(EmployeeServiceEntity, { where: { employeeId: "E-1", serviceId: "SVC-1" } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("starts the visit when the responsible employee holds the service qualification", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await t.business.start({ reservationId: "R-1" }, vet1);
    expect(t.manager.count).toHaveBeenCalledWith(EmployeeServiceEntity, { where: { employeeId: "E-1", serviceId: "SVC-1" } });
    expect(t.manager.save).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "R-1", employeeId: "E-1" }));
  });

  it("skips the qualification check for a legacy reservation without service_id", async () => {
    const t = setup();
    t.qualifications.clear();
    t.addReservation({ id: "R-1", serviceId: null });
    await t.business.start({ reservationId: "R-1" }, vet1);
    expect(t.manager.count).not.toHaveBeenCalledWith(EmployeeServiceEntity, expect.anything());
    expect(t.manager.save).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "R-1", employeeId: "E-1" }));
  });

  it("skips the qualification check for a walk-in visit (no reservation, no service)", async () => {
    const t = setup();
    t.qualifications.clear();
    await t.business.start({ animalId: "DOG" }, vet2);
    expect(t.manager.count).not.toHaveBeenCalledWith(EmployeeServiceEntity, expect.anything());
    expect(t.manager.save).toHaveBeenCalledWith(expect.objectContaining({ reservationId: null, animalId: "DOG", employeeId: "E-2" }));
  });

  it("checks the employee the administrator names, not the reservation's employee (refused when she is not qualified)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.qualifications.delete("E-2|SVC-1");
    await expect(t.business.start({ reservationId: "R-1", employeeId: "E-2" }, admin)).rejects.toMatchObject(notQualified);
    expect(t.manager.count).toHaveBeenCalledWith(EmployeeServiceEntity, { where: { employeeId: "E-2", serviceId: "SVC-1" } });
    expect(t.manager.count).not.toHaveBeenCalledWith(EmployeeServiceEntity, { where: { employeeId: "E-1", serviceId: "SVC-1" } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("accepts the employee the administrator names when she is qualified, even if the reservation's employee is not", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.qualifications.delete("E-1|SVC-1");
    await t.business.start({ reservationId: "R-1", employeeId: "E-2" }, admin);
    expect(t.manager.count).toHaveBeenCalledWith(EmployeeServiceEntity, { where: { employeeId: "E-2", serviceId: "SVC-1" } });
    expect(t.manager.save).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "R-1", employeeId: "E-2" }));
  });

  it("reads the responsible profile with the write lock and no relations, after the reservation and animal locks, then its account, then the qualification", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    await t.business.start({ reservationId: "R-1" }, vet1);
    const calls: any[][] = t.manager.findOne.mock.calls;
    const order: number[] = t.manager.findOne.mock.invocationCallOrder;
    const at = (entity: unknown) => calls.findIndex(([called]) => called === entity);
    const profile = at(EmployeeEntity);
    expect(calls[profile][1]).toEqual({ where: { id: "E-1" }, lock: { mode: "pessimistic_write" } });
    expect(calls[profile][1]).not.toHaveProperty("relations");
    expect(order[at(ReservationEntity)]).toBeLessThan(order[profile]);
    expect(order[at(AnimalEntity)]).toBeLessThan(order[profile]);
    expect(order[profile]).toBeLessThan(order[at(UsersEntity)]);
    const qualificationCall = t.manager.count.mock.calls.findIndex(([entity]) => entity === EmployeeServiceEntity);
    const qualification = t.manager.count.mock.invocationCallOrder[qualificationCall];
    expect(order[at(UsersEntity)]).toBeLessThan(qualification);
    expect(qualification).toBeLessThan(t.manager.save.mock.invocationCallOrder[0]);
  });

  it("refuses a responsible employee whose account is inactive, as read after the profile lock (400 INVALID_EMPLOYEE)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.users.get("U-E-1").isActive = false;
    await expect(t.business.start({ reservationId: "R-1" }, vet1)).rejects.toMatchObject({ status: 400, response: { message: ClinicalVisitMessage.InvalidEmployee } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("refuses a responsible employee whose profile is terminated, as read after the profile lock (400 INVALID_EMPLOYEE)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.employees.get("E-1").terminationDate = "2000-01-01";
    await expect(t.business.start({ reservationId: "R-1" }, vet1)).rejects.toMatchObject({ status: 400, response: { message: ClinicalVisitMessage.InvalidEmployee } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });
});

describe("One IN_PROGRESS visit per animal (decision 27)", () => {
  it("locks the animal and refuses a second IN_PROGRESS visit (409 with the visit id)", async () => {
    const t = setup();
    t.addVisit({ id: "V-1", animalId: "CAT" });
    const error = await t.business.start({ animalId: "CAT" }, vet1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: "ANIMAL_VISIT_IN_PROGRESS", message: "The animal already has a clinical visit in progress; complete or void it first" });
    expect(error.getResponse()).not.toHaveProperty("clinicalVisitIds");
    expect(t.manager.findOne).toHaveBeenCalledWith(AnimalEntity, { where: { id: "CAT" }, lock: { mode: "pessimistic_write" } });
    expect(t.manager.save).not.toHaveBeenCalled();
  });

  it("allows a new visit once the previous one is COMPLETED or VOIDED, and for another animal", async () => {
    const t = setup();
    t.addVisit({ id: "V-1", animalId: "CAT", status: ClinicalVisitStatus.COMPLETED });
    t.addVisit({ id: "V-2", animalId: "DOG" });
    await expect(t.business.start({ animalId: "CAT" }, vet1)).resolves.toBeDefined();
  });

  it("maps a 2601 violation of uq_vc_clinical_visits_animal_in_progress (concurrent start) to the same 409", async () => {
    const t = setup();
    const duplicate = Object.assign(new QueryFailedError("INSERT", [], new Error("dup")), {
      driverError: { number: 2601, message: "Cannot insert duplicate key row in object 'dbo.vc_clinical_visits' with unique index 'uq_vc_clinical_visits_animal_in_progress'. The duplicate key value is (CAT)." },
    });
    t.manager.save.mockRejectedValueOnce(duplicate);
    await expect(t.business.start({ animalId: "CAT" }, vet1)).rejects.toMatchObject({ status: 409, response: { code: "ANIMAL_VISIT_IN_PROGRESS" } });
  });

  it("keeps the generic duplicate message for other unique indexes", async () => {
    const t = setup();
    t.manager.save.mockRejectedValueOnce(Object.assign(new QueryFailedError("INSERT", [], new Error("dup")), {
      driverError: { number: 2601, message: "Cannot insert duplicate key row in object 'dbo.vc_clinical_visits' with unique index 'uq_vc_clinical_visits_id_animal'." },
    }));
    const error = await t.business.start({ animalId: "CAT" }, vet1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).not.toMatchObject({ code: "ANIMAL_VISIT_IN_PROGRESS" });
    expect(error.getResponse()).toMatchObject({ message: PersistenceMessage.Duplicate });
    expect(error.getResponse()).not.toHaveProperty("code");
  });
});

describe("One clinical visit per reservation (concurrent start)", () => {
  it("maps a 2601 violation of uq_vc_clinical_visits_reservation_id to 409 with the reservation message", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.manager.save.mockRejectedValueOnce({
      number: 2601,
      message: "Cannot insert duplicate key row in object 'dbo.vc_clinical_visits' with unique index 'uq_vc_clinical_visits_reservation_id'. The duplicate key value is (R-1).",
    });
    const error = await t.business.start({ reservationId: "R-1" }, vet1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: "RESERVATION_HAS_VISIT", message: ClinicalVisitMessage.ReservationHasVisit });
  });

  it("maps a 2627 violation (UNIQUE KEY wording) of uq_vc_clinical_visits_reservation_id to the same 409", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.manager.save.mockRejectedValueOnce({
      number: 2627,
      message: "Violation of UNIQUE KEY constraint 'uq_vc_clinical_visits_reservation_id'. Cannot insert duplicate key in object 'dbo.vc_clinical_visits'.",
    });
    const error = await t.business.start({ reservationId: "R-1" }, vet1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: "RESERVATION_HAS_VISIT", message: ClinicalVisitMessage.ReservationHasVisit });
  });

  it("does not map a 2601 violation of another unique index to the reservation message (the original error is rethrown)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.manager.save.mockRejectedValueOnce({
      number: 2601,
      message: "Cannot insert duplicate key row in object 'dbo.vc_clinical_visits' with unique index 'uq_outro'. The duplicate key value is (R-1).",
    });
    const error = await t.business.start({ reservationId: "R-1" }, vet1).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).not.toMatchObject({ code: "RESERVATION_HAS_VISIT" });
    expect(error.getResponse()).toMatchObject({ message: PersistenceMessage.Duplicate, errorMetadata: ErrorMetadata.ALREADY_EXISTS });
  });
});

describe("ClinicalVisitBusinessService.complete and void", () => {
  it("records the caller as completedBy (E2) and shows it only to administrators", async () => {
    const t = setup();
    t.addVisit({ id: "V-1" });
    const view: any = await t.business.complete("V-1", {}, vet1);
    expect(t.visits.get("V-1")).toMatchObject({ status: ClinicalVisitStatus.COMPLETED, completedBy: "U-E-1" });
    expect(view).not.toHaveProperty("completedBy");
    expect(await t.business.get("V-1", admin)).toMatchObject({ completedBy: "U-E-1" });
  });

  it("never voids before startedAt (ck_vc_clinical_visits_voided_dates), even with a clock behind", async () => {
    const t = setup();
    const startedAt = new Date(Date.now() + 60_000);
    t.addVisit({ id: "V-1", startedAt });
    await t.business.voidVisit("V-1", { reason: "clock skew" }, admin);
    expect(t.visits.get("V-1").voidedAt.getTime()).toBe(startedAt.getTime());
  });

  it("completes the visit and its reservation with a COMPLETED event", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.addVisit({ id: "V-1", reservationId: "R-1" });
    await t.business.complete("V-1", {}, vet1);
    expect(t.visits.get("V-1")).toMatchObject({ status: ClinicalVisitStatus.COMPLETED, endedAt: expect.any(Date) });
    expect(t.reservations.get("R-1").status).toBe(ReservationStatus.COMPLETED);
    expect(t.history.record).toHaveBeenCalledWith(t.manager, expect.objectContaining({
      reservationId: "R-1", action: ReservationHistoryAction.COMPLETED, newData: expect.objectContaining({ clinicalVisitId: "V-1" }),
    }));
  });

  it("updates the visit before the reservation (the reservation trigger requires a COMPLETED visit)", async () => {
    const t = setup();
    t.addReservation({ id: "R-1" });
    t.addVisit({ id: "V-1", reservationId: "R-1" });
    await t.business.complete("V-1", {}, vet1);
    const calls: any[][] = t.manager.update.mock.calls;
    const order: number[] = t.manager.update.mock.invocationCallOrder;
    const visitIndex = calls.findIndex(([entity, , changes]) => entity === ClinicalVisitEntity && changes.status === ClinicalVisitStatus.COMPLETED);
    const reservationIndex = calls.findIndex(([entity, , changes]) => entity === ReservationEntity && changes.status === ReservationStatus.COMPLETED);
    expect(visitIndex).toBeGreaterThanOrEqual(0);
    expect(reservationIndex).toBeGreaterThanOrEqual(0);
    expect(order[visitIndex]).toBeLessThan(order[reservationIndex]);
  });

  it("voids only for an admin with a justification", async () => {
    const t = setup();
    t.addVisit({ id: "V-1" });
    await expect(t.business.voidVisit("V-1", { reason: "wrong animal" }, vet1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.business.voidVisit("V-1", { reason: "   " }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await t.business.voidVisit("V-1", { reason: "wrong animal" }, admin);
    expect(t.visits.get("V-1")).toMatchObject({ status: ClinicalVisitStatus.VOIDED, voidReason: "wrong animal", voidedBy: "ADM", voidedAt: expect.any(Date) });
  });
});

describe("ClinicalVisitBusinessService.withWritableVisit (measurements)", () => {
  it("rejects a measurement for another animal (400) without running the work", async () => {
    const t = setup();
    t.addVisit({ id: "V-1" });
    const work = jest.fn();
    await expect(t.business.withWritableVisit("V-1", "DOG", vet1, work)).rejects.toBeInstanceOf(BadRequestException);
    expect(work).not.toHaveBeenCalled();
  });

  it("checks reservation-derived access with the transaction manager", async () => {
    const t = setup();
    t.addVisit({ id: "V-1", employeeId: "E-1" });
    t.addReservation({ id: "R-2", employeeId: "E-2" });
    await t.business.withWritableVisit("V-1", "CAT", vet2, async () => "ok");
    expect(t.manager.createQueryBuilder).toHaveBeenCalledWith(ReservationEntity, "r");
  });
});

describe("Clinical access (A.6)", () => {
  const read = async (reader: Actor, reservationStatus?: ReservationStatus) => {
    const t = setup();
    t.addVisit({ id: "V-1", employeeId: "E-1" });
    if (reservationStatus) t.addReservation({ id: "R-2", employeeId: "E-2", status: reservationStatus });
    return t.business.get("V-1", reader) as Promise<Record<string, unknown>>;
  };

  it("shows clinical notes to the admin, the responsible employee and an employee assigned in CONFIRMED", async () => {
    expect((await read(admin)).clinicalNotes).toBe("secret notes");
    expect((await read(vet1)).clinicalNotes).toBe("secret notes");
    expect((await read(vet2, ReservationStatus.CONFIRMED)).clinicalNotes).toBe("secret notes");
  });

  it("denies an employee assigned only to a PENDING reservation", async () => {
    await expect(read(vet2, ReservationStatus.PENDING)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("shows the owner the visit without clinical notes and denies third parties", async () => {
    const view = await read(owner);
    expect(view).toMatchObject({ id: "V-1", status: ClinicalVisitStatus.IN_PROGRESS });
    expect(view).not.toHaveProperty("clinicalNotes");
    await expect(read(stranger)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("Clinical record follows the animal across tutors (decision 13)", () => {
  it("shows the visit (without clinical notes) to a secondary tutor and to a new tutor, and denies a former tutor", async () => {
    const t = setup();
    t.addVisit({ id: "V-1", employeeId: "E-1", clinicalNotes: "secret notes" });
    const carla = actor({ id: "CARLA", isClient: true });
    t.tutors.CAT = ["CARLA"];
    const view = await t.business.get("V-1", carla) as Record<string, unknown>;
    expect(view).toMatchObject({ id: "V-1" });
    expect(view).not.toHaveProperty("clinicalNotes");
    expect(t.access.isActiveTutor).toHaveBeenCalledWith("CAT", "CARLA");
    // OWNER stopped being a tutor of CAT: no access to its clinical history any more.
    await expect(t.business.get("V-1", owner)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("Critical transactions run under withLockTimeout", () => {
  it("sets LOCK_TIMEOUT 5000 on the transaction connection before the first query of a visit start, and restores -1 after the insert", async () => {
    const t = setup();
    await t.business.start({ animalId: "DOG" }, vet2);
    const queries = Object.values(t.manager).filter(jest.isMockFunction).flatMap(fn => fn.mock.invocationCallOrder);
    expect(t.batch.mock.calls).toEqual([["SET LOCK_TIMEOUT 5000;"], ["SET LOCK_TIMEOUT -1;"]]);
    expect(t.batch.mock.invocationCallOrder[0]).toBeLessThan(Math.min(...queries));
    expect(t.batch.mock.invocationCallOrder[1]).toBeGreaterThan(Math.max(...queries));
  });
});
