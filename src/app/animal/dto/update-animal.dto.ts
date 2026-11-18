import { CreateAnimalDto } from "./create-animal.dto";
import { PartialType } from "@nestjs/swagger";

export class UpdateAnimalDto extends PartialType(CreateAnimalDto) {}
