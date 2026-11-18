import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID, ValidateIf } from "class-validator";

/**
 * Optional body of PUT /api/vetcare/animal/confirm/:id: the species and breed the approver reviewed. When sent, the approval
 * only succeeds if the stored values still match (409 ANIMAL_DATA_CHANGED otherwise); omitted fields are not checked.
 */
export class ConfirmAnimalDto {
  @ApiPropertyOptional({ description: "Species UUID the approver reviewed", format: "uuid" })
  @IsOptional()
  @IsUUID()
  expectedSpeciesId?: string;

  @ApiPropertyOptional({ type: String, description: "Breed UUID the approver reviewed; null means the animal had no breed", format: "uuid", nullable: true })
  @ValidateIf((_dto, value) => value !== undefined && value !== null)
  @IsUUID()
  expectedBreedId?: string | null;
}
