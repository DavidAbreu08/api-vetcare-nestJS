import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";

export class UpdateReservationStatusDto {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status: ReservationStatus;

  @IsOptional()
  @IsDateString()
  newDate: Date;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) // HH:mm format
  newTimeStart: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) // HH:mm format
  newTimeEnd: string;

  @IsOptional()
  @IsString()
  rescheduleNote?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
