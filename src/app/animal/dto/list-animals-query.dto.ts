import { IsOptional, IsUUID } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Optional collection filters; access control still restricts clients to their own animals. */
export class ListAnimalsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid", description: "Restrict results to an owner" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Restrict results to one species" })
  @IsOptional()
  @IsUUID()
  speciesId?: string;
}