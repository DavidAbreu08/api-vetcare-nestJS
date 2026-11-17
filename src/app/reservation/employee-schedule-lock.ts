import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";

import { EntityManager } from "typeorm";
import { normalizeId } from "../core/catalog";
import { ReservationMessages } from "./reservation.messages";

/** Maximum wait for another transaction changing the same employee's schedule. */
export const EMPLOYEE_SCHEDULE_LOCK_TIMEOUT_MS = 5000;

/** Application-lock resource serializing every schedule change of one employee (vc_employees.id). */
export function employeeScheduleResource(employeeId: string): string {
  return `vc_reservations:employee:${normalizeId(employeeId)}`;
}

/**
 * Application-lock resource of clinic-wide closures (vc_blocked_times rows with employee_id NULL). A global block takes
 * it Exclusive; every operation that occupies an employee's time takes it Shared (compatible with each other) BEFORE the
 * employee applock, so a closure and a confirmation never interleave between their checks and their writes.
 */
export const CLINIC_CLOSURES_RESOURCE = "vc_blocked_times:global";

type AppLockMode = "Shared" | "Exclusive";

/**
 * Transaction-owned sp_getapplock, released on commit or rollback. Requires an active transaction
 * (LockOwner = 'Transaction'). Return codes: 0/1 granted; -1 timeout, -2 cancelled, -3 deadlock victim (409, retry);
 * -999 or anything else (503). The mode is a fixed literal (never user input).
 */
async function acquireAppLock(manager: EntityManager, resource: string, mode: AppLockMode, timeoutMs: number, busyMessage: string): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive) throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, ReservationMessages.SCHEDULE_LOCK_UNAVAILABLE);
  const rows: { result: number }[] = await manager.query(
    `DECLARE @result int;
     EXEC @result = sp_getapplock @Resource = @0, @LockMode = '${mode === "Shared" ? "Shared" : "Exclusive"}', @LockOwner = 'Transaction', @LockTimeout = @1;
     SELECT @result AS [result];`,
    [resource, timeoutMs],
  );
  const result = Number(rows?.[0]?.result);
  if (result === 0 || result === 1) return;
  if (result === -1 || result === -2 || result === -3) throw applicationError(ErrorMetadata.CONFLICT, busyMessage, undefined, { code: "SCHEDULE_BUSY" });
  throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, ReservationMessages.SCHEDULE_LOCK_UNAVAILABLE);
}

/**
 * Takes an exclusive, transaction-owned sp_getapplock on the employee's schedule. It is released on commit or
 * rollback, so the availability check and the write that follow it are atomic for that employee.
 */
export function acquireEmployeeScheduleLock(manager: EntityManager, employeeId: string, timeoutMs = EMPLOYEE_SCHEDULE_LOCK_TIMEOUT_MS): Promise<void> {
  return acquireAppLock(manager, employeeScheduleResource(employeeId), "Exclusive", timeoutMs, ReservationMessages.SCHEDULE_BUSY);
}

/**
 * Clinic-closure applock (CLINIC_CLOSURES_RESOURCE): Exclusive for creating/changing a global block, Shared for every
 * flow that occupies an employee's time. Always taken before any employee applock (fixed order global -> employee), and
 * applocks are the last locks of every chain, so no cycle can form.
 */
export function acquireClinicClosuresLock(manager: EntityManager, mode: AppLockMode, timeoutMs = EMPLOYEE_SCHEDULE_LOCK_TIMEOUT_MS): Promise<void> {
  return acquireAppLock(manager, CLINIC_CLOSURES_RESOURCE, mode, timeoutMs, ReservationMessages.CLOSURES_BUSY);
}
