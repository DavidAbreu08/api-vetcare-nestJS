import { ClinicalVisitModule } from "../clinical-visits/clinical-visit.module";
import { MeasurementTypeModule } from "../measurement-types/measurement-type.module";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { AnimalMeasurementEntity } from "./entities/animal-measurement.entity";
import { MeasurementBusinessService } from "./measurement.business.service";
import { MeasurementService } from "./measurement.service";
import { MeasurementController } from "./measurement.controller";
@Module({ imports: [MeasurementTypeModule, ClinicalVisitModule, TypeOrmModule.forFeature([AnimalEntity, AnimalMeasurementEntity])], providers: [MeasurementBusinessService, MeasurementService], controllers: [MeasurementController], exports: [MeasurementService] })
export class MeasurementModule {}
