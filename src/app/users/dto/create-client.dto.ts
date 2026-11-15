import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsEmail,
  Matches,
  IsString,
  Min,
  Max,
  IsInt,
} from "class-validator";
import { RegExHelper } from "../../helpers/regex.helper";
import { Type } from "class-transformer";

/** Create a client account and send its welcome instructions. */
export class CreateClientDto extends DescriptiveMetadataDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: "Full display name.", required: true })
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ description: "Email address used for the account.", required: true })
  email: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: "Birth date using the existing account date format.", required: true })
  dateBirth: string;

  @IsNotEmpty()
  @IsString()
  @Matches(RegExHelper.phoneRegex, {
    message: "Phone number must be 9 digits and only contain numbers",
  })
  @ApiProperty({ description: "Nine-digit phone number.", required: true })
  phone: string;

  @IsInt({ message: "NIF must be an integer" })
  @Type(() => Number)
  @Min(100000000, { message: "NIF Invalid" })
  @Max(999999999, { message: "NIF Invalid" })
  @ApiProperty({ description: "Nine-digit Portuguese taxpayer number.", required: true })
  nif: number;

}
