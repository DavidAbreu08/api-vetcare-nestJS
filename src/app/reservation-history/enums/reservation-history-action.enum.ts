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
  /** The reservation's client (responsible tutor) changed because the tutor stopped being a tutor of the animal (migration 1795435200000). */
  CLIENT_CHANGED = "CLIENT_CHANGED",
}
