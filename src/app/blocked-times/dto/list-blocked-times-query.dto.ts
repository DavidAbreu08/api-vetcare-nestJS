import { IsDateString, IsOptional, Matches } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { ApiPropertyOptional } from "@nestjs/swagger";

/** Filter and paginate global clinic time blocks. */
export class ListBlockedTimesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ type: String, format: "date", example: "2030-01-07", description: "Clinic calendar date, YYYY-MM-DD." })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
