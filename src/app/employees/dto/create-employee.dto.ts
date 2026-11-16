import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested,
} from "class-validator";
import { DescriptiveMetadataDto } from "../../core/dto/metadata.dto";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { AccountField } from "../../users/dto/account-fields";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

/** Account created together with the employee profile; a welcome email with a reset link is sent. */
export class CreateEmployeeUserDto extends DescriptiveMetadataDto {
  @AccountField.name()
  @ApiProperty({ description: "Full display name.", maxLength: 150 })
  name: string;

  @AccountField.email()
  @ApiProperty({ description: "Email address used for the account (stored lowercase).", maxLength: 255 })
  email: string;

  @IsOptional()
  @AccountField.phone()
  @ApiPropertyOptional({ description: "Nine-digit phone number.", nullable: true })
  phone?: string | null;

  @IsOptional()
  @AccountField.birthDate()
  @ApiPropertyOptional({ description: "Birth date, YYYY-MM-DD.", nullable: true })
  birthDate?: string | null;

  @IsOptional()
  @AccountField.nif()
  @ApiPropertyOptional({ description: "Nine-digit taxpayer number, as a string.", nullable: true })
  nif?: string | null;
}

/** Employment attributes; omitted fields are retained on update and null clears optional values. */
export class EmployeeFieldsDto extends DescriptiveMetadataDto {
  @ApiPropertyOptional({ description: "Internal employee number; unique when present.", maxLength: 30, nullable: true })
  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/) @MaxLength(30)
  employeeNumber?: string | null;

  @ApiPropertyOptional({ description: "Professional license number.", maxLength: 50, nullable: true })
  @IsOptional() @Transform(trim) @IsString() @Matches(/\S/) @MaxLength(50)
  licenseNumber?: string | null;

  @ApiPropertyOptional({ description: "Hire date, YYYY-MM-DD.", nullable: true })
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hireDate?: string | null;

  @ApiPropertyOptional({ description: "Termination date, YYYY-MM-DD; on or after hireDate.", nullable: true })
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  terminationDate?: string | null;

  @ApiPropertyOptional({ description: "Whether reservations may be assigned to this employee.", default: true })
  @IsOptional() @IsBoolean()
  isAvailableForBookings?: boolean;

  @ApiPropertyOptional({ description: "Job title UUIDs; the list replaces the current assignments.", type: [String], format: "uuid" })
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ArrayUnique((id: string) => (typeof id === "string" ? id.toLowerCase() : id))
  @IsUUID("all", { each: true })
  jobTitleIds?: string[];
}

/** Creates an employee profile for an existing user (userId) or together with a new account (user). */
export class CreateEmployeeDto extends EmployeeFieldsDto {
  @ApiPropertyOptional({ description: "Existing user UUID; mutually exclusive with user.", format: "uuid" })
  @IsOptional() @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: "New account to create; mutually exclusive with userId.", type: CreateEmployeeUserDto })
  @IsOptional() @ValidateNested() @Type(() => CreateEmployeeUserDto)
  user?: CreateEmployeeUserDto;
}

export class UpdateEmployeeDto extends EmployeeFieldsDto {}

export class ListEmployeesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: "Filter by booking availability." })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean()
  isAvailableForBookings?: boolean;
}
