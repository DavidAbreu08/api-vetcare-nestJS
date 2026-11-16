import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";
/** Defines a reusable unit and code; built-in codes are examples, not a closed enum. */
export class CreateMeasurementTypeDto {
 @ApiProperty({ example: "TEMPERATURE", maxLength: 64 }) @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(64) code: string;
 @ApiProperty({ maxLength: 255 }) @IsString() @Matches(/\S/) @MaxLength(255) name: string;
 @ApiProperty({ example: "\u00b0C", maxLength: 32 }) @IsString() @Matches(/\S/) @MaxLength(32) unit: string;
 @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
 @ApiPropertyOptional({ nullable: true, maxLength: 240 }) @IsOptional() @IsString() @MaxLength(240) description?: string | null;
 @ApiPropertyOptional({ nullable: true, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}
export class UpdateMeasurementTypeDto extends PartialType(CreateMeasurementTypeDto) {}
