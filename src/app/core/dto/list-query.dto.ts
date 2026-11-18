import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/** Bounded pagination shared by resource collection endpoints. */
export class ListQueryDto {
  @ApiPropertyOptional({ type: "integer", default: 0, example: 0, minimum: 0, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  skip: number = 0;

  @ApiPropertyOptional({ type: "integer", default: 50, example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take: number = 50;
}
