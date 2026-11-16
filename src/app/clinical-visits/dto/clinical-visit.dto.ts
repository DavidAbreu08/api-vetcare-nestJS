import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { ClinicalVisitStatus } from "../enums/clinical-visit-status.enum";

/** Upper bound for free-text clinical notes (nvarchar(max) column), to keep request bodies bounded. */
export const CLINICAL_NOTES_MAX_LENGTH = 100000;

/**
 * Start a clinical visit (IN_PROGRESS, startedAt = now): from a CONFIRMED reservation (reservationId; animalId,
 * when sent, must be the reservation's animal) or without reservation (animalId, e.g. emergencies).
 */
export class CreateClinicalVisitDto {
  @ApiPropertyOptional({ format: "uuid", description: "CONFIRMED reservation without a visit." })
  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Required without reservationId; must match the reservation's animal otherwise." })
  @IsOptional()
  @IsUUID()
  animalId?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Responsible employee profile (vc_employees.id). Defaults to the caller; only administrators may choose another employee." })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: CLINICAL_NOTES_MAX_LENGTH, description: "Professional notes; never shown to clients." })
  @IsOptional()
  @IsString()
  @MaxLength(CLINICAL_NOTES_MAX_LENGTH)
  clinicalNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;
}

/** Edit an IN_PROGRESS visit; completed and voided visits are immutable. */
export class UpdateClinicalVisitDto {
  @ApiPropertyOptional({ nullable: true, maxLength: CLINICAL_NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(CLINICAL_NOTES_MAX_LENGTH)
  clinicalNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;
}

/** IN_PROGRESS -> COMPLETED (endedAt = now); optional final notes. */
export class CompleteClinicalVisitDto {
  @ApiPropertyOptional({ nullable: true, maxLength: CLINICAL_NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(CLINICAL_NOTES_MAX_LENGTH)
  clinicalNotes?: string | null;
}

/** IN_PROGRESS -> VOIDED (administrators); the justification is mandatory and audited. */
export class VoidClinicalVisitDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  reason: string;
}

export class ListClinicalVisitsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() animalId?: string;
  @ApiPropertyOptional({ format: "uuid", description: "Responsible employee profile id." }) @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() reservationId?: string;
  @ApiPropertyOptional({ enum: ClinicalVisitStatus }) @IsOptional() @IsEnum(ClinicalVisitStatus) status?: ClinicalVisitStatus;
}
