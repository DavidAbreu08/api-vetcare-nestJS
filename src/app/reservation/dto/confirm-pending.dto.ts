import { IsIn } from "class-validator";
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";

export class ConfirmPendingDto {
  @IsIn([ReservationStatus.CONFIRMED], {
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
