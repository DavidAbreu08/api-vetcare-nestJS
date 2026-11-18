/**
 * Reservation states. PENDING -> CONFIRMED | CANCELLED; CONFIRMED -> COMPLETED | CANCELLED | NO_SHOW.
 * COMPLETED, CANCELLED and NO_SHOW are terminal. Rescheduling is a history event, not a state.
 */
export enum ReservationStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
}
