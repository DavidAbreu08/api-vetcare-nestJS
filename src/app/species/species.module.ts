import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SpeciesEntity } from "./entities/species.entity";
import { SpeciesService } from "./species.service";
import { SpeciesBusinessService } from "./species.business.service";
import { SpeciesController } from "./species.controller";

@Module({
  imports: [TypeOrmModule.forFeature([SpeciesEntity])],
  controllers: [SpeciesController],
  providers: [SpeciesService, SpeciesBusinessService],
  exports: [SpeciesService],
})
export class SpeciesModule {}
