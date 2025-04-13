import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReservationStatus } from 'src/app/core/enums/reservation-status.enum';

export class ConfirmRescheduleDto {
  @IsEnum(ReservationStatus, { message: 'Status must be confirmed or cancelled' })
  status: ReservationStatus;

  @IsOptional()
  @IsString()
  confirmationNote?: string;
}
