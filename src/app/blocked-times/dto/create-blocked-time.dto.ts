import { NamedMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { ISO_INSTANT_WITH_OFFSET } from "../../core/persistence/utc-datetime";

/**
 * Creates a blocked time: a clinic-wide closure (no employeeId) or the unavailability of one employee. The interval
 * [startAt, endAt) is given as ISO-8601 instants with an explicit offset and may span several days.
 */
export class CreateBlockedTimeDto extends NamedMetadataDto {
  @ApiProperty({ type: String, format: "date-time", example: "2030-01-07T09:00:00Z", description: "Start instant, ISO-8601 with an explicit offset or Z (stored in UTC)." })
  @IsString()
  @Matches(ISO_INSTANT_WITH_OFFSET, { message: "startAt must be an ISO-8601 timestamp with an explicit offset or Z" })
  startAt: string;

  @ApiProperty({ type: String, format: "date-time", example: "2030-01-07T13:00:00Z", description: "End instant (exclusive), after startAt; may be on a later day." })
  @IsString()
  @Matches(ISO_INSTANT_WITH_OFFSET, { message: "endAt must be an ISO-8601 timestamp with an explicit offset or Z" })
  endAt: string;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true, description: "Employee profile (vc_employees.id) for an individual block; omitted or null = clinic-wide closure. Unknown: 404; inactive profile: 409." })
  @IsOptional()
  @IsUUID()
  employeeId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true, description: "Optional reason." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;
}
