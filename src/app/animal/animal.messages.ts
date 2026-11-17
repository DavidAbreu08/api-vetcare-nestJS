import { countList } from "../helpers/count-phrase";

/** Public messages for animal business validation and lookups. */
export enum AnimalMessage {
  NotFound = "Animal not found",
  InvalidOwner = "Owner must be a client",
  AccessDenied = "Access denied",
  EditForbidden = "Only staff and the primary tutor can edit this animal",
  OwnerChangeForbidden = "Only an administrator can change the primary tutor (POST /api/vetcare/animal/:id/transfer)",
  NullRequiredField = "A required animal field cannot be null",
  FutureBirthDate = "Birth date cannot be in the future",
  SexAliasConflict = "sex conflicts with gender",
  ImageAliasConflict = "imageUrl conflicts with image",
  InvalidSpecies = "Provide a valid speciesId or an existing legacy type",
  InvalidBreed = "Unknown breed",
  BreedSpeciesMismatch = "Breed does not belong to this species",
  SpeciesAliasConflict = "type conflicts with speciesId",
  BreedAliasConflict = "breed conflicts with breedId",
  NullTaxonomyLabel = "Taxonomy identifiers and legacy labels cannot be null; use breedId:null to clear a breed",
  Deleted = "Animal deleted successfully",
  VerificationForbidden = "Only an administrator or a veterinarian can verify this animal",
  DataChanged = "The animal's species or breed changed since it was reviewed; review it again before approving",
}

/** Conflict messages carrying the number of affected records (no id lists or count fields in the error); zero counts are left out. */
export const AnimalConflictMessages = {
  openActivity: (reservations: number, clinicalVisits: number) =>
    `The animal has ${countList([[reservations, "open reservation"], [clinicalVisits, "clinical visit in progress", "clinical visits in progress"]])}; cancel or finish them first`,
} as const;
