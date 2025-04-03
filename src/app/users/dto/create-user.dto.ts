import { IsNotEmpty, IsEmail, Matches, IsString, IsInt, Min, Max } from 'class-validator';
import { RegExHelper } from '../../helpers/regex.helper';
import { MessagesHelper } from '../../helpers/messages.helper';
import { Type } from 'class-transformer';


export class CreateUserDto {
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @Matches(RegExHelper.password,{ message: MessagesHelper.PASSWORD_VALID })
  password: string;

  // TODO: Later create another dto for inserting, on tests
  /** 
    @IsInt({ message: 'NIF must be an integer' })
    @Type(() => Number)
    @Min(100000000, { message: 'NIF Invalid' })
    @Max(999999999, { message: 'NIF Invalid' })
    //TODO: Implement a NIF Validator
    nif?: number;

    @IsString()
    @Matches(RegExHelper.phoneRegex, { message: 'Phone number must be 9 digits and only contain numbers' })
    phone?:string;

    @IsString()
    dataBirth?:string;

    @IsString()
    func?:string
  */
}