import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsUUID } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { normalizeEmail } from "../../core/catalog";

/** Filter and paginate the administrator user directory. */
export class ListUsersQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: "uuid", description: "Only users holding this role." })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email?: string;
}
