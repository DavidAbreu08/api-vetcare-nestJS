export enum RoleMessage {
  NotFound = "Role not found",
  Invalid = "Code and name must be non-empty; code must use uppercase letters, digits and underscores",
  ImmutableCode = "Role codes cannot change; create a new role instead",
  SystemRole = "This role is referenced by a system setting; change the setting first",
  InUse = "Role is assigned to users; deactivate it instead",
}
