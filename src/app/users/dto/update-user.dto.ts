import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";
import { AccountField } from "./account-fields";

/** Updates account data; omitted fields are retained and null clears optional fields. email and isActive are administrator-only. */
export class UpdateUserDto extends DescriptiveMetadataDto {
  @IsOptional()
  @AccountField.name()
  @ApiPropertyOptional({ maxLength: 150 })
  name?: string;

  @IsOptional()
  @AccountField.email()
  @ApiPropertyOptional({ description: "Administrator only.", maxLength: 255 })
  email?: string;

  @IsOptional()
  @AccountField.nif()
  @ApiPropertyOptional({ nullable: true, example: "123456789" })
  nif?: string | null;

  @IsOptional()
  @AccountField.phone()
  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @IsOptional()
  @AccountField.birthDate()
  @ApiPropertyOptional({ nullable: true, example: "1990-05-20" })
  birthDate?: string | null;

  @IsOptional()
  @AccountField.profilePictureUrl()
  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  profilePictureUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: "Administrator only." })
  isActive?: boolean;
}
