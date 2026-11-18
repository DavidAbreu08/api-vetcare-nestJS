/** Public persistence messages deliberately exclude driver and SQL details. */
export enum PersistenceMessage {
  Duplicate = "A record with these unique values already exists",
  ReferenceConflict = "The operation conflicts with a related record",
  CheckViolation = "A value does not satisfy the rules required for this record",
  InvalidValue = "A value cannot be stored in the requested format or length",
  Deadlock = "The operation conflicted with a concurrent change; retry",
  LockTimeout = "The operation waited too long for a concurrent change; retry",
  VisitLinkImmutable = "The animal and reservation of a clinical visit cannot be changed",
  VisitReservationNotConfirmed = "A clinical visit can only be started for a confirmed reservation",
  ReservationCompletedWithoutVisit = "A reservation can only be completed through a completed clinical visit",
  ReservationHasActiveVisit = "The reservation has an active clinical visit; it cannot be cancelled, marked as no-show or set back to pending",
  Unavailable = "The database could not complete the operation",
}
