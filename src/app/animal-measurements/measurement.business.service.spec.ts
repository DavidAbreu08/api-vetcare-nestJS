import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { validate } from "class-validator";
import { Role } from "../core/enums/role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { MeasurementBusinessService } from "./measurement.business.service";
import { CreateMeasurementDto } from "./dto/create-measurement.dto";
const actor = { id: "owner", role: Role.CLIENTE };
describe("Typed measurement policies", () => {
 let repo: any, animals: any, types: any, business: MeasurementBusinessService;
 beforeEach(() => {
  repo = { findOne: jest.fn(), create: jest.fn(value => value), save: jest.fn(async value => value), remove: jest.fn() };
  animals = { findOne: jest.fn().mockResolvedValue({ owner: { id: "owner" } }) };
  types = { requireActive: jest.fn().mockResolvedValue({ id: "type", code: "TEMPERATURE" }) };
  business = new MeasurementBusinessService(repo, animals, new PersistenceService(), types);
 });
 it("records signed temperature with authenticated author and ignores spoofed properties", async () => {
  const row = await business.create({ animalId: "animal", measurementTypeId: "type", value: -1.123456, recordedBy: "spoof" } as any, actor);
  expect(row).toMatchObject({ recordedBy: "owner", value: "-1.123456", measurementTypeId: "type" });
  expect(row.measuredAt).toBeInstanceOf(Date);
 });
 it("accepts custom signed types without changing the schema", async () => {
  types.requireActive.mockResolvedValue({ id: "custom", code: "CUSTOM_SCORE" });
  expect((await business.create({ animalId: "a", measurementTypeId: "custom", value: -2 }, actor)).value).toBe("-2.000000");
 });
 it("preserves original author and timestamp on partial updates, including unknown legacy metadata", async () => {
  repo.findOne.mockResolvedValue({ id: "m", animalId: "animal", measurementTypeId: "type", value: "12.000000", recordedBy: null, measuredAt: null });
  const row = await business.update("m", { notes: "reviewed" }, actor);
  expect(row).toMatchObject({ value: "12.000000", recordedBy: null, measuredAt: null });
  expect(types.requireActive).not.toHaveBeenCalled();
 });
 it("requires an active target type for value or type changes", async () => {
  repo.findOne.mockResolvedValue({ animalId: "a", measurementTypeId: "old", value: "-2.000000" });
  types.requireActive.mockRejectedValue(new BadRequestException());
  await expect(business.update("m", { value: 1 }, actor)).rejects.toBeInstanceOf(BadRequestException);
  expect(repo.save).not.toHaveBeenCalled();
 });
 it("rejects nulls, overflow, rounding, non-finite values and negative weight", async () => {
  for (const value of [null, NaN, Infinity, 1000000000, 1.0000001]) await expect(business.create({ animalId: "a", measurementTypeId: "t", value } as any, actor)).rejects.toBeInstanceOf(BadRequestException);
  types.requireActive.mockResolvedValue({ id: "t", code: "WEIGHT" });
  await expect(business.create({ animalId: "a", measurementTypeId: "t", value: -1 }, actor)).rejects.toBeInstanceOf(BadRequestException);
 });
 it("prevents access to another owner and soft-deleted animals", async () => {
  repo.findOne.mockResolvedValue({ animalId: "animal" });
  animals.findOne.mockResolvedValueOnce({ owner: { id: "other" } }).mockResolvedValueOnce(null);
  await expect(business.get("m", actor)).rejects.toBeInstanceOf(ForbiddenException);
  await expect(business.get("m", actor)).rejects.toBeInstanceOf(NotFoundException);
 });
 it("rejects future, timezone-less and null times", async () => {
  for (const measuredAt of ["2999-01-01T00:00:00Z", "2025-01-01T12:00:00", null]) await expect(business.create({ animalId: "a", measurementTypeId: "t", value: 1, measuredAt } as any, actor)).rejects.toBeInstanceOf(BadRequestException);
 });
 it("validates typed HTTP inputs", async () => {
  const dto = Object.assign(new CreateMeasurementDto(), { animalId: "bad", measurementTypeId: null, value: 1.1234567, measuredAt: "2025-01-01T12:00:00" });
  expect((await validate(dto)).map(error => error.property)).toEqual(expect.arrayContaining(["animalId", "measurementTypeId", "value", "measuredAt"]));
 });
 it("ranks all types independently in one batch and preserves inactive history", async () => {
  const q: any = {};
  for (const name of ["select", "addSelect", "where", "andWhere", "innerJoin", "leftJoinAndSelect", "setParameters"]) q[name] = jest.fn(() => q);
  q.getQuery = jest.fn(() => "SELECT ranked"); q.getParameters = jest.fn(() => ({}));
  const rows = [{ animalId: "a", value: "12.125000", measurementType: { code: "WEIGHT", isActive: false } }, { animalId: "a", value: "30.500000", measurementType: { code: "HEIGHT" } }];
  q.getMany = jest.fn().mockResolvedValue(rows); repo.createQueryBuilder = jest.fn(() => q);
  const result = await business.latestMany(["a", "b"]);
  expect(result.get("a")).toEqual({ weight: 12.125, height: 30.5, latestMeasurements: rows });
  expect(result.get("b")).toEqual({ weight: null, height: null, latestMeasurements: [] });
  expect(q.addSelect).toHaveBeenCalledWith(expect.stringContaining("PARTITION BY measurement.animalId, measurement.measurementTypeId"), "position");
  expect(q.andWhere).toHaveBeenCalledWith(expect.stringContaining("measurement.measuredAt <= :now"), expect.any(Object));
  expect(q.getMany).toHaveBeenCalledTimes(1);
 });
 it("chunks batches below SQL Server parameter limits", async () => {
  const latest = jest.spyOn(business, "latestMany");
  const q: any = {};
  for (const name of ["select", "addSelect", "where", "andWhere", "innerJoin", "leftJoinAndSelect", "setParameters"]) q[name] = () => q;
  q.getQuery = () => "SELECT ranked"; q.getParameters = () => ({}); q.getMany = jest.fn().mockResolvedValue([]); repo.createQueryBuilder = () => q;
  expect((await business.latestMany(Array.from({ length: 2101 }, (_, i) => String(i)))).size).toBe(2101);
  expect(q.getMany).toHaveBeenCalledTimes(3);
  expect(latest).toHaveBeenCalledTimes(4);
 });
});
