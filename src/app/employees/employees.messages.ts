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
}
