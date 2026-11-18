import { IsString, Matches } from "class-validator";
import { MessagesHelper } from "src/app/helpers/messages.helper";
import { RegExHelper } from "src/app/helpers/regex.helper";
import { ApiProperty } from "@nestjs/swagger";

export class ChangePasswordDto {
  @ApiProperty({ type: String, format: "password", writeOnly: true, description: "Current account password." })
  @IsString()
  oldPassword: string;

  @ApiProperty({ type: String, format: "password", writeOnly: true, description: "New password meeting the password policy." })
  @IsString()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  newPassword: string;

  @ApiProperty({ type: String, format: "password", writeOnly: true, description: "Must match newPassword." })
  @IsString()
  confirmNewPassword: string;
}
