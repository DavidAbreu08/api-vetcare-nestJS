import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Creates a breed scoped to one species; names are unique within that species. */
export class CreateBreedDto extends DescriptiveMetadataDto {
  @ApiProperty({ description: "Existing species identifier", format: "uuid" })
  @IsUUID()
  speciesId: string;

  @ApiProperty({ description: "Breed display name", example: "Mixed", maxLength: 255 })
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

/** The parent species is immutable; rename the breed only. */
export class UpdateBreedDto extends DescriptiveMetadataDto {
  @ApiPropertyOptional({ description: "New breed display name", maxLength: 255 })
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;
}

export class ListBreedsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: "Restrict results to one species", format: "uuid" })
  @IsOptional()
  @IsUUID()
  speciesId?: string;
}
