import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";

export class UpdateReservationStatusDto {
  @IsEnum(ReservationStatus)
  status: ReservationStatus;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  rescheduleNote?: string;

  @IsDateString()
  newDate: Date;

  @IsString()
  newTime: string;
}