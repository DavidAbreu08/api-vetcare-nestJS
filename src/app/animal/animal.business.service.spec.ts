import { ForbiddenException } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { PersistenceService } from "../core/persistence/persistence.service";
import { SystemRole } from "../core/enums/system-role.enum";
import { AnimalBusinessService } from "./animal.business.service";
import { instanceToPlain } from "class-transformer";
import { AnimalMeasurementEntity } from "../animal-measurements/entities/animal-measurement.entity";

const ana: Actor = { id: "ANA", roleIds: ["employee", "client"], isAdmin: false, isEmployee: true, isClient: true, employeeId: "E-ANA" };
const clientOnly: Actor = { ...ana, isEmployee: false, employeeId: null, roleIds: ["client"] };

describe("Animals of an account that is both client and employee", () => {
  let animals: any, users: any, membership: any, measurements: any, business: AnimalBusinessService;

  beforeEach(() => {
    animals = { find: jest.fn(async () => []), create: jest.fn((row: unknown) => row), save: jest.fn(async (row: any) => ({ id: "CAT", ...row })) };
    users = { findOneBy: jest.fn(async ({ id }: any) => ({ id, name: id, email: `${id}@x.pt` })) };
    // Ana holds CLIENT (and EMPLOYEE): the owner check only asks for CLIENT.
    membership = { hasSystemRole: jest.fn(async (_id: string, role: SystemRole) => role === SystemRole.CLIENT) };
    const species = { getById: jest.fn(async () => ({ id: "S-1", name: "Gato" })), findByName: jest.fn() };
    measurements = { latest: jest.fn(async () => ({ weight: null, height: null, latestMeasurements: [] })), latestMany: jest.fn(async () => new Map()) };
    business = new AnimalBusinessService(animals, users, species as any, {} as any, new PersistenceService(), measurements as any, membership);
  });

  it("accepts her as owner and registers her own animal unverified, like any client", async () => {
    const created: any = await business.create({ name: "Mia", color: "preto", sex: "F", speciesId: "S-1", ownerId: "ANA" } as any, ana);
    expect(membership.hasSystemRole).toHaveBeenCalledWith("ANA", SystemRole.CLIENT);
    expect(created).toMatchObject({ owner: { id: "ANA" }, isVerified: false });
  });

  it("verifies animals she registers for another client through the professional path", async () => {
    const created: any = await business.create({ name: "Rex", color: "castanho", sex: "M", speciesId: "S-1", ownerId: "BOB" } as any, ana);
    expect(created.isVerified).toBe(true);
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
