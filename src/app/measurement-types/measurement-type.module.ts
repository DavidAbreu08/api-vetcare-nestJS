import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MeasurementTypeEntity } from "./entities/measurement-type.entity";
import { MeasurementTypeService } from "./measurement-type.service";
import { MeasurementTypeBusinessService } from "./measurement-type.business.service";
import { MeasurementTypeController } from "./measurement-type.controller";

@Module({
  imports: [TypeOrmModule.forFeature([MeasurementTypeEntity])],
  controllers: [MeasurementTypeController],
  providers: [MeasurementTypeService, MeasurementTypeBusinessService],
  exports: [MeasurementTypeService],
})
export class MeasurementTypeModule {}
