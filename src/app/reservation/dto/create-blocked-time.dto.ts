import { NamedMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";
import { IsDateString, IsOptional, IsString } from "class-validator";

/** Create a global clinic time block. */
export class CreateBlockedTimeDto extends NamedMetadataDto {
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ description: "Clinic calendar date in YYYY-MM-DD format.", required: true })
  date: Date; // YYYY-MM-DD

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ description: "Interval start in HH:mm format, clinic local time.", required: true })
  timeStart: string; // HH:mm

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ description: "Interval end in HH:mm format, clinic local time.", required: true })
  timeEnd: string; // HH:mm

  @IsString()
  @IsOptional()
  @ApiProperty({ description: "Optional reason or description.", required: false })
  reason?: string;
}
