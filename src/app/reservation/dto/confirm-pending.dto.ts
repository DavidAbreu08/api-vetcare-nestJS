import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";

export class ConfirmPendingDto {
  @IsEnum(ReservationStatus, {
    message: "Status must be confirmed or cancelled",
  })
  status: ReservationStatus;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  confirmationNote?: string;
}
