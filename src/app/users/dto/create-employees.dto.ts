import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsEmail,
  IsString,
  IsInt,
  Min,
  Max,
  Matches,
} from "class-validator";
import { Function } from "src/app/core/enums/function.enum";
import { RegExHelper } from "src/app/helpers/regex.helper";

export class CreateEmployeesDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsInt({ message: "NIF must be an integer" })
  @Type(() => Number)
  @Min(100000000, { message: "NIF Invalid" })
  @Max(999999999, { message: "NIF Invalid" })
  //TODO: Implement a NIF Validator
  nif: number;

  @IsNotEmpty()
  @IsString()
  dateBirth: string;

  @IsNotEmpty()
  @IsString()
  @Matches(RegExHelper.phoneRegex, {
    message: "Phone number must be 9 digits and only contain numbers",
  })
  phone: string;

  @IsString()
  @IsNotEmpty()
  function: Function;

  @IsString()
  @IsNotEmpty()
  workLoad: string;
}
