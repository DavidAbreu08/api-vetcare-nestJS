export enum JobTitleMessage {
  NotFound = "Job title not found",
  Invalid = "Code and name must be non-empty; code must use uppercase letters, digits and underscores",
  ImmutableCode = "Job title codes cannot change; create a new job title instead",
  InUse = "Job title is assigned to employees; deactivate it instead",
  SystemJobTitle = "Job title is referenced by a system setting (e.g. VETERINARIAN_JOB_TITLE_ID); point the setting to another job title first",
  InvalidAssignment = "Job titles must exist and be active",
}
