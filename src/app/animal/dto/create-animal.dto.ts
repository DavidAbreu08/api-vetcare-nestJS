import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateAnimalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsInt()
  @Min(0)
  age: number;

  @IsString()
  color: string;

  @IsString()
  breed: string;

  @IsInt()
  weight: number;

  @IsInt()
  height: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  image: string;

  @IsString()
  gender: string;

  @IsUUID()
  ownerId: string;
}
