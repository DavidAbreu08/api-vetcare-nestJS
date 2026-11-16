import { MeasurementModule } from "../animal-measurements/measurement.module";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersEntity } from "../users/entities/users.entity";
import { SpeciesModule } from "../species/species.module";
import { BreedsModule } from "../breeds/breeds.module";
import { AnimalEntity } from "./entities/animal.entity";
import { AnimalService } from "./animal.service";
import { AnimalBusinessService } from "./animal.business.service";
import { AnimalController } from "./animal.controller";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [TypeOrmModule.forFeature([AnimalEntity, UsersEntity]), SpeciesModule, BreedsModule, MeasurementModule, RolesModule],
  controllers: [AnimalController],
  providers: [AnimalService, AnimalBusinessService],
})
export class AnimalModule {}