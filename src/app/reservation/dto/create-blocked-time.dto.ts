import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBlockedTimeDto {
  @IsDateString()
  date: Date; // YYYY-MM-DD

  @IsString()
  time: string; // HH:mm

  @IsString()
  @IsOptional()
  reason?: string;

}
