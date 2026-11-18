import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Creates an animal belonging to an existing client.
 * Prefer speciesId/breedId and birthDate; species and breed labels remain catalog lookup aliases.
 * Physical measurements are written through the measurements resource.
 */
export class CreateAnimalDto {
  @ApiProperty({ description: "Animal display name", example: "Rex", maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: "Existing species UUID; required unless legacy type identifies an existing species", format: "uuid" })
  @ValidateIf(dto => dto.type == null || dto.speciesId != null)
  @IsUUID()
  speciesId?: string;

  @ApiPropertyOptional({ type: String, description: "Breed UUID belonging to speciesId; null means no breed specified", format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  breedId?: string | null;

  @ApiPropertyOptional({ type: String, description: "Known birth date, YYYY-MM-DD, not in the future; null means unknown", example: "2022-06-15", nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  birthDate?: string | null;

  @ApiProperty({ description: "Coat color", example: "Brown", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  color: string;

  @ApiPropertyOptional({ type: String, description: "Additional animal information", maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ type: String, description: "Animal notes", maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ type: String, description: "Image reference; legacy embedded data URLs are still supported", nullable: true })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: "Sex description; required unless legacy gender is supplied", example: "Female", maxLength: 255 })
  @ValidateIf(dto => dto.gender == null || dto.sex != null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sex?: string;

  @ApiPropertyOptional({ type: String, description: "Microchip identifier; no global uniqueness policy is assumed", maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  microchipNumber?: string | null;

  @ApiPropertyOptional({ type: Boolean, description: "Whether the animal is neutered; null means unknown", nullable: true })
  @IsOptional()
  @IsBoolean()
  isNeutered?: boolean | null;

  @ApiProperty({ description: "Existing client owner UUID", format: "uuid" })
  @IsUUID()
  ownerId: string;

  @ApiPropertyOptional({ description: "Legacy species label; must match an existing catalog entry", deprecated: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  type?: string;

  @ApiPropertyOptional({ description: "Legacy breed label within the selected species; blank means no breed", deprecated: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  breed?: string;

  @ApiPropertyOptional({ description: "Legacy alias for sex", deprecated: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  gender?: string;

  @ApiPropertyOptional({ description: "Legacy alias for imageUrl", deprecated: true })
  @IsOptional()
  @IsString()
  image?: string;
}
