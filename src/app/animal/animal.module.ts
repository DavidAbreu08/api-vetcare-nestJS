import { Module } from "@nestjs/common";
import { AnimalService } from "./animal.service";
import { AnimalController } from "./animal.controller";
import { UsersEntity } from "../users/entities/users.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnimalEntity } from "./entities/animal.entity";

import { SpeciesEntity } from "./entities/species.entity";
import { BreedEntity } from "./entities/breed.entity";
import { TaxonomyService } from "./taxonomy.service";
import { SpeciesController, BreedsController } from "./taxonomy.controller";

@Module({
  imports: [TypeOrmModule.forFeature([AnimalEntity, UsersEntity, SpeciesEntity, BreedEntity])],
  controllers: [AnimalController, SpeciesController, BreedsController],
  providers: [AnimalService, TaxonomyService],
})
export class AnimalModule {}
