import { countList, countPhrase } from "../helpers/count-phrase";

export enum EmployeeMessage {
  NotFound = "Employee not found",
  UserSource = "Provide exactly one of userId or user",
  InvalidUser = "User not found",
  AlreadyEmployee = "This user already has an employee profile",
  InvalidDates = "Termination date must be on or after the hire date",
  NullField = "isAvailableForBookings and jobTitleIds cannot be null",
  InvalidJobTitles = "Job titles must exist; new assignments require active job titles",
  Forbidden = "Access denied",
  TerminatedUnavailable = "A terminated employee (termination date today or earlier) cannot be available for bookings",
  InactiveAccount = "The account is inactive; reactivate it before creating or reactivating its employee profile",
}

/** Conflict messages carrying the number of affected records (no id lists or count fields in the error); zero counts are left out. */
export const EmployeeConflictMessages = {
  openReservations: (count: number) =>
    `The change would leave ${countPhrase(count, "open reservation")} assigned to an employee who can no longer attend them; cancel or reassign them first`,
  hasHistory: (reservations: number, clinicalVisits: number) =>
    `The employee profile is referenced by ${countList([[reservations, "reservation"], [clinicalVisits, "clinical visit"]])}; terminate it instead of deleting it`,
} as const;
