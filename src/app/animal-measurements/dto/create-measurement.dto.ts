import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Records one value in the selected type unit; the author is the authenticated caller. */
export class CreateMeasurementDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() animalId: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 255 }) @IsOptional() @IsString() @MaxLength(255) name?: string | null;
  @ApiProperty({ format: "uuid" }) @IsUUID() measurementTypeId: string;
  @ApiProperty({ description: "Finite signed decimal, up to six places; persisted exactly as decimal(18,6)", minimum: -999999999.999999, maximum: 999999999.999999 })
  @IsNumber({ maxDecimalPlaces: 6, allowNaN: false, allowInfinity: false }) @Min(-999999999.999999) @Max(999999999.999999) value: number;
  @ApiPropertyOptional({ description: "Past or present ISO timestamp with timezone; defaults to now" })
  @IsOptional() @IsDateString({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) measuredAt?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 240 }) @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}
/** PATCH semantics: omitted fields retain their values; animal and original author cannot change. */
export class UpdateMeasurementDto extends PartialType(OmitType(CreateMeasurementDto, ["animalId"] as const)) {}
export class ListMeasurementsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() animalId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() measurementTypeId?: string;
}
