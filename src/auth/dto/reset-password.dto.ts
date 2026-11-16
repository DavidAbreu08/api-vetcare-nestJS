import { IsString, Matches } from "class-validator";
import { MessagesHelper } from "src/app/helpers/messages.helper";
import { RegExHelper } from "src/app/helpers/regex.helper";
import { AuthMessages } from "../auth.messages";

/** Format of the tokens issued by generateResetToken (32 random bytes as lowercase hex). */
export const RESET_TOKEN_FORMAT = /^[0-9a-f]{64}$/;

export class ResetPasswordDto {
  @IsString()
  @Matches(RESET_TOKEN_FORMAT, { message: AuthMessages.INVALID_RESET_TOKEN_FORMAT })
  resetToken: string;

  @IsString()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
