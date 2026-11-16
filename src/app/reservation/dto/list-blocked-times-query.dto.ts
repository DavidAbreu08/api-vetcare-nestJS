import { IsDateString, IsOptional, Matches } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";

/** Filter and paginate global clinic time blocks. */
export class ListBlockedTimesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
