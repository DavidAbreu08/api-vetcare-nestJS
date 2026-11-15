import { todayKey } from "../core/catalog";
import { CLINIC_POLICY } from "../reservation/reservation-policy";

/** Clinic calendar date used for employment rules. */
export function clinicToday(): string {
  return todayKey(CLINIC_POLICY.timeZone);
}

/** An employee profile is active while its termination date is absent or in the future. */
export function isEmploymentActive(terminationDate: string | null | undefined, today = clinicToday()): boolean {
  return !terminationDate || terminationDate > today;
}
