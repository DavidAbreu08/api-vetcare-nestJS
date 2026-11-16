export const UsersMessages = {
  USER_NOT_FOUND: "Usuário não encontrado",
  EMAIL_OR_NIF_ALREADY_EXISTS: "Email or NIF already exists",
  CLIENT_CREATED: "Client account created successfully. Temporary password sent via email.",
  OK: "ok",
  ADMIN_ONLY_FIELDS: "Only administrators can change email or activation state",
  NULL_REQUIRED_FIELD: "Name and email cannot be null",
  FUTURE_BIRTH_DATE: "Birth date cannot be in the future",
  INVALID_ROLES: "Roles must exist; new assignments require active roles",
  LAST_ADMIN: "At least one active administrator must remain",
  EMPLOYEE_ROLE_REQUIRED: "Users with an active employee profile must keep the employee role",
  ACTIVE_EMPLOYEE_PROFILE: "This user has an active employee profile; terminate or delete the profile through /api/employees first",
  EMPLOYEE_ROLE_WITHOUT_PROFILE: "The employee role requires an active employee profile; create or reactivate it through /api/employees",
} as const;
