export enum MeasurementTypeMessage {
 ImmutableSemantics = "Measurement codes and units cannot change; create a new type for a different unit",
 NotFound = "Measurement type not found", Invalid = "Code, name and unit must be non-empty; code must use uppercase letters, digits and underscores", Inactive = "Measurement type must be active", Deleted = "Measurement type deleted",
}
