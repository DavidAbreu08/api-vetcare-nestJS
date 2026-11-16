import { ForbiddenException } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { PersistenceService } from "../core/persistence/persistence.service";
import { SystemRole } from "../core/enums/system-role.enum";
import { AnimalBusinessService } from "./animal.business.service";

const ana: Actor = { id: "ANA", roleIds: ["employee", "client"], isAdmin: false, isEmployee: true, isClient: true, employeeId: "E-ANA" };
const clientOnly: Actor = { ...ana, isEmployee: false, employeeId: null, roleIds: ["client"] };

describe("Animals of an account that is both client and employee", () => {
  let animals: any, users: any, membership: any, business: AnimalBusinessService;

  beforeEach(() => {
    animals = { find: jest.fn(async () => []), create: jest.fn((row: unknown) => row), save: jest.fn(async (row: any) => ({ id: "CAT", ...row })) };
    users = { findOneBy: jest.fn(async ({ id }: any) => ({ id, name: id, email: `${id}@x.pt` })) };
    // Ana holds CLIENT (and EMPLOYEE): the owner check only asks for CLIENT.
    membership = { hasSystemRole: jest.fn(async (_id: string, role: SystemRole) => role === SystemRole.CLIENT) };
    const species = { getById: jest.fn(async () => ({ id: "S-1", name: "Gato" })), findByName: jest.fn() };
    const measurements = { latest: jest.fn(async () => ({})), latestMany: jest.fn(async () => new Map()) };
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
});
