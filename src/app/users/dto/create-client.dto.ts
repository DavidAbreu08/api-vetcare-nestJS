import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ApiProperty } from "@nestjs/swagger";
import { AccountField } from "./account-fields";

/** Create a client account (role from CLIENT_ROLE_ID) and send its welcome instructions. */
export class CreateClientDto extends DescriptiveMetadataDto {
  @AccountField.name()
  @ApiProperty({ description: "Full display name.", maxLength: 150 })
  name: string;

  @AccountField.email()
  @ApiProperty({ description: "Email address used for the account (stored lowercase).", maxLength: 255 })
  email: string;

  @AccountField.birthDate()
  @ApiProperty({ description: "Birth date, YYYY-MM-DD.", example: "1990-05-20" })
  birthDate: string;

  @AccountField.phone()
  @ApiProperty({ description: "Nine-digit phone number." })
  phone: string;

  @AccountField.nif()
  @ApiProperty({ description: "Nine-digit Portuguese taxpayer number, as a string.", example: "123456789" })
  nif: string;
}
