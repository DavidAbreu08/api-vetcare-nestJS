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

export class CreateClientDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  dateBirth: string;

  @IsNotEmpty()
  @IsString()
  @Matches(RegExHelper.phoneRegex, {
    message: "Phone number must be 9 digits and only contain numbers",
  })
  phone: string;

  @IsInt({ message: "NIF must be an integer" })
  @Type(() => Number)
  @Min(100000000, { message: "NIF Invalid" })
  @Max(999999999, { message: "NIF Invalid" })
  nif: number;

}
