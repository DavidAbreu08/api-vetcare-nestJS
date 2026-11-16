import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { ISO_INSTANT_WITH_OFFSET } from "../../core/persistence/utc-datetime";

/** ISO-8601 instant with an explicit offset or Z; timestamps without an offset are rejected. */
export const IsoInstant = () => (target: object, property: string) => {
  IsDateString({ strict: true })(target, property);
  Matches(ISO_INSTANT_WITH_OFFSET)(target, property);
};

/**
 * Create an appointment. It always starts PENDING; confirmation is a separate staff step.
 * Staff may book for another client (ownerId) and pre-assign an employee (employeeId).
 */
export class CreateReservationDto {
  @ApiProperty({ description: "UUID of the animal belonging to the client.", format: "uuid" })
  @IsUUID()
  animalId: string;

  @ApiPropertyOptional({ description: "Client UUID when staff books on behalf of the owner. Omitted or equal to the caller: personal booking.", format: "uuid" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: "Employee profile UUID (vc_employees.id) to pre-assign; staff only. Does not confirm.", format: "uuid" })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ description: "Start instant, ISO-8601 with offset or Z (stored in UTC).", example: "2030-01-07T10:00:00Z" })
  @IsoInstant()
  startAt: string;

  @ApiProperty({ description: "End instant, ISO-8601 with offset or Z; after startAt, same clinic business day.", example: "2030-01-07T10:30:00Z" })
  @IsoInstant()
  endAt: string;

  @ApiPropertyOptional({ description: "Reason for the appointment.", maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @ApiPropertyOptional({ maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiPropertyOptional({ description: "Free-text notes.", nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  notes?: string | null;
}
