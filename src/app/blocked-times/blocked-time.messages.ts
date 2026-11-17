import { countPhrase } from "../helpers/count-phrase";

export const BlockedTimeMessages = {
  NOT_FOUND: "Blocked time not found",
  INVALID_INTERVAL: "endAt must be after startAt",
  INVALID_INSTANT: "startAt and endAt must be ISO-8601 timestamps with an explicit offset or Z",
  NULL_INTERVAL: "startAt and endAt cannot be null",
  EMPLOYEE_NOT_FOUND: "Employee not found",
  EMPLOYEE_INACTIVE: "The employee profile is not active (terminated or inactive account)",
  CHANGED: "The blocked time changed; reload and retry",
  confirmedReservations: (count: number, global: boolean) =>
    `The block overlaps ${countPhrase(count, "confirmed reservation")}${global ? "" : " of the employee"}; cancel or reschedule them first`,
} as const;
