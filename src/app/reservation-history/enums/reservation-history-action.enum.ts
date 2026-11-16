/** Events of the append-only reservation history (vc_reservation_history.action). */
export enum ReservationHistoryAction {
  CREATED = "CREATED",
  CONFIRMED = "CONFIRMED",
  RESCHEDULED = "RESCHEDULED",
  EMPLOYEE_ASSIGNED = "EMPLOYEE_ASSIGNED",
  EMPLOYEE_CHANGED = "EMPLOYEE_CHANGED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
  NO_SHOW = "NO_SHOW",
}
