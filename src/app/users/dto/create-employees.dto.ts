import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsEmail,
  IsString,
  IsInt,
  Min,
  Max,
  Matches,
  IsEnum,
} from "class-validator";
import { Function } from "src/app/core/enums/function.enum";
import { RegExHelper } from "src/app/helpers/regex.helper";

/** Create an employee account and send its welcome instructions. */
export class CreateEmployeesDto extends DescriptiveMetadataDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: "Full display name.", required: true })
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ description: "Email address used for the account.", required: true })
  email: string;

  @IsInt({ message: "NIF must be an integer" })
  @Type(() => Number)
  @Min(100000000, { message: "NIF Invalid" })
  @Max(999999999, { message: "NIF Invalid" })
  //TODO: Implement a NIF Validator
  @ApiProperty({ description: "Nine-digit Portuguese taxpayer number.", required: true })
  nif: number;

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

  @IsString()
  @IsNotEmpty()
  @IsEnum(Function)
  @ApiProperty({ description: "Employee professional function.", required: true })
  function: Function;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "Employee workload or schedule description.", required: true })
  workLoad: string;
}
