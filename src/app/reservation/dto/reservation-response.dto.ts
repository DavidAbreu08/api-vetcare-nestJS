import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ReservationStatus } from "../../core/enums/reservation-status.enum";
import { ClinicServiceSummaryDto } from "../../clinic-services/dto/clinic-service.dto";

/**
 * Documentation of the reservation `result` (serializeReservation). Related accounts are projected per caller:
 * non-administrators get reduced `client`/`employee` objects and no animal owner; administrators get full accounts.
 */
export class ReservationResponseDto {
  @ApiProperty({ format: "uuid" }) id: string;
  @ApiProperty({ format: "uuid" }) animalId: string;
  @ApiProperty({ format: "uuid", description: "Responsible client (an active tutor of the animal when booked)." }) clientId: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true, description: "Assigned employee profile (vc_employees.id)." }) employeeId: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true, description: "Clinic service (vc_services.id). Null only for reservations created before the services catalog; immutable." }) serviceId: string | null;
  @ApiProperty({ type: ClinicServiceSummaryDto, nullable: true, description: "Service summary { id, code, name, durationMinutes } (current catalog values; the booked interval is startAt/endAt). Null for legacy reservations." })
  service: ClinicServiceSummaryDto | null;

  @ApiProperty({
    type: String, format: "uuid", nullable: true,
    description: "Account that created the reservation (always the authenticated caller of POST /reservations; immutable). "
      + "Visible to administrators; other callers only see it when it is their own id, null otherwise. Null also means system/unknown author.",
  })
  createdBy: string | null;

  @ApiProperty({ description: "True when the caller created the reservation; returned to every caller." }) createdBySelf: boolean;

  @ApiProperty({ type: String, format: "date-time", description: "UTC instant." }) startAt: string;
  @ApiProperty({ type: String, format: "date-time", description: "UTC instant." }) endAt: string;
  @ApiProperty({ enum: ReservationStatus }) status: ReservationStatus;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true }) confirmedAt: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true }) cancelledAt: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt: string;

  @ApiPropertyOptional({ type: Object, description: "Client: { id, name, email, phone } for non-administrators; full account for administrators." }) client?: object;
  @ApiPropertyOptional({ type: Object, nullable: true, description: "Employee: { id, name, profilePictureUrl } for non-administrators; administrators also get userId and the account." }) employee?: object | null;
  @ApiPropertyOptional({ type: Object, description: "Animal; its owner is only included for administrators." }) animal?: object;
  @ApiPropertyOptional({ enum: ["sent", "failed", "not_requested"], description: "Email notification result of write operations." }) notificationStatus?: string;
}
