import { applicationError } from "./exceptions/application-error";
import { ErrorMetadata } from "./enums/error-metadata.enum";

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

/** Administrators and active employees (the EMPLOYEE flag already requires an active employee profile). */
export function requireStaff(actor: Actor, message = "Access denied"): void {
  if (!isStaff(actor)) throw applicationError(ErrorMetadata.FORBIDDEN, message);
}

export function requireAdmin(actor: Actor, message = "Access denied"): void {
  if (!actor.isAdmin) throw applicationError(ErrorMetadata.FORBIDDEN, message);
}

export function requireOwnerOrAdmin(actor: Actor, ownerId: string): void {
  if (!actor.isAdmin && !sameId(actor.id, ownerId)) {
    throw applicationError(ErrorMetadata.FORBIDDEN, "Access denied");
  }
}

export function requireAnimalAccess(actor: Actor, ownerId: string): void {
  if (!isStaff(actor)) {
    requireOwnerOrAdmin(actor, ownerId);
  }
}
