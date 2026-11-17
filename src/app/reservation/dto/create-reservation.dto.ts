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
 * Staff may book for another client (ownerId); administrators may pre-assign an employee (employeeId). The service
 * (serviceId) is required and defines the duration.
 */
export class CreateReservationDto {
  @ApiProperty({ description: "UUID of the animal belonging to the client.", format: "uuid" })
  @IsUUID()
  animalId: string;

  @ApiPropertyOptional({ description: "Client UUID when staff books on behalf of the owner. Omitted or equal to the caller: personal booking.", format: "uuid" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiProperty({ description: "Clinic service UUID (vc_services.id); must exist and be active. Its duration defines endAt.", format: "uuid" })
  @IsUUID()
  serviceId: string;

  @ApiPropertyOptional({ description: "Employee profile UUID (vc_employees.id) to pre-assign; administrators only. Must be qualified for the service. Does not confirm.", format: "uuid" })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ description: "Start instant, ISO-8601 with offset or Z (stored in UTC).", example: "2030-01-07T10:00:00Z" })
  @IsoInstant()
  startAt: string;

  @ApiPropertyOptional({
    type: String, nullable: true, example: "2030-01-07T10:30:00Z",
    description: "Optional. The server computes endAt = startAt + service durationMinutes. Non-administrators may only send that same value (400 otherwise); administrators may send a different end (override). Same clinic business day.",
  })
  @IsOptional()
  @IsoInstant()
  endAt?: string | null;

  @ApiPropertyOptional({ type: String, description: "Reason for the appointment.", maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiPropertyOptional({ type: String, description: "Free-text notes.", nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  notes?: string | null;
}
