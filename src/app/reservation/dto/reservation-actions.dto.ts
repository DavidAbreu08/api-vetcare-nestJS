import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { IsoInstant } from "./create-reservation.dto";

/** Optional justification recorded in the reservation history (and sent in the notification when applicable). */
export class ReservationReasonDto {
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

/** Assign or change the employee of a PENDING reservation (qualified for its service, if any); never confirms it. */
export class AssignReservationEmployeeDto extends ReservationReasonDto {
  @ApiProperty({ description: "Employee profile UUID (vc_employees.id), bookable on the reservation date.", format: "uuid" })
  @IsUUID()
  employeeId: string;
}

/** New interval; a CONFIRMED reservation returns to PENDING and needs a new confirmation. */
export class RescheduleReservationDto extends ReservationReasonDto {
  @ApiProperty({ description: "New start instant, ISO-8601 with offset or Z.", example: "2030-01-08T10:00:00Z" })
  @IsoInstant()
  startAt: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "New end instant, ISO-8601 with offset or Z. Optional: when omitted the reservation keeps its current duration (end - start), not the current service duration.", example: "2030-01-08T10:30:00Z" })
  @IsOptional()
  @IsoInstant()
  endAt?: string | null;
}
