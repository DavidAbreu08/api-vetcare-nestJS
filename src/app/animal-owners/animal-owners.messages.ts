import { countPhrase } from "../helpers/count-phrase";

/** Public messages of tutorship management (vc_animal_owners). */
export enum AnimalOwnersMessage {
  AnimalNotFound = "Animal not found",
  AccessDenied = "Access denied",
  HistoryForbidden = "Only staff and the primary tutor can see former tutors",
  ManageForbidden = "Only staff and the primary tutor can manage the animal's tutors",
  TransferForbidden = "Only an administrator can transfer the primary tutor",
  InvalidTutor = "A tutor must be an active client account",
  AlreadyTutor = "The account is already an active tutor of this animal",
  AlreadyPrimary = "The account is already the primary tutor of this animal",
  NotTutor = "The account is not an active tutor of this animal",
  PrimaryNotRemovable = "The primary tutor cannot be removed; transfer the animal to another primary tutor first",
  NoPrimary = "The animal has no primary tutor; an administrator must assign one through POST /api/vetcare/animal/:id/transfer",
  PrimaryInactive = "The primary tutor's account is inactive or deleted; reservations cannot be moved to it",
  PreviousTutorUnavailable = "The previous primary tutor's account no longer exists; it cannot be kept as a secondary tutor",
  ConcurrentReservations = "The animal's reservations changed while the request was running; retry",
  TutorsChanged = "The animal's tutors changed while the request was running; retry",
  TutorshipClosed = "Tutors changed; reload and retry",
  PreviousTutorNotClient = "The previous primary tutor's account is inactive or no longer a client; it cannot be kept as a secondary tutor (send keepPreviousAsSecondary: false)",
  Removed = "Tutor removed",
}

/** Conflict messages carrying the number of affected records (no id lists or count fields in the error). */
export const AnimalOwnersConflictMessages = {
  futureReservations: (count: number) =>
    `The tutor is the client of ${countPhrase(count, "open reservation")} of this animal; send transferFutureReservations: true to move them, or cancel them first`,
} as const;
