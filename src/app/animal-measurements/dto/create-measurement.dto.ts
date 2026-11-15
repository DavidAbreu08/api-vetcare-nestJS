import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Records weight in kg, height in cm, or both; the author is the authenticated caller. */
export class CreateMeasurementDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() animalId: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 255 }) @IsOptional() @IsString() @MaxLength(255) name?: string | null;
  @ApiPropertyOptional({ description: "Kilograms", nullable: true, minimum: 0, maximum: 9999999999.999 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(9999999999.999) weight?: number | null;
  @ApiPropertyOptional({ description: "Centimeters", nullable: true, minimum: 0, maximum: 9999.99 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999.99) height?: number | null;
  @ApiPropertyOptional({ description: "Past or present ISO timestamp with timezone; defaults to now" })
  @IsOptional() @IsDateString({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) measuredAt?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 240 }) @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}
/** PATCH semantics: omitted fields retain their values; animal and original author cannot change. */
export class UpdateMeasurementDto extends PartialType(OmitType(CreateMeasurementDto, ["animalId"] as const)) {}
export class ListMeasurementsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() animalId?: string;
}
