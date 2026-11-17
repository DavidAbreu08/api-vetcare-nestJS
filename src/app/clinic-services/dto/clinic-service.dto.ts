import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDivisibleBy, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { CATALOG_CODE_PATTERN, normalizeCatalogCode } from "../../core/catalog";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { SERVICE_DURATION } from "../entities/clinic-service.entity";

/** Creates a bookable clinic service. No price in this phase. */
export class CreateClinicServiceDto {
  @ApiProperty({ description: "Unique uppercase code (letters, digits, underscores; starts with a letter). Immutable.", example: "CONSULTATION", maxLength: 64 })
  @Transform(({ value }: { value: unknown }) => normalizeCatalogCode(value))
  @IsString()
  @Matches(CATALOG_CODE_PATTERN)
  @MaxLength(64)
  code: string;

  @ApiProperty({ description: "Display name.", maxLength: 100 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ type: String, maxLength: 240, nullable: true, description: "Trimmed; blank text is rejected (400), null clears it." })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(240)
  description?: string | null;

  @ApiProperty({
    type: "integer", minimum: SERVICE_DURATION.min, maximum: SERVICE_DURATION.max, multipleOf: SERVICE_DURATION.step, example: 30,
    description: "Duration in minutes (5..1440, multiple of 5) used to compute endAt of new reservations. Changing it never alters existing reservations.",
  })
  @IsInt()
  @Min(SERVICE_DURATION.min)
  @Max(SERVICE_DURATION.max)
  @IsDivisibleBy(SERVICE_DURATION.step)
  durationMinutes: number;

  @ApiPropertyOptional({ description: "Inactive services cannot be booked; existing reservations and qualifications are kept.", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Partial update; `code` may only be sent unchanged (409 otherwise). */
export class UpdateClinicServiceDto extends PartialType(CreateClinicServiceDto) {}

export class ListClinicServicesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ type: Boolean, description: "Administrators only: filter by active state (all when omitted). Other callers always get active services only." })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean()
  isActive?: boolean;
}

/** Full replacement of an employee's service qualifications. */
export class ReplaceEmployeeServicesDto {
  @ApiProperty({
    description: "Service UUIDs; the list replaces every current qualification. New qualifications require active services; inactive services already held may be kept.",
    type: [String], format: "uuid",
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique((id: string) => (typeof id === "string" ? id.toLowerCase() : id))
  @IsUUID("all", { each: true })
  serviceIds: string[];
}

/** Service as embedded in a reservation response. */
export class ClinicServiceSummaryDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: "integer", description: "Current catalog duration; the reservation's own interval is startAt/endAt." }) durationMinutes: number;
}
