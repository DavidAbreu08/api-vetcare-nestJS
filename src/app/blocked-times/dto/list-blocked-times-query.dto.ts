import { IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { ISO_INSTANT_WITH_OFFSET } from "../../core/persistence/utc-datetime";

/** Filters (blocks intersecting [from, to)) and pagination of blocked times. */
export class ListBlockedTimesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ type: String, format: "date-time", example: "2030-01-07T00:00:00Z", description: "Only blocks ending after this instant (ISO-8601 with offset)." })
  @IsOptional()
  @IsString()
  @Matches(ISO_INSTANT_WITH_OFFSET)
  from?: string;

  @ApiPropertyOptional({ type: String, format: "date-time", example: "2030-01-08T00:00:00Z", description: "Only blocks starting before this instant (ISO-8601 with offset)." })
  @IsOptional()
  @IsString()
  @Matches(ISO_INSTANT_WITH_OFFSET)
  to?: string;

  @ApiPropertyOptional({ type: String, format: "uuid", description: "Only the individual blocks of this employee profile (clinic-wide closures are excluded)." })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
