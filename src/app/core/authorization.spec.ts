import { ForbiddenException } from "@nestjs/common";
import { Actor, isStaff, requireAdmin, requireAnimalAccess, requireStaff } from "./authorization";

const actor = (flags: Partial<Actor>): Actor => ({ id: "ANA", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });

describe("Access derives from the professional path, never from CLIENT", () => {
  it("gives an active employee who is also a client professional access", () => {
    const ana = actor({ isEmployee: true, isClient: true, employeeId: "E-1" });
    expect(isStaff(ana)).toBe(true);
    expect(() => requireAnimalAccess(ana, "OTHER")).not.toThrow();
    expect(() => requireAnimalAccess(ana, "ana")).not.toThrow();
  });

  it("limits a client (including one whose employee profile is no longer active) to their own data", () => {
    for (const client of [actor({ isClient: true }), actor({ isClient: true, employeeId: "E-1" })]) {
      expect(isStaff(client)).toBe(false);
      expect(() => requireAnimalAccess(client, "ana")).not.toThrow();
      expect(() => requireAnimalAccess(client, "OTHER")).toThrow(ForbiddenException);
    }
  });

  it("requires staff (administrator or active employee) and administrator explicitly, never CLIENT", () => {
    for (const staff of [actor({ isAdmin: true }), actor({ isEmployee: true, isClient: true, employeeId: "E-1" })]) {
      expect(() => requireStaff(staff)).not.toThrow();
    }
    for (const nonStaff of [actor({ isClient: true }), actor({ isClient: true, employeeId: "E-1" })]) {
      expect(() => requireStaff(nonStaff, "Staff only")).toThrow(new ForbiddenException("Staff only"));
    }
    expect(() => requireAdmin(actor({ isAdmin: true }))).not.toThrow();
    expect(() => requireAdmin(actor({ isEmployee: true, employeeId: "E-1" }))).toThrow(ForbiddenException);
    expect(() => requireAdmin(actor({ isClient: true }))).toThrow(ForbiddenException);
  });
});
