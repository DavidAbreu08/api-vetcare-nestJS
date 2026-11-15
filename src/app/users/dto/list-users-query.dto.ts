import { IsEmail, IsEnum, IsOptional } from "class-validator";
import { ListQueryDto } from "../../core/dto/list-query.dto";
import { Role } from "../../core/enums/role.enum";

/** Filter and paginate the administrator user directory. */
export class ListUsersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEmail()
  email?: string;
}
