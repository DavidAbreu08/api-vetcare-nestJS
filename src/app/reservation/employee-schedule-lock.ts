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
 * Takes an exclusive, transaction-owned sp_getapplock on the employee's schedule. It is released on commit or
 * rollback, so the availability check and the write that follow it are atomic for that employee.
 * Requires an active transaction (LockOwner = 'Transaction'). Return codes: 0/1 granted; -1 timeout,
 * -2 cancelled, -3 deadlock victim (409, retry); -999 or anything else (503).
 */
export async function acquireEmployeeScheduleLock(manager: EntityManager, employeeId: string, timeoutMs = EMPLOYEE_SCHEDULE_LOCK_TIMEOUT_MS): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive) throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, ReservationMessages.SCHEDULE_LOCK_UNAVAILABLE);
  const rows: { result: number }[] = await manager.query(
    `DECLARE @result int;
     EXEC @result = sp_getapplock @Resource = @0, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @1;
     SELECT @result AS [result];`,
    [employeeScheduleResource(employeeId), timeoutMs],
  );
  const result = Number(rows?.[0]?.result);
  if (result === 0 || result === 1) return;
  if (result === -1 || result === -2 || result === -3) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.SCHEDULE_BUSY, undefined, { code: "SCHEDULE_BUSY" });
  throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, ReservationMessages.SCHEDULE_LOCK_UNAVAILABLE);
}
