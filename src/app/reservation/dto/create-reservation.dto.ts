import { NamedMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

/** Create an appointment using clinic local date and time. */
export class CreateReservationDto extends NamedMetadataDto {
  @IsUUID()
  @ApiProperty({ description: "UUID of the animal belonging to the client.", required: true })
  animalId: string;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ description: "Clinic calendar date in YYYY-MM-DD format.", required: true })
  date: Date;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ description: "Interval start in HH:mm format, clinic local time.", required: true })
  timeStart: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ description: "Interval end in HH:mm format, clinic local time.", required: true })
  timeEnd: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Optional reason or description.", required: false })
  reason?: string;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ description: "Client UUID when staff creates the appointment on behalf of its owner.", required: false })
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ description: "Optional assigned employee UUID.", required: false })
  employeeId?: string;
}
