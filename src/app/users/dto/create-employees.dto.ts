import { Type } from 'class-transformer';
import { IsNotEmpty, IsEmail, IsString, IsInt, Min, Max, Validate, Matches } from 'class-validator';
import { RegExHelper } from 'src/app/helpers/regex.helper';


export class CreateEmployeesDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsInt({ message: 'NIF must be an integer' })
  @Type(() => Number)
  @Min(100000000, { message: 'NIF Invalid' })
  @Max(999999999, { message: 'NIF Invalid' })
  //TODO: Implement a NIF Validator
  nif: number;

  @IsNotEmpty()
  @IsString()
  dataBirth: string;

  @IsNotEmpty()
  @IsString()  // Phone should be a string
  @Matches(RegExHelper.phoneRegex, { message: 'Phone number must be 9 digits and only contain numbers' })
  phone: string;  // Treat phone as a string, not a number

  @IsString()
  @IsNotEmpty()
  func: string;

}