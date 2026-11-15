import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { validate } from "class-validator";
import { Role } from "../core/enums/role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { MeasurementBusinessService } from "./measurement.business.service";
import { CreateMeasurementDto } from "./dto/create-measurement.dto";

const actor = { id: "owner", role: Role.CLIENTE };
describe("Measurement business policies", () => {
  let repo: any, animals: any, business: MeasurementBusinessService;
  beforeEach(() => {
    repo = { findOneBy: jest.fn(), create: jest.fn(value => value), save: jest.fn(async value => value), remove: jest.fn() };
    animals = { findOne: jest.fn().mockResolvedValue({ owner: { id: "owner" } }) };
    business = new MeasurementBusinessService(repo, animals, new PersistenceService());
  });
  it("records weight only with authenticated author and rejects empty observations", async () => {
    const row = await business.create({ animalId: "animal", weight: 0 }, actor);
    expect(row.userId).toBe(actor.id);
    expect(row.measuredAt).toBeInstanceOf(Date);
    await expect(business.create({ animalId: "animal", weight: null, height: null }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
  it("retains omitted dimensions and author on PATCH", async () => {
    repo.findOneBy.mockResolvedValue({ id: "m", animalId: "animal", weight: 12, height: 30, userId: "original" });
    const row = await business.update("m", { height: 31 }, actor);
    expect(row).toMatchObject({ weight: 12, height: 31, userId: "original" });
  });
  it("allows clearing one dimension but rejects clearing the final dimension", async () => {
    repo.findOneBy.mockResolvedValue({ id: "m", animalId: "animal", weight: 12, height: null });
    await expect(business.update("m", { weight: null }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("prevents access to another owner's measurement and soft-deleted animals", async () => {
    repo.findOneBy.mockResolvedValue({ animalId: "animal" });
    animals.findOne.mockResolvedValueOnce({ owner: { id: "other" } }).mockResolvedValueOnce(null);
    await expect(business.get("m", actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(business.get("m", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("rejects future and explicit null timestamps", async () => {
    await expect(business.create({ animalId: "a", height: 1, measuredAt: "2999-01-01T00:00:00Z" }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(business.create({ animalId: "a", height: 1, measuredAt: null as any }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
  it("validates decimal precision, height range and timezone", async () => {
    const dto = Object.assign(new CreateMeasurementDto(), { animalId: "ed7124e2-7399-43cf-b2fa-547eb73854d8", height: 10000, weight: 1.1234, measuredAt: "2025-01-01T12:00:00" });
    const errors = await validate(dto);
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(["height", "weight", "measuredAt"]));
  });
  it("queries latest weight and height independently, with deterministic ordering and future exclusion", async () => {
    const builders: any[] = [];
    repo.createQueryBuilder = jest.fn(() => {
      const q: any = {};
      for (const method of ["where", "andWhere", "orderBy", "addOrderBy"]) q[method] = jest.fn(() => q);
      q.getOne = jest.fn().mockResolvedValue(builders.length === 0 ? { weight: "12.125", height: null } : { weight: null, height: "30.50" });
      builders.push(q); return q;
    });
    expect(await business.latest("animal")).toEqual({ weight: 12.125, height: 30.5 });
    expect(builders[0].andWhere).toHaveBeenCalledWith("measurement.weight IS NOT NULL");
    expect(builders[1].andWhere).toHaveBeenCalledWith("measurement.height IS NOT NULL");
    for (const q of builders) {
      expect(q.andWhere).toHaveBeenCalledWith(expect.stringContaining("measurement.measuredAt <= :now"), expect.any(Object));
      expect(q.orderBy).toHaveBeenCalledWith(expect.stringContaining("IS NULL"), "ASC");
      expect(q.addOrderBy).toHaveBeenCalledWith("measurement.id", "DESC");
    }
  });
});
