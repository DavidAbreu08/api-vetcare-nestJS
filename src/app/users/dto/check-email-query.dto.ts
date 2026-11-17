import { ApiProperty } from "@nestjs/swagger";
import { AccountField } from "./account-fields";

/** Same normalization and validation as account creation. */
export class CheckEmailQueryDto {
  @ApiProperty({ description: "Email to check; surrounding whitespace is removed and the value is converted to lowercase.", format: "email", example: "client@example.com", maxLength: 255 })
  @AccountField.email()
  email: string;
}
