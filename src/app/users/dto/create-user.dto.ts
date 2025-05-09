import {
  IsNotEmpty,
  IsEmail,
  Matches,
  IsString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { RegExHelper } from "../../helpers/regex.helper";
import { MessagesHelper } from "../../helpers/messages.helper";

export class CreateUserDto {
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  password: string;

  // TODO: Later create another dto for inserting, on tests
}
