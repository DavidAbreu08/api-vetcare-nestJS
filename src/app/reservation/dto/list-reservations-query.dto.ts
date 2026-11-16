import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { ReservationStatus } from "../../core/enums/reservation-status.enum";
import { IsoInstant } from "./create-reservation.dto";

/** Filters and pagination; results are always limited to what the caller may see. */
export class ListReservationsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Employee profile id (vc_employees.id)." })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  animalId?: string;

  @ApiPropertyOptional({ description: "Reservations starting at or after this instant (ISO-8601 with offset)." })
  @IsOptional()
  @IsoInstant()
  from?: string;

  @ApiPropertyOptional({ description: "Reservations starting before this instant (ISO-8601 with offset)." })
  @IsOptional()
  @IsoInstant()
  to?: string;
}
