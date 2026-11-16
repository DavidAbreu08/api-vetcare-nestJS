import { IsString, Matches } from "class-validator";
import { MessagesHelper } from "src/app/helpers/messages.helper";
import { RegExHelper } from "src/app/helpers/regex.helper";
import { AuthMessages } from "../auth.messages";
import { ApiProperty } from "@nestjs/swagger";

/** Format of the tokens issued by generateResetToken (32 random bytes as lowercase hex). */
export const RESET_TOKEN_FORMAT = /^[0-9a-f]{64}$/;

export class ResetPasswordDto {
  @ApiProperty({ type: String, pattern: "^[0-9a-f]{64}$", minLength: 64, maxLength: 64, writeOnly: true, description: "Single-use reset token from the recovery email." })
  @IsString()
  @Matches(RESET_TOKEN_FORMAT, { message: AuthMessages.INVALID_RESET_TOKEN_FORMAT })
  resetToken: string;

  @ApiProperty({ type: String, format: "password", writeOnly: true, description: "New password meeting the password policy." })
  @IsString()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  newPassword: string;

  @ApiProperty({ type: String, format: "password", writeOnly: true, description: "Must match newPassword." })
  @IsString()
  confirmNewPassword: string;
}
