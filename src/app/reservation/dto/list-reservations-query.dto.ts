import { IsEnum, IsOptional, IsUUID, IsDateString, Matches } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { ReservationStatus } from "../../core/enums/reservation-status.enum";

/** Filter and paginate the administrator reservation calendar. */
export class ListReservationsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  animalId?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
