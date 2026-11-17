import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** "true"/"false" query strings (and real booleans in JSON bodies) as booleans; anything else is left for @IsBoolean. */
const toBoolean = ({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value);

export class ListAnimalOwnersQueryDto {
  @ApiPropertyOptional({ description: "Also return closed periods (former tutors); staff and the primary tutor only", default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeHistory?: boolean;
}

export class AddAnimalOwnerDto {
  @ApiProperty({ description: "Active client account added as a secondary tutor", format: "uuid" })
  @IsUUID()
  userId: string;
}

/** Body and/or query of DELETE /api/vetcare/animal/:id/owners/:userId. */
export class RemoveAnimalOwnerDto {
  @ApiPropertyOptional({ description: "Move the tutor's open reservations of this animal to the primary tutor (409 otherwise)", default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  transferFutureReservations?: boolean;
}

/** Result of DELETE /api/vetcare/animal/:id/owners/:userId (wrapped in the common success envelope). */
export class RemoveAnimalOwnerResponseDto {
  @ApiProperty({ type: [String], format: "uuid", description: "IDs of the animal's open reservations (PENDING or CONFIRMED, not yet finished) whose client was the departing tutor and that were moved to the primary tutor (transferFutureReservations=true). Empty when none were moved." })
  movedReservationIds: string[];
}

export class TransferAnimalDto {
  @ApiProperty({ description: "Active client account that becomes the primary tutor", format: "uuid" })
  @IsUUID()
  newPrimaryUserId: string;

  @ApiPropertyOptional({ description: "Keep the previous primary tutor as a secondary tutor", default: false })
  @IsOptional()
  @IsBoolean()
  keepPreviousAsSecondary?: boolean;

  @ApiPropertyOptional({ description: "Move the previous primary tutor's open reservations of this animal to the new primary tutor (409 otherwise)", default: false })
  @IsOptional()
  @IsBoolean()
  transferFutureReservations?: boolean;

  @ApiPropertyOptional({ description: "Reason recorded in the CLIENT_CHANGED events of moved reservations", maxLength: 500 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
