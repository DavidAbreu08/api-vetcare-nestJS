export const ReservationPolicyMessages = {
  AMBIGUOUS_TIME: "This local time is ambiguous in the clinic timezone",
  INVALID_DATE: "Invalid calendar date",
  INVALID_INTERVAL: "End time must be after start time",
  INVALID_TIME: "Time must use HH:mm format",
  NONEXISTENT_TIME: "This local time does not exist in the clinic timezone",
  OUTSIDE_BUSINESS_HOURS: "Outside business hours (Mon-Fri 07:00-20:00)",
  PAST_RESERVATION: "Reservation must start in the future",
  invalidTransition: (from: string, to: string) => `Cannot change reservation from ${from} to ${to}`,
} as const;
