import { IsEmail } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ForgotPasswordDto {
  @ApiProperty({ type: String, format: "email", example: "client@example.com" })
  @IsEmail()
  email: string;
}
