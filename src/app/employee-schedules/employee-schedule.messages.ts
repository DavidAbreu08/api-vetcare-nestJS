import { countPhrase } from "../helpers/count-phrase";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const EmployeeScheduleMessages = {
  INVALID_PERIOD: "Each schedule period must end after it starts on the same day (no period crosses midnight)",
  INVALID_VALIDITY: "validUntil must be on or after validFrom",
  DST_WINDOW: "Schedule times from 01:00 to 01:59 (clinic time) are not allowed: that hour is skipped or repeated when daylight saving time changes",
  OUTSIDE_SCHEDULE: "The interval is outside the employee schedule",
  overlapping: (dayOfWeek: number) => `Schedule periods overlap on ${DAY_NAMES[dayOfWeek] ?? "the same day"} with intersecting validity; adjacent periods are allowed`,
  strandedReservations: (count: number) =>
    `The new schedule would leave ${countPhrase(count, "confirmed reservation")} outside the employee's working hours; cancel or reschedule them first`,
} as const;
