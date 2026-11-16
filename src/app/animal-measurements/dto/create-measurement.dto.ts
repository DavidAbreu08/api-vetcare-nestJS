import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Records one value in the selected type unit; the author is the authenticated caller. */
export class CreateMeasurementDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() animalId: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 }) @IsOptional() @IsString() @MaxLength(255) name?: string | null;
  @ApiProperty({ format: "uuid" }) @IsUUID() measurementTypeId: string;
  @ApiProperty({ description: "Finite signed decimal, up to six places; persisted exactly as decimal(18,6)", minimum: -999999999.999999, maximum: 999999999.999999 })
  @IsNumber({ maxDecimalPlaces: 6, allowNaN: false, allowInfinity: false }) @Min(-999999999.999999) @Max(999999999.999999) value: number;
  @ApiPropertyOptional({ description: "Past or present ISO timestamp with timezone; defaults to now" })
  @IsOptional() @IsDateString({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/) measuredAt?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 240 }) @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @ApiPropertyOptional({ format: "uuid", description: "IN_PROGRESS clinical visit of the same animal (staff with clinical access). Immutable after creation." })
  @IsOptional() @IsUUID() clinicalVisitId?: string;
}
/**
 * PATCH semantics: omitted fields retain their values. Animal, type, clinical visit and original author are immutable;
 * sending measurementTypeId (or any other unknown property) is rejected with 400 by the global ValidationPipe.
 */
export class UpdateMeasurementDto extends PartialType(OmitType(CreateMeasurementDto, ["animalId", "measurementTypeId", "clinicalVisitId"] as const)) {}
/** Soft-delete (administrators): the reason is mandatory and kept for audit. */
export class DeleteMeasurementDto {
  @ApiProperty({ maxLength: 500 }) @IsString() @Matches(/\S/) @MaxLength(500) reason: string;
}
export class ListMeasurementsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() animalId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() measurementTypeId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() clinicalVisitId?: string;
}
