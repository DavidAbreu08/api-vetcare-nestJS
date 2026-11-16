import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PartialType } from "@nestjs/mapped-types";

/** Creates a species catalog entry. Names follow the database collation for uniqueness. */
export class CreateSpeciesDto extends DescriptiveMetadataDto {
  @ApiProperty({ description: "Species display name; surrounding whitespace is removed", example: "Dog", maxLength: 255 })
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

/** Updates the display name without changing catalog identifiers. */
export class UpdateSpeciesDto extends PartialType(CreateSpeciesDto) {}
