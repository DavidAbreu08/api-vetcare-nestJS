export enum SystemSettingMessage {
  NotFound = "System setting not found",
  Invalid = "Invalid system setting identifier",
  InvalidRoleReference = "Role settings must reference an existing, active role",
  DuplicateRoleReference = "Each role setting must reference a different role; this role is already referenced by another *_ROLE_ID setting",
  AdminRoleWithoutUsers = "The administrator role setting must reference a role held by at least one active user",
  EmployeeRoleNotHeld = "Every active employee must already hold the role referenced by EMPLOYEE_ROLE_ID",
  Misconfigured = "A required system setting is missing or invalid",
}
