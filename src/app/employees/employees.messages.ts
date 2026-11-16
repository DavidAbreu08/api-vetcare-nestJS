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
  OpenReservations = "The change would leave pending or confirmed reservations assigned to an employee who can no longer attend them; cancel or reassign them first",
  InactiveAccount = "The account is inactive; reactivate it before creating or reactivating its employee profile",
  HasHistory = "The employee profile is referenced by reservations or clinical visits; terminate it instead of deleting it",
}
