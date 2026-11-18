import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/** Optional business metadata; null explicitly clears a value on updates. */
export class DescriptiveMetadataDto {
  @ApiPropertyOptional({ type: String, maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class NamedMetadataDto extends DescriptiveMetadataDto {
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string | null;
}
