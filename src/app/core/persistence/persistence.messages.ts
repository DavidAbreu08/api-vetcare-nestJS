/** Public persistence messages deliberately exclude driver and SQL details. */
export enum PersistenceMessage {
  Duplicate = "A record with these unique values already exists",
  ReferenceConflict = "The operation conflicts with a related record",
  CheckViolation = "A value does not satisfy the rules required for this record",
  InvalidValue = "A value cannot be stored in the requested format or length",
  Unavailable = "The database could not complete the operation",
}
