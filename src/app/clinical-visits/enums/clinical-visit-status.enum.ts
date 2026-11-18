/** IN_PROGRESS -> COMPLETED | VOIDED (administrators only). COMPLETED and VOIDED are terminal. */
export enum ClinicalVisitStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  VOIDED = "VOIDED",
}
