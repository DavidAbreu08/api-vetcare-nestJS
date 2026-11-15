export enum JobTitleMessage {
  NotFound = "Job title not found",
  Invalid = "Code and name must be non-empty; code must use uppercase letters, digits and underscores",
  ImmutableCode = "Job title codes cannot change; create a new job title instead",
  InUse = "Job title is assigned to employees; deactivate it instead",
  InvalidAssignment = "Job titles must exist and be active",
}
