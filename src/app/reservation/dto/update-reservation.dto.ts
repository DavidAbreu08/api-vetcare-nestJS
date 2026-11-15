import { NamedMetadataDto } from "../../core/dto/metadata.dto";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";

export class UpdateReservationStatusDto extends NamedMetadataDto {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  newDate?: Date;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) // HH:mm format
  newTimeStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) // HH:mm format
  newTimeEnd?: string;

  @IsOptional()
  @IsString()
  rescheduleNote?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
