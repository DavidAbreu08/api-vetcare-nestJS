import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from "class-validator";
import { Function } from "src/app/core/enums/function.enum";

export class UpdateFuncionarioDto {
  @IsOptional()
  @IsString({ message: "O nome deve ser uma string" })
  @MinLength(2, { message: "O nome deve ter pelo menos 2 caracteres" })
  @MaxLength(100, { message: "O nome deve ter no máximo 100 caracteres" })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email inválido" })
  email?: string;

  @IsOptional()
  @IsInt({ message: "NIF deve ser um número inteiro" })
  @Type(() => Number)
  @Min(100000000, { message: "NIF inválido" })
  @Max(999999999, { message: "NIF inválido" })
  nif?: number;

  @IsOptional()
  @IsString({ message: "O telefone deve ser uma string" })
  @Matches(/^\d{9}$/, { message: "O telefone deve ter 9 dígitos" })
  phone?: string;

  @IsOptional()
  @IsBoolean({ message: "isActive deve ser booleano" })
  isActive?: boolean;

  @IsOptional()
  @IsEnum(Function, { message: "Função inválida" })
  function?: Function;

  @IsOptional()
  @IsString({ message: "workLoad deve ser uma string" })
  @MaxLength(50, { message: "workLoad deve ter no máximo 50 caracteres" })
  workLoad?: string;

  @IsOptional()
  @IsString({ message: "profilePicture deve ser uma string" })
  @MaxLength(255, { message: "profilePicture deve ter no máximo 255 caracteres" })
  profilePicture?: string;
}