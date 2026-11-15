import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf, Matches } from "class-validator";

export class CreateAnimalDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ValidateIf(o => o.type == null || o.speciesId != null) @IsUUID() speciesId?: string;
  @IsOptional() @IsUUID() breedId?: string | null;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string | null;
  @IsString() @MaxLength(255) color: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) weight: number;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) height: number;
  @IsOptional() @IsString() @MaxLength(255) description?: string | null;
  @IsOptional() @IsString() imageUrl?: string | null;
  @ValidateIf(o => o.gender == null || o.sex != null) @IsString() @IsNotEmpty() @MaxLength(255) sex?: string;
  @IsOptional() @IsString() @MaxLength(255) microchipNumber?: string | null;
  @IsOptional() @IsBoolean() isNeutered?: boolean | null;
  @IsUUID() ownerId: string;

  // Temporary compatibility for existing clients; taxonomy must already exist.
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) type?: string;
  @IsOptional() @IsString() @MaxLength(255) breed?: string;
  @IsOptional() @IsInt() @Min(0) age?: number;
  @IsOptional() @IsString() @MaxLength(255) gender?: string;
  @IsOptional() @IsString() image?: string;
}
