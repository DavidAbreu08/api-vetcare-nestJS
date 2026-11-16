export enum MeasurementMessage {
  NonNegative = "Weight, height, heart rate and respiratory rate cannot be negative",
  NotFound = "Measurement not found",
  AnimalNotFound = "Active animal not found",
  MissingOwner = "Animal has no owner; staff access is required",
  InvalidValue = "Value must be a finite signed decimal with at most six places and magnitude at most 999999999.999999",
  InvalidTime = "measuredAt must be a valid past or present timestamp with timezone",
  Deleted = "Measurement deleted",
  StaffOnly = "Only administrators and active employees can record or change measurements",
  AdminOnly = "Only administrators can delete measurements",
  ClinicalMeasurementNotDeletable = "Measurements recorded in a clinical visit cannot be deleted",
}
export enum MeasurementRelation { Animal = "animal", Owner = "owner", Type = "measurementType", Recorder = "recorder", ClinicalVisit = "clinicalVisit" }
