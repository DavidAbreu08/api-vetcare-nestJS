import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SpeciesModule } from "../species/species.module";
import { BreedEntity } from "./entities/breed.entity";
import { BreedsService } from "./breeds.service";
import { BreedsBusinessService } from "./breeds.business.service";
import { BreedsController } from "./breeds.controller";

@Module({
  imports: [TypeOrmModule.forFeature([BreedEntity]), SpeciesModule],
  controllers: [BreedsController],
  providers: [BreedsService, BreedsBusinessService],
  exports: [BreedsService],
})
export class BreedsModule {}
