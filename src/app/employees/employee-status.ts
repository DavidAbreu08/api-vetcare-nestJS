import { todayKey } from "../core/catalog";
import { CLINIC_POLICY } from "../reservation/reservation-policy";
import { UsersEntity } from "../users/entities/users.entity";
import { EmployeeEntity } from "./entities/employee.entity";

/** Clinic calendar date used for employment rules. */
export function clinicToday(): string {
  return todayKey(CLINIC_POLICY.timeZone);
}

/** An employee profile is active while its termination date is absent or in the future. */
export function isEmploymentActive(terminationDate: string | null | undefined, today = clinicToday()): boolean {
  return !terminationDate || terminationDate > today;
}

/** Active profile of an active account (may act clinically, e.g. be responsible for a visit). */
export function isActiveEmployee(employee: EmployeeEntity | null | undefined): employee is EmployeeEntity & { user: UsersEntity } {
  return !!employee?.user && employee.user.isActive && !employee.user.deletedAt && isEmploymentActive(employee.terminationDate);
}

/**
 * Bookable on a clinic date (YYYY-MM-DD): active profile of an active account, available for bookings,
 * and not terminated on or before today or the given date.
 */
export function isBookableEmployee(employee: EmployeeEntity | null | undefined, date?: string): employee is EmployeeEntity & { user: UsersEntity } {
  if (!isActiveEmployee(employee) || !employee.isAvailableForBookings) return false;
  return !date || !employee.terminationDate || employee.terminationDate > date;
}
