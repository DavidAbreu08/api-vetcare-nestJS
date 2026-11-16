import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";

/** Updates a setting value and metadata; the code is immutable and cannot be sent. */
export class UpdateSystemSettingDto extends DescriptiveMetadataDto {
  @ApiPropertyOptional({
    description: "Setting value. *_ROLE_ID settings require the UUID of an existing, active role; *_JOB_TITLE_ID settings the UUID of an existing, active job title, or null or an empty string to clear them (not configured; for VETERINARIAN_JOB_TITLE_ID only administrators approve animal data); RESERVATION_*_MINUTES settings require a non-negative integer.",
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string | null;
}
