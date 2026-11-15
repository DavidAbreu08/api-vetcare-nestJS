/** Public persistence messages deliberately exclude driver and SQL details. */
export enum PersistenceMessage {
  Duplicate = "A record with these unique values already exists",
  ReferenceConflict = "The operation conflicts with a related record",
  InvalidValue = "A value cannot be stored in the requested format or length",
  Unavailable = "The database could not complete the operation",
}
