import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { DescriptiveMetadataDto } from "./metadata.dto";
import { CATALOG_CODE_PATTERN, normalizeCatalogCode } from "../catalog";

/** Shared shape of simple code/name catalogs (roles, job titles). Codes are immutable after creation. */
export class CreateCatalogEntryDto extends DescriptiveMetadataDto {
  @ApiProperty({ description: "Unique uppercase code (letters, digits, underscores; starts with a letter). Immutable.", example: "VETERINARIAN", maxLength: 64 })
  @Transform(({ value }: { value: unknown }) => normalizeCatalogCode(value))
  @IsString()
  @Matches(CATALOG_CODE_PATTERN)
  @MaxLength(64)
  code: string;

  @ApiProperty({ description: "Display name.", maxLength: 100 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: "Inactive entries remain for history but cannot be assigned.", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
