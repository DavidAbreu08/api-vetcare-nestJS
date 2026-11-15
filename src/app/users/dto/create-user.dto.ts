import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, Matches } from "class-validator";
import { RegExHelper } from "../../helpers/regex.helper";
import { MessagesHelper } from "../../helpers/messages.helper";
import { AccountField } from "./account-fields";

/** Self-register a client account with a password; the role in CLIENT_ROLE_ID is assigned. */
export class CreateUserDto extends DescriptiveMetadataDto {
  @AccountField.name()
  @ApiProperty({ description: "Full display name.", maxLength: 150 })
  name: string;

  @AccountField.email()
  @ApiProperty({ description: "Email address used for the account (stored lowercase).", maxLength: 255 })
  email: string;

  @IsNotEmpty()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  @ApiProperty({ description: "Account password meeting the password policy.", format: "password" })
  password: string;
}
