import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID, Matches } from "class-validator";

/** GET /availability query. */
export class AvailabilityQueryDto {
  @ApiProperty({ type: String, format: "date", example: "2030-01-07", description: "Clinic calendar date (YYYY-MM-DD, Europe/Lisbon)." })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiProperty({ type: String, format: "uuid", description: "Service to book: its duration sets the slot length and only qualified employees are listed. Unknown: 404; inactive: 409 for administrators, 404 for everyone else." })
  @IsUUID()
  serviceId: string;

  @ApiPropertyOptional({ type: String, format: "uuid", description: "Only this employee profile (unknown: 404; an employee not qualified or not bookable on the date yields an empty list)." })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class AvailabilitySlotDto {
  @ApiProperty({ type: String, format: "date-time", example: "2030-01-07T09:00:00.000Z", description: "UTC start instant." }) startAt: string;
  @ApiProperty({ type: String, format: "date-time", example: "2030-01-07T09:30:00.000Z", description: "UTC end instant (start + service duration)." }) endAt: string;
  @ApiProperty({ type: String, example: "09:00", description: "Start in clinic local time (HH:mm)." }) localStart: string;
}

export class AvailabilityEmployeeDto {
  @ApiProperty({ type: String, format: "uuid", description: "Employee profile id (vc_employees.id)." }) employeeId: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ type: [AvailabilitySlotDto] }) slots: AvailabilitySlotDto[];
}

export class AvailabilityResponseDto {
  @ApiProperty({ type: String, format: "date", example: "2030-01-07" }) date: string;
  @ApiProperty({ type: String, example: "Europe/Lisbon" }) timeZone: string;
  @ApiProperty({ type: "integer", example: 30, description: "Step between candidate starts (CLINIC_POLICY.slotDurationMinutes)." }) slotMinutes: number;
  @ApiProperty({ type: String, format: "uuid" }) serviceId: string;
  @ApiProperty({ type: [AvailabilityEmployeeDto] }) employees: AvailabilityEmployeeDto[];
}
