import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";

export class CreateSpeciesDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
}
export class UpdateSpeciesDto extends PartialType(CreateSpeciesDto) {}
export class CreateBreedDto extends CreateSpeciesDto {
  @IsUUID() speciesId: string;
}
export class UpdateBreedDto extends PartialType(CreateSpeciesDto) {}
