import { countList } from "../helpers/count-phrase";

export enum ClinicServiceMessage {
  NotFound = "Service not found",
  Invalid = "Code and name must be non-empty; code must use uppercase letters, digits and underscores",
  InvalidDuration = "durationMinutes must be an integer between 5 and 1440 and a multiple of 5",
  ImmutableCode = "Service codes cannot change; create a new service instead",
  InactiveAssignment = "The service is inactive; new qualifications require active services",
  QualificationsChanged = "Qualifications changed; reload and retry",
  Forbidden = "Access denied",
}

/** Conflict messages carrying the number of affected records (no id lists or count fields in the error). */
export const ClinicServiceConflictMessages = {
  inUse: (reservations: number, qualifications: number) =>
    `The service is referenced by ${countList([[reservations, "reservation"], [qualifications, "employee qualification"]])}; deactivate it instead of deleting it`,
  referenced: "The service is referenced by reservations or employee qualifications; deactivate it instead of deleting it",
  qualificationInUse: (count: number) =>
    `The employee has ${count === 1 ? "1 open reservation" : `${count} open reservations`} of a service being removed; cancel or reassign them first`,
} as const;
