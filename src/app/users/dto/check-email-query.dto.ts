import { ApiProperty } from "@nestjs/swagger";
import { AccountField } from "./account-fields";

/** Same normalization and validation as account creation. */
export class CheckEmailQueryDto {
  @ApiProperty({ description: "Email a verificar; espaços exteriores são removidos e o valor é convertido para minúsculas.", format: "email", example: "cliente@example.com", maxLength: 255 })
  @AccountField.email()
  email: string;
}
