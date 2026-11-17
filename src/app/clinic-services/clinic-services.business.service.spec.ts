import { BadRequestException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { PersistenceService } from "../core/persistence/persistence.service";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ClinicServicesBusinessService } from "./clinic-services.business.service";
import { CreateClinicServiceDto, ListClinicServicesQueryDto, UpdateClinicServiceDto } from "./dto/clinic-service.dto";
import { ClinicServiceEntity } from "./entities/clinic-service.entity";
import { EmployeeServiceEntity } from "./entities/employee-service.entity";

const actor = (flags: Partial<Actor>): Actor => ({ id: "X", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
const admin = actor({ id: "ADM", isAdmin: true });
const vet = actor({ id: "U-E-1", isEmployee: true, employeeId: "E-1" });
const client = actor({ id: "CLI", isClient: true });
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });

describe("Clinic services catalog", () => {
  let row: any, repository: any, qualifications: any, manager: any, business: ClinicServicesBusinessService;
  let counts: { reservations: number; qualifications: number };

  beforeEach(() => {
    row = { id: "S-1", code: "CONSULTATION", name: "Consultation", description: null, durationMinutes: 30, isActive: true, createdAt: new Date(0), updatedAt: new Date(0) };
    counts = { reservations: 0, qualifications: 0 };
    repository = {
      find: jest.fn(async () => [row]),
      findOneBy: jest.fn(async ({ id }: any) => (id === row.id ? { ...row } : null)),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: any) => ({ id: "S-NEW", createdAt: new Date(0), updatedAt: new Date(0), ...value })),
    };
    qualifications = { find: jest.fn(async () => []) };
    manager = {
      findOne: jest.fn(async (_entity: unknown, { where }: any) => (where.id === row.id ? { ...row } : null)),
      count: jest.fn(async (entity: unknown) => (entity === ReservationEntity ? counts.reservations : entity === EmployeeServiceEntity ? counts.qualifications : 0)),
      save: jest.fn(async (value: unknown) => value),
      delete: jest.fn(async () => undefined),
    };
    const dataSource = { transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)) };
    business = new ClinicServicesBusinessService(repository, qualifications, new PersistenceService(), dataSource as any);
  });

  it("lists only active services for non-administrators and lets administrators filter by isActive", async () => {
    await business.getAll({ skip: 0, take: 50, isActive: false } as any, client);
    expect(repository.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true } }));
    await business.getAll({ skip: 0, take: 50 } as any, vet);
    expect(repository.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: true } }));
    await business.getAll({ skip: 0, take: 50 } as any, admin);
    expect(repository.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
    await business.getAll({ skip: 0, take: 50, isActive: false } as any, admin);
    expect(repository.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: false }, order: { name: "ASC", id: "ASC" } }));
  });

  it("hides inactive services from non-administrators (404) and serializes the catalog fields", async () => {
    await expect(business.getById("S-1", client)).resolves.toEqual({
      id: "S-1", code: "CONSULTATION", name: "Consultation", description: null, durationMinutes: 30, isActive: true, createdAt: new Date(0), updatedAt: new Date(0),
    });
    row.isActive = false;
    await expect(business.getById("S-1", client)).rejects.toMatchObject({ status: 404 });
    await expect(business.getById("S-1", admin)).resolves.toMatchObject({ isActive: false });
    await expect(business.getById("S-9", admin)).rejects.toMatchObject({ status: 404 });
  });

  it("creates active services by default with a normalized code", async () => {
    await expect(business.create({ code: " consultation_2 ", name: " Consulta ", durationMinutes: 45 } as any)).resolves.toMatchObject({ code: "CONSULTATION_2", name: "Consulta", durationMinutes: 45, isActive: true });
    await expect(business.create({ code: "X", name: "X", durationMinutes: 7 } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(business.create({ code: "1X", name: "X", durationMinutes: 30 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates the DTO: duration 5..1440 and a multiple of 5, uppercase code, no price", async () => {
    const body = { code: "VACCINATION", name: "Vaccination", durationMinutes: 15 };
    await expect(pipe.transform(body, { type: "body", metatype: CreateClinicServiceDto })).resolves.toBeInstanceOf(CreateClinicServiceDto);
    for (const durationMinutes of [0, 3, 12, 1445, 1440.5, "30"]) {
      await expect(pipe.transform({ ...body, durationMinutes }, { type: "body", metatype: CreateClinicServiceDto })).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(pipe.transform({ ...body, durationMinutes: 1440 }, { type: "body", metatype: CreateClinicServiceDto })).resolves.toMatchObject({ durationMinutes: 1440 });
    await expect(pipe.transform({ ...body, price: 10 }, { type: "body", metatype: CreateClinicServiceDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ durationMinutes: 20 }, { type: "body", metatype: UpdateClinicServiceDto })).resolves.toMatchObject({ durationMinutes: 20 });
    await expect(pipe.transform({ isActive: "false" }, { type: "query", metatype: ListClinicServicesQueryDto })).resolves.toMatchObject({ isActive: false });
  });

  it("trims the description, rejects blank text (400) and accepts null to clear it", async () => {
    const body = { code: "VACCINATION", name: "Vaccination", durationMinutes: 15 };
    await expect(pipe.transform({ ...body, description: "  Annual shots  " }, { type: "body", metatype: CreateClinicServiceDto })).resolves.toMatchObject({ description: "Annual shots" });
    for (const description of ["", "   "]) {
      await expect(pipe.transform({ ...body, description }, { type: "body", metatype: CreateClinicServiceDto })).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipe.transform({ description }, { type: "body", metatype: UpdateClinicServiceDto })).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(pipe.transform({ description: null }, { type: "body", metatype: UpdateClinicServiceDto })).resolves.toMatchObject({ description: null });
  });

  it("updates under the service row lock; the code is immutable (409)", async () => {
    await expect(business.update("S-1", { durationMinutes: 60, isActive: false, description: "d" })).resolves.toMatchObject({ durationMinutes: 60, isActive: false, description: "d" });
    expect(manager.findOne).toHaveBeenCalledWith(ClinicServiceEntity, { where: { id: "S-1" }, lock: { mode: "pessimistic_write" } });
    await expect(business.update("S-1", { code: "CONSULTATION" })).resolves.toBeDefined();
    await expect(business.update("S-1", { code: "OTHER" })).rejects.toMatchObject({ status: 409, response: { message: "Service codes cannot change; create a new service instead" } });
    await expect(business.update("S-9", { name: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("deletes only a service never referenced; otherwise 409 IN_USE with the counts in the message", async () => {
    await business.delete("S-1");
    expect(manager.delete).toHaveBeenCalledWith(ClinicServiceEntity, { id: "S-1" });
    manager.delete.mockClear();
    counts = { reservations: 2, qualifications: 1 };
    await expect(business.delete("S-1")).rejects.toMatchObject({
      status: 409, response: { errorMetadata: "IN_USE", message: "The service is referenced by 2 reservations and 1 employee qualification; deactivate it instead of deleting it" },
    });
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.count).toHaveBeenCalledWith(ReservationEntity, { where: { serviceId: "S-1" } });
  });

  it("gives a reference committed concurrently (FK violation 547) the same readable 409", async () => {
    manager.delete.mockRejectedValue({ number: 547, message: "The DELETE statement conflicted with the REFERENCE constraint \"fk_vc_reservations_service\"." });
    await expect(business.delete("S-1")).rejects.toMatchObject({ status: 409, response: { errorMetadata: "IN_USE", message: expect.stringContaining("deactivate it instead") } });
  });

  it("lists qualified employees bookable today for staff only, projected per caller", async () => {
    const employee = (id: string, name: string, extra: object = {}) => ({
      id, userId: `U-${id}`, isAvailableForBookings: true, terminationDate: null,
      user: { id: `U-${id}`, name, isActive: true, deletedAt: null, profilePictureUrl: null, email: `${id}@x.pt` }, ...extra,
    });
    qualifications.find.mockResolvedValue([
      { employee: employee("E-2", "Zé") }, { employee: employee("E-1", "Ana") },
      { employee: employee("E-3", "Off", { isAvailableForBookings: false }) }, { employee: employee("E-4", "Gone", { terminationDate: "2000-01-01" }) },
    ]);
    await expect(business.getEmployees("S-1", vet)).resolves.toEqual([
      { id: "E-1", name: "Ana", profilePictureUrl: null }, { id: "E-2", name: "Zé", profilePictureUrl: null },
    ]);
    expect(qualifications.find).toHaveBeenCalledWith({ where: { serviceId: "S-1" }, relations: { employee: { user: true } } });
    const [first]: any[] = await business.getEmployees("S-1", admin);
    expect(first).toMatchObject({ id: "E-1", userId: "U-E-1", user: { email: "E-1@x.pt" } });
    await expect(business.getEmployees("S-1", client)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
