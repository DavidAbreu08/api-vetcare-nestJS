import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
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

/** Register a client account with a password. */
export class CreateUserDto extends DescriptiveMetadataDto {
  @IsString()
  @ApiProperty({ description: "Full display name.", required: true })
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ description: "Email address used for the account.", required: true })
  email: string;

  @IsNotEmpty()
  @Matches(RegExHelper.password, { message: MessagesHelper.PASSWORD_VALID })
  @ApiProperty({ description: "Account password meeting the password policy.", required: true })
  password: string;

  // TODO: Later create another dto for inserting, on tests
}
