/** Why a tutorship period ended (vc_animal_owners.end_reason, ck_vc_animal_owners_end_reason). */
export enum AnimalOwnerEndReason {
  /** Primary tutorship handed over (POST /api/vetcare/animal/:id/transfer), or a secondary row closed to be reopened as primary. */
  TRANSFERRED = "TRANSFERRED",
  /** Secondary tutor removed by the primary/staff or leaving on their own (DELETE /api/vetcare/animal/:id/owners/:userId). */
  REMOVED = "REMOVED",
  /** The account lost the CLIENT role (PUT /api/vetcare/users/:id/roles). */
  ROLE_CHANGED = "ROLE_CHANGED",
  /** The account was soft-deleted (DELETE /api/vetcare/users/:id). */
  ACCOUNT_DELETED = "ACCOUNT_DELETED",
  /** Reserved for data migrations (not written by the application). */
  MIGRATED = "MIGRATED",
}
