import { Matches } from "class-validator";
import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateBlockedTimeDto {
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: Date; // YYYY-MM-DD

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeStart: string; // HH:mm

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeEnd: string; // HH:mm

  @IsString()
  @IsOptional()
  reason?: string;
}
