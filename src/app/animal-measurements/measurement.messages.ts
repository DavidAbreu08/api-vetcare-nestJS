import { ErrorMetadata } from "../core/enums/error-metadata.enum";

export enum MeasurementMessage {
  NonNegative = "Weight, height, heart rate and respiratory rate cannot be negative",
  NotFound = "Measurement not found",
  AnimalNotFound = "Active animal not found",
  AccessDenied = "Access denied: staff or an active tutor of the animal only",
  InvalidValue = "Value must be a finite signed decimal with at most six places and magnitude at most 999999999.999999",
  InvalidTime = "measuredAt must be a valid past or present timestamp with timezone",
  Deleted = "Measurement deleted",
  StaffOnly = "Only administrators and active employees can record or change measurements",
  AdminOnly = "Only administrators can delete measurements",
  ClinicalMeasurementNotDeletable = "Measurements recorded in a clinical visit cannot be deleted",
}
/** Domain defaults; individual rules can supply a more specific message for the same global category. */
export const MeasurementErrorMessages = {
  [ErrorMetadata.NOT_FOUND]: MeasurementMessage.NotFound,
  [ErrorMetadata.INVALID_VALUE]: MeasurementMessage.InvalidValue,
  [ErrorMetadata.FORBIDDEN]: MeasurementMessage.AccessDenied,
  [ErrorMetadata.CONFLICT]: MeasurementMessage.ClinicalMeasurementNotDeletable,
} satisfies Record<
  ErrorMetadata.NOT_FOUND | ErrorMetadata.INVALID_VALUE | ErrorMetadata.FORBIDDEN | ErrorMetadata.CONFLICT,
  string
>;
export enum MeasurementRelation { Animal = "animal", Owner = "owner", Type = "measurementType", Recorder = "recorder", ClinicalVisit = "clinicalVisit" }
