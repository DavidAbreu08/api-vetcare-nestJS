import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One weekly working period in clinic local time (Europe/Lisbon). */
export class EmployeeSchedulePeriodDto {
  @ApiProperty({ type: "integer", minimum: 0, maximum: 6, example: 1, description: "Weekday: 0 = Sunday, 1 = Monday ... 6 = Saturday." })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ type: String, example: "09:00", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "Start, HH:mm clinic local time; 01:00-01:59 is rejected (daylight-saving transition hour)." })
  @IsString()
  @Matches(TIME_PATTERN)
  startTime: string;

  @ApiProperty({ type: String, example: "13:00", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "End, HH:mm clinic local time, after startTime on the same day." })
  @IsString()
  @Matches(TIME_PATTERN)
  endTime: string;

  @ApiProperty({ type: String, format: "date", example: "2030-01-01", description: "First clinic date (inclusive) on which the period applies." })
  @IsDateString()
  @Matches(DATE_PATTERN)
  validFrom: string;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true, example: null, description: "Last clinic date (inclusive); omitted or null = open-ended. On or after validFrom." })
  @IsOptional()
  @IsDateString()
  @Matches(DATE_PATTERN)
  validUntil?: string | null;
}

/** Full replacement of an employee's weekly schedule. An empty list removes it (the clinic hours apply again). */
export class ReplaceEmployeeSchedulesDto {
  @ApiProperty({
    type: [EmployeeSchedulePeriodDto],
    description: "Every period of the new schedule (several per weekday allowed). Periods of the same weekday with intersecting validity must not overlap; touching periods are allowed.",
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EmployeeSchedulePeriodDto)
  periods: EmployeeSchedulePeriodDto[];
}
