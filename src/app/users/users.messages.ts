import { countPhrase } from "../helpers/count-phrase";

export const UsersMessages = {
  USER_NOT_FOUND: "User not found",
  EMAIL_OR_NIF_ALREADY_EXISTS: "Email or NIF already exists",
  CLIENT_CREATED: "Client account created successfully. Temporary password sent via email.",
  OK: "ok",
  ADMIN_ONLY_FIELDS: "Only administrators can change email or activation state",
  NULL_REQUIRED_FIELD: "Name and email cannot be null",
  FUTURE_BIRTH_DATE: "Birth date cannot be in the future",
  INVALID_ROLES: "Roles must exist; new assignments require active roles",
  LAST_ADMIN: "At least one active administrator must remain",
  EMPLOYEE_ROLE_REQUIRED: "Users with an active employee profile must keep the employee role",
  ACTIVE_EMPLOYEE_PROFILE: "This user has an active employee profile; terminate or delete the profile through /api/vetcare/employees first",
  INACTIVE_ACCOUNT_ROLES: "Roles cannot be assigned to an inactive account; reactivate it first",
  EMPLOYEE_ROLE_WITHOUT_PROFILE: "The employee role requires an active employee profile; create or reactivate it through /api/vetcare/employees",
} as const;

/** Conflict messages carrying the number of affected records (no id lists or count fields in the error). */
export const UsersConflictMessages = {
  clientOpenReservations: (count: number) =>
    `The client has ${countPhrase(count, "open reservation")} (pending or confirmed, not yet finished); cancel them before deactivating or deleting the account`,
  employeeOpenReservations: (count: number) =>
    `The account's employee profile has ${countPhrase(count, "open reservation")} assigned; cancel or reassign them first`,
  primaryTutorOfAnimals: (count: number) =>
    `The account is the primary tutor of ${countPhrase(count, "animal")}; transfer them to another primary tutor (POST /api/vetcare/animal/:id/transfer) first`,
  secondaryTutorOpenReservations: (count: number) =>
    `The account is the client of ${countPhrase(count, "open reservation")} of animals it co-tutors as a secondary tutor; cancel them, or end those tutorships with transferFutureReservations: true, before removing the client role`,
} as const;
