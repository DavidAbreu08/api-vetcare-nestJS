import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateReservationDto {
  @IsUUID()
  animalId: string;

  @IsDateString()
  date: Date;

  @IsString()
  @IsNotEmpty()
  timeStart: string;

  @IsString()
  @IsNotEmpty()
  timeEnd: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
