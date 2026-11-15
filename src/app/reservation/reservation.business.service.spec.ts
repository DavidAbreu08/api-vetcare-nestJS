import { BadRequestException } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { PersistenceService } from "../core/persistence/persistence.service";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { ReservationBusinessService } from "./reservation.business.service";

// Ana: veterinarian (active employee profile) and client with her own cat.
const ana: Actor = { id: "ANA", roleIds: ["employee", "client"], isAdmin: false, isEmployee: true, isClient: true, employeeId: "E-ANA" };
const dto = { animalId: "CAT", date: "2030-01-07", timeStart: "10:00", timeEnd: "10:30", reason: "check-up" } as any;

describe("Reservations for an account that is both client and employee", () => {
  let users: any, animals: any, reservations: any, membership: any, employees: any, business: ReservationBusinessService;

  beforeEach(() => {
    const accounts: Record<string, any> = {
      ANA: { id: "ANA", name: "Ana", email: "ana@x.pt", isActive: true },
      BOB: { id: "BOB", name: "Bob", email: "bob@x.pt", isActive: true },
    };
    const pets: Record<string, any> = { CAT: { id: "CAT", owner: { id: "ana" } }, DOG: { id: "DOG", owner: { id: "BOB" } } };
    users = { findOne: jest.fn(async ({ where }: any) => accounts[where.id] ?? null) };
    animals = { findOne: jest.fn(async ({ where }: any) => pets[where.id] ?? null) };
    reservations = {
      create: jest.fn((row: unknown) => row), save: jest.fn(async (row: any) => ({ id: "R-1", ...row })),
      createQueryBuilder: jest.fn(() => {
        const qb: any = { where: () => qb, andWhere: () => qb, getCount: async () => 0 };
        return qb;
      }),
    };
    membership = { hasSystemRole: jest.fn(async () => true) };
    employees = { findBookableUser: jest.fn(async (id: string) => accounts[id] ?? null) };
    const timeUtils = { combineDateAndTime: jest.fn(() => new Date(0)) };
    const email = { sendReservationCreatedEmail: jest.fn(async () => undefined) };
    business = new ReservationBusinessService(new PersistenceService(), timeUtils as any, email as any, reservations,
      users, animals, { find: jest.fn(async () => []) } as any, membership, employees);
  });

  it("books her own animal as a client: pending, not self-assigned, client is herself", async () => {
    await business.createReservation(dto, ana);
    expect(reservations.create).toHaveBeenCalledWith(expect.objectContaining({
      client: expect.objectContaining({ id: "ANA" }), employee: null, status: ReservationStatus.PENDING,
    }));
    expect(employees.findBookableUser).not.toHaveBeenCalled();
  });

  it("treats an ownerId equal to herself as a personal booking", async () => {
    await business.createReservation({ ...dto, ownerId: "ana" }, ana);
    expect(reservations.create).toHaveBeenCalledWith(expect.objectContaining({ employee: null, status: ReservationStatus.PENDING }));
    expect(membership.hasSystemRole).not.toHaveBeenCalled();
  });

  it("books for another client through the professional path: self-assigned and confirmed", async () => {
    await business.createReservation({ ...dto, animalId: "DOG", ownerId: "BOB" }, ana);
    expect(reservations.create).toHaveBeenCalledWith(expect.objectContaining({
      client: expect.objectContaining({ id: "BOB" }), employee: expect.objectContaining({ id: "ANA" }), status: ReservationStatus.CONFIRMED,
    }));
  });

  it("gives the CLIENT role nothing extra: a client-only account cannot book for another client", async () => {
    const client: Actor = { ...ana, isEmployee: false, employeeId: null, roleIds: ["client"] };
    await expect(business.createReservation({ ...dto, animalId: "DOG", ownerId: "BOB" }, client)).rejects.toBeInstanceOf(BadRequestException);
    expect(reservations.save).not.toHaveBeenCalled();
  });

  it("requires the CLIENT role for a personal booking", async () => {
    const employeeOnly: Actor = { ...ana, isClient: false, roleIds: ["employee"] };
    await expect(business.createReservation(dto, employeeOnly)).rejects.toBeInstanceOf(BadRequestException);
    expect(reservations.save).not.toHaveBeenCalled();
  });
});
