export enum MeasurementMessage {
  NotFound = "Measurement not found",
  AnimalNotFound = "Active animal not found",
  MissingOwner = "Animal has no owner; staff access is required",
  Empty = "Provide at least one non-null weight or height",
  InvalidTime = "measuredAt must be a valid past or present timestamp with timezone",
  Deleted = "Measurement deleted",
}
export enum MeasurementRelation { Animal = "animal", Owner = "owner" }
