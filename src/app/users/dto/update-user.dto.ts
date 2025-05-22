import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsInt({ message: "NIF must be an integer" })
  @Type(() => Number)
  @Min(100000000, { message: "NIF Invalid" })
  @Max(999999999, { message: "NIF Invalid" })
  nif: number;

  @IsOptional()
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  dateBirth: string;

  @IsOptional()
  @IsString()
  profilePicture: string;
}
