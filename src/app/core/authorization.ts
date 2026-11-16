import { ForbiddenException } from "@nestjs/common";

/**
 * Authenticated caller. roleIds are the caller's effective active role ids (lowercase);
 * the flags are derived from the system-role settings when the token is validated.
 */
export type Actor = {
  id: string;
  roleIds: string[];
  isAdmin: boolean;
  /**
   * Holds the EMPLOYEE_ROLE_ID role AND has an employee profile whose termination date is absent or
   * after today (clinic calendar). Without an active profile the EMPLOYEE role id is also dropped from roleIds.
   */
  isEmployee: boolean;
  isClient: boolean;
  employeeId: string | null;
};

/** SQL Server returns uniqueidentifier values in uppercase; compare ids case-insensitively. */
export function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function isStaff(actor: Actor): boolean {
  return actor.isAdmin || actor.isEmployee;
}

export function requireOwnerOrAdmin(actor: Actor, ownerId: string): void {
  if (!actor.isAdmin && !sameId(actor.id, ownerId)) {
    throw new ForbiddenException("Access denied");
  }
}

export function requireAnimalAccess(actor: Actor, ownerId: string): void {
  if (!isStaff(actor)) {
    requireOwnerOrAdmin(actor, ownerId);
  }
}
