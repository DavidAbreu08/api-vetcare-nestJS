import { BadRequestException, ConflictException } from "@nestjs/common";
import { PersistenceService } from "../core/persistence/persistence.service";
import { MeasurementTypeBusinessService } from "./measurement-type.business.service";
import { MeasurementTypeController } from "./measurement-type.controller";
import { MessagesHelper } from "../helpers/messages.helper";
import { SystemRole } from "../core/enums/system-role.enum";
describe("Configurable measurement types", () => {
 let repo: any, business: MeasurementTypeBusinessService;
 beforeEach(() => { repo = { findOneBy: jest.fn().mockResolvedValue({ id: "t", code: "CUSTOM", unit: "pts", isActive: true }), create: jest.fn(row => row), save: jest.fn(async row => row), remove: jest.fn() }; business = new MeasurementTypeBusinessService(repo, new PersistenceService()); });
 it("normalizes custom codes and trims names/units", async () => {
  expect(await business.create({ code: " custom_score ", name: " Score ", unit: " pts " })).toMatchObject({ code: "CUSTOM_SCORE", name: "Score", unit: "pts", isActive: true });
 });
 it("keeps every code/unit immutable while allowing activation and metadata edits", async () => {
  await expect(business.update("t", { code: "NEW" })).rejects.toBeInstanceOf(ConflictException);
  await expect(business.update("t", { unit: "other" })).rejects.toBeInstanceOf(ConflictException);
  expect(await business.update("t", { isActive: false, name: "New name" })).toMatchObject({ isActive: false, name: "New name" });
 });
 it("rejects inactive and null activation", async () => {
  await expect(business.requireActive(null as any)).rejects.toBeInstanceOf(BadRequestException);
  repo.findOneBy.mockResolvedValue({ isActive: false });
  await expect(business.requireActive("t")).rejects.toBeInstanceOf(BadRequestException);
  await expect(business.update("t", { isActive: null } as any)).rejects.toBeInstanceOf(BadRequestException);
 });
 it("translates duplicate and referenced-delete races into conflicts", async () => {
  repo.save.mockRejectedValue({ number: 2627 });
  await expect(business.create({ code: "CUSTOM", name: "C", unit: "u" })).rejects.toBeInstanceOf(ConflictException);
  repo.remove.mockRejectedValue({ number: 547 });
  await expect(business.delete("t")).rejects.toBeInstanceOf(ConflictException);
 });
 it("restricts every mutation to administrators", () => {
  for (const method of ["create", "update", "updatePartial", "delete"]) expect(Reflect.getMetadata(MessagesHelper.ROLES_KEY, MeasurementTypeController.prototype[method])).toEqual([SystemRole.ADMIN]);
  expect(Reflect.getMetadata(MessagesHelper.ROLES_KEY, MeasurementTypeController.prototype.getAll)).toBeUndefined();
 });
});
