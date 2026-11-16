import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { FindOperator } from "typeorm";
import { ListAnimalOwnersQueryDto, RemoveAnimalOwnerDto, TransferAnimalDto } from "./dto/animal-owners.dto";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { Actor, sameId } from "../core/authorization";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { SystemRole } from "../core/enums/system-role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { UsersEntity } from "../users/entities/users.entity";
import { AnimalAccessService } from "./animal-access.service";
import { AnimalOwnersBusinessService } from "./animal-owners.business.service";
import { AnimalOwnerEntity } from "./entities/animal-owner.entity";
import { AnimalOwnerEndReason } from "./enums/animal-owner-end-reason.enum";

const actor = (flags: Partial<Actor>): Actor => ({ id: "X", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
const admin = actor({ id: "ADM", isAdmin: true });
const receptionist = actor({ id: "REC", isEmployee: true, employeeId: "E-REC" });
const ana = actor({ id: "ANA", isClient: true });
const bob = actor({ id: "BOB", isClient: true });
const carla = actor({ id: "CARLA", isClient: true });
const FUTURE = new Date(Date.now() + 86_400_000);
const LOCK = { mode: "pessimistic_write" };

type Row = Partial<AnimalOwnerEntity> & { id: string; animalId: string; userId: string; isPrimary: boolean };

/**
 * In-memory SQL Server double for one animal (CAT, primary tutor ANA): vc_animal_owners rows with the two filtered
 * unique indexes (2601 on violation), accounts, reservations, and an ordered log of row locks and writes.
 */
function setup() {
  let seq = 0;
  const rows: Row[] = [{ id: "O-1", animalId: "CAT", userId: "ANA", isPrimary: true, assignedAt: new Date("2020-01-01T00:00:00Z"), endedAt: null, endedBy: null, endReason: null }];
  const animals: Record<string, any> = { CAT: { id: "CAT", owner: { id: "ANA" } }, GONE: { id: "GONE", deletedAt: new Date() } };
  const accounts: Record<string, any> = {
    ANA: { id: "ANA", isActive: true }, BOB: { id: "BOB", isActive: true }, CARLA: { id: "CARLA", isActive: true },
    IDLE: { id: "IDLE", isActive: false }, STAFF: { id: "STAFF", isActive: true },
  };
  const clients = new Set(["ANA", "BOB", "CARLA", "IDLE"]);
  const reservations = new Map<string, any>();
  const log: string[] = [];
  const failNextInsert: { index?: string } = {};

  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => {
    if (value instanceof FindOperator) {
      if (value.type === "isNull") return row[key] === null || row[key] === undefined;
      if (value.type === "in") return (value.value as string[]).some(id => sameId(id, row[key]));
    }
    return typeof value === "string" ? sameId(value, row[key]) : row[key] === value;
  });
  const sorted = (list: Row[]) => [...list].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const manager: any = {
    findOne: jest.fn(async (entity: unknown, { where, lock }: any) => {
      if (lock) log.push(`lock:${(entity as any).name}:${where.id}`);
      if (entity === AnimalEntity) return animals[where.id] && !animals[where.id].deletedAt ? { ...animals[where.id] } : null;
      if (entity === UsersEntity) return accounts[where.id] && !accounts[where.id].deletedAt ? { ...accounts[where.id] } : null;
      if (entity === ReservationEntity) return reservations.get(where.id.toUpperCase()) ?? null;
      return null;
    }),
    find: jest.fn(async (entity: unknown, { where }: any) => entity === AnimalOwnerEntity
      ? sorted(rows.filter(row => matches(row, where))).map(row => ({ ...row, user: { id: row.userId, name: row.userId, email: `${row.userId}@x.pt` } }))
      : []),
    count: jest.fn(async (_entity: unknown, { where }: any) => rows.filter(row => matches(row, where)).length),
    insert: jest.fn(async (entity: unknown, values: any) => {
      if (entity !== AnimalOwnerEntity) return;
      const active = rows.filter(row => !row.endedAt && sameId(row.animalId, values.animalId));
      const index = failNextInsert.index
        ?? (active.some(row => sameId(row.userId, values.userId)) ? "uq_vc_animal_owners_active"
          : values.isPrimary && active.some(row => row.isPrimary) ? "uq_vc_animal_owners_primary" : undefined);
      delete failNextInsert.index;
      if (index) throw Object.assign(new Error(`Cannot insert duplicate key row in object 'dbo.vc_animal_owners' with unique index '${index}'.`), { number: 2601 });
      log.push(`insert:${values.userId}:${values.isPrimary ? "primary" : "secondary"}`);
      rows.push({ id: `O-N${++seq}`, ...values });
    }),
    update: jest.fn(async (entity: unknown, { id }: any, changes: any) => {
      if (entity === AnimalOwnerEntity) {
        log.push(`close:${rows.find(row => row.id === id)!.userId}:${changes.endReason}`);
        Object.assign(rows.find(row => row.id === id)!, changes);
      } else if (entity === AnimalEntity) {
        log.push(`owner:${changes.owner.id}`);
        animals[id].owner = changes.owner;
      } else if (entity === ReservationEntity) {
        log.push(`client:${id}:${changes.clientId}`);
        Object.assign(reservations.get(id), changes);
      }
    }),
    createQueryBuilder: jest.fn(() => {
      const params: any = {};
      const qb: any = {};
      qb.select = qb.orderBy = qb.addOrderBy = () => qb;
      qb.where = qb.andWhere = (_sql: string, values?: object) => (Object.assign(params, values), qb);
      qb.getMany = async () => [...reservations.values()]
        .filter(r => sameId(r.animalId, params.value) && params.openStatuses.includes(r.status) && r.endAt > params.now)
        .map(r => ({ ...r }));
      return qb;
    }),
  };
  const dataSource = { manager, transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
  const repository = { manager, find: (options: any) => manager.find(AnimalOwnerEntity, options) };
  const access = new AnimalAccessService(repository as any, new PersistenceService());
  const membership = { hasSystemRole: jest.fn(async (id: string, role: SystemRole) => role === SystemRole.CLIENT && clients.has(id)) };
  const history = { record: jest.fn(async () => undefined) };
  const business = new AnimalOwnersBusinessService(new PersistenceService(), dataSource as any, access, membership as any, history as any);
  const addReservation = (id: string, clientId: string, extra: any = {}) => reservations.set(id, {
    id, animalId: "CAT", clientId, status: ReservationStatus.PENDING, startAt: FUTURE, endAt: new Date(FUTURE.getTime() + 1_800_000), ...extra,
  });
  const active = () => rows.filter(row => !row.endedAt).map(row => `${row.userId}:${row.isPrimary ? "P" : "S"}`).sort();
  const addSecondary = (userId: string) => rows.push({ id: `O-${userId}`, animalId: "CAT", userId, isPrimary: false, assignedAt: new Date("2020-01-02T00:00:00Z"), endedAt: null, endedBy: null, endReason: null });
  return { business, access, manager, rows, animals, accounts, clients, reservations, log, history, membership, failNextInsert, addReservation, active, addSecondary };
}

afterEach(() => jest.restoreAllMocks());

describe("Secondary tutors (decision 4)", () => {
  it("lets the primary tutor and staff add an active client as secondary tutor, locking the animal and then the account", async () => {
    const t = setup();
    const tutors: any[] = await t.business.add("CAT", { userId: "BOB" }, ana);
    expect(t.active()).toEqual(["ANA:P", "BOB:S"]);
    expect(t.log.slice(0, 3)).toEqual(["lock:AnimalEntity:CAT", "lock:UsersEntity:BOB", "insert:BOB:secondary"]);
    expect(tutors.map(tutor => [tutor.user.id, tutor.isPrimary])).toEqual([["ANA", true], ["BOB", false]]);
    expect(tutors[1].user).toEqual({ id: "BOB", name: "BOB", email: "BOB@x.pt", phone: null });
    await t.business.add("CAT", { userId: "CARLA" }, receptionist);
    expect(t.rows.find(row => row.userId === "CARLA")).toMatchObject({ isPrimary: false, assignedBy: "REC", endedAt: null });
  });

  it("refuses a secondary tutor or a stranger adding tutors (403), and an inactive or non-client account (400)", async () => {
    const t = setup();
    t.addSecondary("BOB");
    await expect(t.business.add("CAT", { userId: "CARLA" }, bob)).rejects.toMatchObject({ status: 403 });
    await expect(t.business.add("CAT", { userId: "CARLA" }, carla)).rejects.toMatchObject({ status: 403 });
    await expect(t.business.add("CAT", { userId: "IDLE" }, admin)).rejects.toMatchObject({ status: 400 });
    await expect(t.business.add("CAT", { userId: "STAFF" }, admin)).rejects.toMatchObject({ status: 400 });
    await expect(t.business.add("CAT", { userId: "NOBODY" }, admin)).rejects.toMatchObject({ status: 400 });
    expect(t.active()).toEqual(["ANA:P", "BOB:S"]);
  });

  it("returns 409 ALREADY_TUTOR for an active tutor, also when the filtered unique index rejects a concurrent insert (2601)", async () => {
    const t = setup();
    t.addSecondary("BOB");
    await expect(t.business.add("CAT", { userId: "bob" }, admin)).rejects.toMatchObject({ status: 409, response: { code: "ALREADY_TUTOR" } });
    t.failNextInsert.index = "uq_vc_animal_owners_active";
    const error = await t.business.add("CAT", { userId: "CARLA" }, admin).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: "ALREADY_TUTOR", message: "The account is already an active tutor of this animal" });
  });

  it("refuses to add a secondary tutor to an animal without a primary tutor (409) and to a deleted animal (404)", async () => {
    const t = setup();
    t.rows[0].endedAt = new Date();
    await expect(t.business.add("CAT", { userId: "BOB" }, admin)).rejects.toMatchObject({ status: 409, response: { code: "ANIMAL_HAS_NO_PRIMARY" } });
    await expect(t.business.add("GONE", { userId: "BOB" }, admin)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Ending a secondary tutorship (decisions 4, 12)", () => {
  it("lets the secondary tutor leave, closing the row (never deleting it) with REMOVED", async () => {
    const t = setup();
    t.addSecondary("BOB");
    await expect(t.business.remove("CAT", "BOB", {}, bob)).resolves.toEqual({ movedReservationIds: [] });
    expect(t.rows).toHaveLength(2);
    expect(t.rows.find(row => row.userId === "BOB")).toMatchObject({ endedBy: "BOB", endReason: AnimalOwnerEndReason.REMOVED, endedAt: expect.any(Date) });
    expect(t.active()).toEqual(["ANA:P"]);
  });

  it("lets the primary tutor and staff remove a secondary, but not another secondary or a stranger (403)", async () => {
    const t = setup();
    t.addSecondary("BOB");
    t.addSecondary("CARLA");
    await expect(t.business.remove("CAT", "CARLA", {}, bob)).rejects.toMatchObject({ status: 403 });
    await expect(t.business.remove("CAT", "BOB", {}, actor({ id: "EVE", isClient: true }))).rejects.toMatchObject({ status: 403 });
    await t.business.remove("CAT", "CARLA", {}, ana);
    await t.business.remove("CAT", "BOB", {}, receptionist);
    expect(t.active()).toEqual(["ANA:P"]);
  });

  it("never removes the primary tutor (409, transfer first), and 404 for an account that is not an active tutor", async () => {
    const t = setup();
    for (const who of [ana, admin]) {
      await expect(t.business.remove("CAT", "ANA", {}, who)).rejects.toMatchObject({ status: 409, response: { code: "PRIMARY_TUTOR_NOT_REMOVABLE" } });
    }
    await expect(t.business.remove("CAT", "CARLA", {}, admin)).rejects.toMatchObject({ status: 404 });
    expect(t.active()).toEqual(["ANA:P"]);
  });

  it("refuses (409 with the list) while the tutor is the client of open reservations of the animal, unless transferFutureReservations", async () => {
    const t = setup();
    t.addSecondary("BOB");
    t.addReservation("R-2", "BOB");
    t.addReservation("R-1", "BOB", { status: ReservationStatus.CONFIRMED });
    t.addReservation("R-9", "ANA");
    const error = await t.business.remove("CAT", "BOB", {}, bob).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: "TUTOR_HAS_OPEN_RESERVATIONS", reservationIds: ["R-2", "R-1"], reservations: [expect.objectContaining({ id: "R-2" }), expect.objectContaining({ id: "R-1" })] });
    expect(t.active()).toEqual(["ANA:P", "BOB:S"]);
    expect(t.history.record).not.toHaveBeenCalled();
    t.log.length = 0;

    const result = await t.business.remove("CAT", "BOB", { transferFutureReservations: true }, bob);
    expect(result.movedReservationIds).toEqual(["R-2", "R-1"]);
    expect(t.reservations.get("R-1").clientId).toBe("ANA");
    expect(t.reservations.get("R-2").clientId).toBe("ANA");
    expect(t.reservations.get("R-9").clientId).toBe("ANA");
    expect(t.history.record).toHaveBeenCalledWith(t.manager, expect.objectContaining({
      reservationId: "R-1", action: ReservationHistoryAction.CLIENT_CHANGED, changedBy: "BOB", oldData: { clientId: "BOB" }, newData: { clientId: "ANA" },
    }));
    // Lock order: reservations (by id) -> animal -> primary tutor's account -> writes.
    expect(t.log).toEqual(["lock:ReservationEntity:r-1", "lock:ReservationEntity:r-2", "lock:AnimalEntity:CAT", "lock:UsersEntity:ANA",
      "close:BOB:REMOVED", "client:R-2:ANA", "client:R-1:ANA"]);
  });

  it("ignores finished, cancelled and other animals' reservations, and refuses moving them to an inactive primary tutor", async () => {
    const t = setup();
    t.addSecondary("BOB");
    t.addReservation("R-OLD", "BOB", { endAt: new Date(Date.now() - 1000) });
    t.addReservation("R-X", "BOB", { status: ReservationStatus.CANCELLED });
    t.addReservation("R-DOG", "BOB", { animalId: "DOG" });
    await expect(t.business.remove("CAT", "BOB", {}, bob)).resolves.toMatchObject({ movedReservationIds: [] });
    const u = setup();
    u.addSecondary("BOB");
    u.addReservation("R-1", "BOB");
    u.accounts.ANA.isActive = false;
    await expect(u.business.remove("CAT", "BOB", { transferFutureReservations: true }, bob)).rejects.toMatchObject({ response: { code: "PRIMARY_TUTOR_INACTIVE" } });
    expect(u.reservations.get("R-1").clientId).toBe("BOB");
  });

  it("fails with 409 RESERVATIONS_CHANGED (retry) instead of locking a reservation that appeared after the reservation phase", async () => {
    const t = setup();
    t.addSecondary("BOB");
    t.addReservation("R-1", "BOB");
    const findOne = t.manager.findOne.getMockImplementation();
    t.manager.findOne.mockImplementation(async (entity: unknown, options: any) => {
      // A reservation is created (and committed) between phase 1 and the animal lock.
      if (entity === AnimalEntity && options.lock && !t.reservations.has("R-0")) t.addReservation("R-0", "BOB");
      return findOne(entity, options);
    });
    await expect(t.business.remove("CAT", "BOB", { transferFutureReservations: true }, bob)).rejects.toMatchObject({
      status: 409, response: { code: "RESERVATIONS_CHANGED", reservationIds: ["R-0"] },
    });
    expect(t.log.filter(entry => entry.startsWith("lock:ReservationEntity"))).toEqual(["lock:ReservationEntity:r-1"]);
    expect(t.active()).toEqual(["ANA:P", "BOB:S"]);
  });
});

describe("Primary tutor transfer (decisions 10, 12)", () => {
  it("is reserved to administrators: the primary tutor, a secondary and an employee get 403", async () => {
    const t = setup();
    t.addSecondary("BOB");
    for (const who of [ana, bob, receptionist]) {
      await expect(t.business.transfer("CAT", { newPrimaryUserId: "BOB" }, who)).rejects.toMatchObject({ status: 403 });
    }
    expect(t.active()).toEqual(["ANA:P", "BOB:S"]);
  });

  it("closes the previous primary period, opens the new one, keeps history and synchronizes owner_id", async () => {
    const t = setup();
    const tutors: any[] = await t.business.transfer("CAT", { newPrimaryUserId: "CARLA" }, admin);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toMatchObject({ userId: "ANA", isPrimary: true, endReason: AnimalOwnerEndReason.TRANSFERRED, endedBy: "ADM", endedAt: expect.any(Date) });
    expect(t.rows[1]).toMatchObject({ userId: "CARLA", isPrimary: true, endedAt: null, assignedBy: "ADM" });
    expect(t.rows[0].endedAt).toEqual(t.rows[1].assignedAt);
    expect(t.animals.CAT.owner).toEqual({ id: "CARLA" });
    expect(t.log).toEqual(["lock:AnimalEntity:CAT", "lock:UsersEntity:CARLA", "close:ANA:TRANSFERRED", "insert:CARLA:primary", "owner:CARLA"]);
    expect(tutors.map(tutor => tutor.user.id)).toEqual(["CARLA"]);
    // The former primary tutor loses access; the new one manages the animal.
    expect(await t.access.canReadAnimal(ana, "CAT")).toBe(false);
    expect(await t.access.canManageAnimal(carla, "CAT")).toBe(true);
  });

  it("promotes a secondary tutor (close + open) and optionally keeps the previous primary as secondary", async () => {
    const t = setup();
    t.addSecondary("BOB");
    await t.business.transfer("CAT", { newPrimaryUserId: "BOB", keepPreviousAsSecondary: true }, admin);
    expect(t.active()).toEqual(["ANA:S", "BOB:P"]);
    expect(t.rows.filter(row => row.endedAt).map(row => [row.userId, row.isPrimary, row.endReason])).toEqual([
      ["ANA", true, "TRANSFERRED"], ["BOB", false, "TRANSFERRED"],
    ]);
    // Both accounts locked in id order before any write.
    expect(t.log.slice(0, 3)).toEqual(["lock:AnimalEntity:CAT", "lock:UsersEntity:ANA", "lock:UsersEntity:BOB"]);
    expect(t.rows).toHaveLength(4);
  });

  it("refuses the current primary (409), an inactive or non-client account (400) and a deleted animal (404)", async () => {
    const t = setup();
    await expect(t.business.transfer("CAT", { newPrimaryUserId: "ana" }, admin)).rejects.toMatchObject({ status: 409, response: { code: "ALREADY_PRIMARY" } });
    await expect(t.business.transfer("CAT", { newPrimaryUserId: "IDLE" }, admin)).rejects.toMatchObject({ status: 400 });
    await expect(t.business.transfer("CAT", { newPrimaryUserId: "STAFF" }, admin)).rejects.toMatchObject({ status: 400 });
    await expect(t.business.transfer("GONE", { newPrimaryUserId: "BOB" }, admin)).rejects.toMatchObject({ status: 404 });
    expect(t.active()).toEqual(["ANA:P"]);
  });

  it("assigns a primary tutor to a legacy animal without one", async () => {
    const t = setup();
    t.rows.splice(0, 1);
    t.animals.CAT.owner = null;
    await t.business.transfer("CAT", { newPrimaryUserId: "BOB" }, admin);
    expect(t.active()).toEqual(["BOB:P"]);
    expect(t.animals.CAT.owner).toEqual({ id: "BOB" });
  });

  it("refuses (409 with the list) while the previous primary is the client of open reservations; with the flag they move to the new primary", async () => {
    const t = setup();
    t.addReservation("R-1", "ANA");
    t.addReservation("R-2", "ANA", { status: ReservationStatus.CONFIRMED });
    await expect(t.business.transfer("CAT", { newPrimaryUserId: "BOB" }, admin)).rejects.toMatchObject({
      status: 409, response: { code: "TUTOR_HAS_OPEN_RESERVATIONS", reservationIds: ["R-1", "R-2"] },
    });
    expect(t.active()).toEqual(["ANA:P"]);
    t.log.length = 0;
    await t.business.transfer("CAT", { newPrimaryUserId: "BOB", transferFutureReservations: true, reason: "Mudou de tutor" }, admin);
    expect([...t.reservations.values()].map(r => r.clientId)).toEqual(["BOB", "BOB"]);
    expect(t.history.record).toHaveBeenCalledTimes(2);
    expect(t.history.record).toHaveBeenCalledWith(t.manager, {
      reservationId: "R-2", action: ReservationHistoryAction.CLIENT_CHANGED, changedBy: "ADM", reason: "Mudou de tutor",
      oldData: { clientId: "ANA" }, newData: { clientId: "BOB" },
    });
    // reservations (phase 1, id order) -> animal -> account -> tutorship writes -> owner_id -> reservation writes.
    expect(t.log).toEqual(["lock:ReservationEntity:r-1", "lock:ReservationEntity:r-2", "lock:AnimalEntity:CAT", "lock:UsersEntity:BOB",
      "close:ANA:TRANSFERRED", "insert:BOB:primary", "owner:BOB", "client:R-1:BOB", "client:R-2:BOB"]);
  });

  it("maps a filtered unique index violation (2601) on the primary index to a 409 of its own", async () => {
    const t = setup();
    t.failNextInsert.index = "uq_vc_animal_owners_primary";
    await expect(t.business.transfer("CAT", { newPrimaryUserId: "BOB" }, admin)).rejects.toMatchObject({ status: 409, response: { code: "TUTORS_CHANGED" } });
  });
});

describe("Listing tutors (decision 13)", () => {
  it("shows active tutors to staff and active tutors, history only to staff and the primary tutor", async () => {
    const t = setup();
    t.addSecondary("BOB");
    t.rows.push({ id: "O-OLD", animalId: "CAT", userId: "CARLA", isPrimary: false, assignedAt: new Date("2019-01-01T00:00:00Z"), endedAt: new Date("2019-06-01T00:00:00Z"), endedBy: "ADM", endReason: AnimalOwnerEndReason.REMOVED });
    expect((await t.business.list("CAT", {}, bob)).map((tutor: any) => tutor.user.id)).toEqual(["ANA", "BOB"]);
    await expect(t.business.list("CAT", { includeHistory: true }, bob)).rejects.toMatchObject({ status: 403 });
    const history: any[] = await t.business.list("CAT", { includeHistory: true }, ana);
    expect(history).toHaveLength(3);
    expect(history.find(row => row.user.id === "CARLA")).toMatchObject({ endReason: "REMOVED", endedAt: expect.any(Date) });
    expect(history[0]).not.toHaveProperty("endedBy");
    expect((await t.business.list("CAT", { includeHistory: true }, admin))[0]).toHaveProperty("endedBy");
    await expect(t.business.list("CAT", { includeHistory: true }, receptionist)).resolves.toHaveLength(3);
    // A former tutor has no access at all.
    await expect(t.business.list("CAT", {}, carla)).rejects.toMatchObject({ status: 403 });
  });
});

describe("Immutable periods (ck_vc_animal_owners_dates)", () => {
  it("never closes a period before it started, even when assigned_at is ahead of the application clock", async () => {
    const t = setup();
    const ahead = new Date(Date.now() + 3_600_000);
    t.addSecondary("BOB");
    t.rows.find(row => row.userId === "BOB")!.assignedAt = ahead;
    await t.business.remove("CAT", "BOB", {}, admin);
    expect(t.rows.find(row => row.userId === "BOB")!.endedAt).toEqual(ahead);
    // Closed rows are never rewritten: a later transfer leaves BOB's period untouched.
    await t.business.transfer("CAT", { newPrimaryUserId: "BOB" }, admin);
    expect(t.rows.filter(row => row.userId === "BOB")).toEqual([
      expect.objectContaining({ isPrimary: false, endedAt: ahead, endReason: "REMOVED" }),
      expect.objectContaining({ isPrimary: true, endedAt: null }),
    ]);
  });
});

describe("Tutorship DTOs (project ValidationPipe)", () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
  const parse = (metatype: any, value: unknown, type: "body" | "query" = "body") => pipe.transform(value, { type, metatype });

  it("reads boolean flags from query strings and rejects anything else", async () => {
    await expect(parse(RemoveAnimalOwnerDto, { transferFutureReservations: "true" }, "query")).resolves.toEqual({ transferFutureReservations: true });
    await expect(parse(ListAnimalOwnersQueryDto, { includeHistory: "false" }, "query")).resolves.toEqual({ includeHistory: false });
    await expect(parse(RemoveAnimalOwnerDto, { transferFutureReservations: "yes" }, "query")).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(RemoveAnimalOwnerDto, {})).resolves.toEqual({});
  });

  it("requires a UUID for the new primary tutor and refuses unknown fields", async () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    await expect(parse(TransferAnimalDto, { newPrimaryUserId: id, keepPreviousAsSecondary: true, transferFutureReservations: true, reason: "x" })).resolves.toBeInstanceOf(TransferAnimalDto);
    await expect(parse(TransferAnimalDto, { newPrimaryUserId: "bob" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(TransferAnimalDto, { newPrimaryUserId: id, ownerId: id })).rejects.toBeInstanceOf(BadRequestException);
  });
});
