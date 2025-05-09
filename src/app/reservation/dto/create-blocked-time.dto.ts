import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateBlockedTimeDto {
  @IsDateString()
  date: Date; // YYYY-MM-DD

  @IsString()
  timeStart: string; // HH:mm

  @IsString()
  timeEnd: string; // HH:mm

  @IsString()
  @IsOptional()
  reason?: string;
}
