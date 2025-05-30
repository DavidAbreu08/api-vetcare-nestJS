import { IsString, Matches } from "class-validator";
import { MessagesHelper } from "src/app/helpers/messages.helper";
import { RegExHelper } from "src/app/helpers/regex.helper";

export class ResetPasswordDto {
  @IsString()
  resetToken: string;

  @IsString()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
