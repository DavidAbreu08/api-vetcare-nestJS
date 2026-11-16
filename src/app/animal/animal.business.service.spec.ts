import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ClinicalVisitEntity } from "../clinical-visits/entities/clinical-visit.entity";
import { ClinicalVisitStatus } from "../clinical-visits/enums/clinical-visit-status.enum";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { AnimalEntity } from "./entities/animal.entity";
import { Actor } from "../core/authorization";
import { PersistenceService } from "../core/persistence/persistence.service";
import { SystemRole } from "../core/enums/system-role.enum";
import { AnimalBusinessService } from "./animal.business.service";
import { instanceToPlain } from "class-transformer";
import { AnimalMeasurementEntity } from "../animal-measurements/entities/animal-measurement.entity";

const ana: Actor = { id: "ANA", roleIds: ["employee", "client"], isAdmin: false, isEmployee: true, isClient: true, employeeId: "E-ANA" };
const clientOnly: Actor = { ...ana, isEmployee: false, employeeId: null, roleIds: ["client"] };

describe("Animals of an account that is both client and employee", () => {
  let animals: any, users: any, membership: any, measurements: any, business: AnimalBusinessService, isVet: boolean;

  beforeEach(() => {
    animals = { find: jest.fn(async () => []), create: jest.fn((row: unknown) => row), save: jest.fn(async (row: any) => ({ id: "CAT", ...row })) };
    users = { findOneBy: jest.fn(async ({ id }: any) => ({ id, name: id, email: `${id}@x.pt` })) };
    // Ana holds CLIENT (and EMPLOYEE): the owner check only asks for CLIENT.
    membership = { hasSystemRole: jest.fn(async (_id: string, role: SystemRole) => role === SystemRole.CLIENT) };
    const species = { getById: jest.fn(async () => ({ id: "S-1", name: "Gato" })), findByName: jest.fn() };
    measurements = { latest: jest.fn(async () => ({ weight: null, height: null, latestMeasurements: [] })), latestMany: jest.fn(async () => new Map()) };
    isVet = false;
    business = new AnimalBusinessService(animals, users, species as any, {} as any, new PersistenceService(), measurements as any, membership, {} as any, { isVeterinarian: async () => isVet } as any);
  });

  it("accepts her as owner and registers her own animal unverified, like any client", async () => {
    const created: any = await business.create({ name: "Mia", color: "preto", sex: "F", speciesId: "S-1", ownerId: "ANA" } as any, ana);
    expect(membership.hasSystemRole).toHaveBeenCalledWith("ANA", SystemRole.CLIENT);
    expect(created).toMatchObject({ owner: { id: "ANA" }, isVerified: false });
  });

  it("registers another client's animal verified only when she is a veterinarian (same rule as update/confirm)", async () => {
    const rex = { name: "Rex", color: "castanho", sex: "M", speciesId: "S-1", ownerId: "BOB" } as any;
    // As a receptionist (no veterinarian job title) the animal waits for approval.
    expect(((await business.create(rex, ana)) as any).isVerified).toBe(false);
    isVet = true;
    expect(((await business.create(rex, ana)) as any).isVerified).toBe(true);
    // Never for her own animal, even as a veterinarian.
    expect(((await business.create({ ...rex, ownerId: "ANA" }, ana)) as any).isVerified).toBe(false);
    const admin: Actor = { id: "ADM", roleIds: ["admin"], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };
    isVet = false;
    expect(((await business.create(rex, admin)) as any).isVerified).toBe(true);
  });

  it("lists every animal for her as active staff, but only their own for a client-only account", async () => {
    await business.getAll({} as any, ana);
    expect(animals.find.mock.calls[0][0].where).not.toHaveProperty("owner");
    await business.getAll({} as any, clientOnly);
    expect(animals.find.mock.calls[1][0].where.owner).toEqual({ id: "ANA" });
    await expect(business.getAll({ ownerId: "BOB" } as any, clientOnly)).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("latestMeasurements projection", () => {
    const admin: Actor = { id: "ADM", roleIds: ["admin"], isAdmin: true, isEmployee: false, isClient: false, employeeId: null };
    const measurement = () => Object.assign(new AnimalMeasurementEntity(), { id: "M-1", animalId: "CAT", recordedBy: "EMP", updatedBy: "EDITOR", value: "4.000000" });
    const pet = { id: "CAT", name: "Mia", owner: { id: "ANA", name: "Ana", email: "ana@x.pt" } };
    let row: AnimalMeasurementEntity;

    beforeEach(() => {
      row = measurement();
      const latest = { weight: 4, height: null, latestMeasurements: [row] };
      measurements.latest.mockResolvedValue(latest);
      measurements.latestMany.mockResolvedValue(new Map([["CAT", latest]]));
      animals.find.mockResolvedValue([pet]);
      animals.findOne = jest.fn(async () => pet);
    });

    it("hides updatedBy from a client in getById and getAll (recordedBy kept)", async () => {
      for (const result of [await business.getById("CAT", clientOnly), (await business.getAll({} as any, clientOnly))[0]] as any[]) {
        const plain: any = instanceToPlain(result);
        expect(plain.latestMeasurements[0]).not.toHaveProperty("updatedBy");
        expect(plain.latestMeasurements[0]).toMatchObject({ id: "M-1", recordedBy: "EMP" });
      }
      expect(row.updatedBy).toBe("EDITOR");
    });

    it("keeps updatedBy for employees and administrators", async () => {
      for (const actor of [ana, admin]) {
        for (const result of [await business.getById("CAT", actor), (await business.getAll({} as any, actor))[0]] as any[]) {
          expect(instanceToPlain(result).latestMeasurements[0]).toMatchObject({ recordedBy: "EMP", updatedBy: "EDITOR" });
        }
      }
    });
  });
});

describe("Animal species/breed changes and approval (B2, decision 26)", () => {
  const actor = (flags: Partial<Actor>): Actor => ({ id: "X", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
  const owner = actor({ id: "OWNER", isClient: true });
  const vet = actor({ id: "VET", isEmployee: true, employeeId: "E-VET" });
  const receptionist = actor({ id: "REC", isEmployee: true, employeeId: "E-REC" });
  const admin = actor({ id: "ADM", isAdmin: true });
  let animals: any, stored: any, business: AnimalBusinessService, qualifications: any;

  beforeEach(() => {
    stored = { id: "CAT", name: "Mia", speciesId: "S-1", breedId: null, isVerified: true, owner: { id: "OWNER" } };
    // The transaction manager: update and confirm lock the animal row and write through it.
    animals = { findOne: jest.fn(async () => ({ ...stored, owner: { ...stored.owner } })), save: jest.fn(async (_entity: unknown, row: any) => row) };
    const manager = { findOne: animals.findOne, save: jest.fn(async (row: any) => animals.save(AnimalEntity, row)) };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    const species = { getById: jest.fn(async (id: string) => ({ id, name: id })), findByName: jest.fn() };
    const measurements = { latest: jest.fn(async () => ({ weight: null, height: null, latestMeasurements: [] })) };
    qualifications = { isVeterinarian: jest.fn(async (who: Actor) => who.employeeId === "E-VET") };
    business = new AnimalBusinessService({} as any, {} as any, species as any, {} as any, new PersistenceService(), measurements as any, {} as any, dataSource as any, qualifications);
  });

  const lockedFirst = () => {
    expect(animals.findOne.mock.calls[0]).toEqual([AnimalEntity, { where: { id: "CAT" }, lock: { mode: "pessimistic_write" } }]);
  };

  const change = (who: Actor, speciesId = "S-2") => business.update("CAT", { speciesId } as any, who) as Promise<any>;

  it("lets the owner change the species (no 403) and leaves the animal unverified until approved", async () => {
    await expect(change(owner)).resolves.toMatchObject({ speciesId: "S-2", isVerified: false });
  });

  it("leaves the animal unverified after a change by a non-veterinarian employee", async () => {
    await expect(change(receptionist)).resolves.toMatchObject({ speciesId: "S-2", isVerified: false });
    expect(qualifications.isVeterinarian).toHaveBeenCalledWith(receptionist, expect.anything());
    lockedFirst();
  });

  it("applies a change by a veterinarian or an administrator directly (verified)", async () => {
    stored.isVerified = false;
    await expect(change(vet)).resolves.toMatchObject({ speciesId: "S-2", isVerified: true });
    await expect(change(admin)).resolves.toMatchObject({ isVerified: true });
  });

  it("treats a veterinarian changing their own animal as a client (unverified)", async () => {
    stored.owner = { id: "VET" };
    await expect(change(vet)).resolves.toMatchObject({ isVerified: false });
  });

  it("keeps the verification when the species sent is the current one (case-insensitive)", async () => {
    await expect(change(owner, "s-1")).resolves.toMatchObject({ isVerified: true });
    expect(qualifications.isVeterinarian).not.toHaveBeenCalled();
  });

  it("lets a veterinarian or an administrator verify, and refuses receptionists and clients (403)", async () => {
    stored.isVerified = false;
    await expect(business.confirm("CAT", vet)).resolves.toMatchObject({ isVerified: true });
    await expect(business.confirm("CAT", admin)).resolves.toMatchObject({ isVerified: true });
    animals.save.mockClear();
    await expect(business.confirm("CAT", receptionist)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.confirm("CAT", owner)).rejects.toBeInstanceOf(ForbiddenException);
    stored.owner = { id: "VET" };
    await expect(business.confirm("CAT", vet)).rejects.toBeInstanceOf(ForbiddenException);
    expect(animals.save).not.toHaveBeenCalled();
  });

  it("locks the animal before approving it (serializes with a concurrent species/breed change)", async () => {
    stored.isVerified = false;
    await business.confirm("CAT", vet);
    lockedFirst();
    expect(animals.findOne.mock.invocationCallOrder[0]).toBeLessThan(qualifications.isVeterinarian.mock.invocationCallOrder[0]);
    expect(animals.findOne.mock.invocationCallOrder[1]).toBeLessThan(animals.save.mock.invocationCallOrder[0]);
  });

  it("refuses (409 ANIMAL_DATA_CHANGED) when the reviewed species/breed no longer match, and approves when they do", async () => {
    stored = { ...stored, isVerified: false, speciesId: "S-2", breedId: "B-2" };
    await expect(business.confirm("CAT", vet, { expectedSpeciesId: "S-1" })).rejects.toMatchObject({
      status: 409, response: { code: "ANIMAL_DATA_CHANGED", speciesId: "S-2", breedId: "B-2" },
    });
    await expect(business.confirm("CAT", vet, { expectedSpeciesId: "s-2", expectedBreedId: null })).rejects.toBeInstanceOf(ConflictException);
    expect(animals.save).not.toHaveBeenCalled();
    await expect(business.confirm("CAT", vet, { expectedSpeciesId: "s-2", expectedBreedId: "b-2" })).resolves.toMatchObject({ isVerified: true });
    // Without expectations (no body) the contract is unchanged.
    await expect(business.confirm("CAT", admin)).resolves.toMatchObject({ isVerified: true });
  });
});

describe("Animal soft delete with open activity (B1)", () => {
  let manager: any, open: any[], visits: any[], business: AnimalBusinessService, params: any;

  beforeEach(() => {
    open = [];
    visits = [];
    params = {};
    manager = {
      findOne: jest.fn(async () => ({ id: "CAT" })),
      find: jest.fn(async () => visits),
      softDelete: jest.fn(),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        qb.select = qb.orderBy = qb.addOrderBy = () => qb;
        qb.where = qb.andWhere = (_sql: string, values?: object) => (Object.assign(params, values), qb);
        qb.getMany = async () => open;
        return qb;
      }),
    };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    business = new AnimalBusinessService({} as any, {} as any, {} as any, {} as any, new PersistenceService(), {} as any, {} as any, dataSource as any, {} as any);
  });

  it("refuses (409) with the ids of open reservations and IN_PROGRESS visits, locking the animal first", async () => {
    open = [{ id: "R-1", status: ReservationStatus.PENDING, startAt: new Date() }, { id: "R-2", status: ReservationStatus.CONFIRMED, startAt: new Date() }];
    visits = [{ id: "V-1" }];
    const error = await business.delete("CAT").catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: "ANIMAL_HAS_OPEN_ACTIVITY", reservationIds: ["R-1", "R-2"], clinicalVisitIds: ["V-1"] });
    expect(manager.findOne).toHaveBeenCalledWith(AnimalEntity, { where: { id: "CAT" }, lock: { mode: "pessimistic_write" } });
    expect(manager.find).toHaveBeenCalledWith(ClinicalVisitEntity, expect.objectContaining({ where: { animalId: "CAT", status: ClinicalVisitStatus.IN_PROGRESS } }));
    expect(params).toMatchObject({ value: "CAT", openStatuses: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] });
    expect(manager.softDelete).not.toHaveBeenCalled();
    open = [];
    await expect(business.delete("CAT")).rejects.toMatchObject({ response: { reservationIds: [], clinicalVisitIds: ["V-1"] } });
  });

  it("soft-deletes when nothing is open, and returns 404 for a missing or already deleted animal", async () => {
    await expect(business.delete("CAT")).resolves.toMatchObject({ statusCode: 200 });
    expect(manager.softDelete).toHaveBeenCalledWith(AnimalEntity, { id: "CAT" });
    manager.findOne.mockResolvedValue(null);
    await expect(business.delete("CAT")).rejects.toMatchObject({ status: 404 });
  });
});
