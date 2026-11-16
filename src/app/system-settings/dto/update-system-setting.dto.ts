import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";

/** Updates a setting value and metadata; the code is immutable and cannot be sent. */
export class UpdateSystemSettingDto extends DescriptiveMetadataDto {
  @ApiPropertyOptional({
    description: "Setting value. *_ROLE_ID settings require the UUID of an existing, active role; RESERVATION_*_MINUTES settings require a non-negative integer.",
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string | null;
}
