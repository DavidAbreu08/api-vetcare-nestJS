import { IsOptional, IsUUID } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Optional collection filters; access control still restricts non-staff callers to the animals they are an active tutor of. */
export class ListAnimalsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid", description: "Restrict results to animals of which this account is an active tutor (primary or secondary)" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Restrict results to one species" })
  @IsOptional()
  @IsUUID()
  speciesId?: string;
}