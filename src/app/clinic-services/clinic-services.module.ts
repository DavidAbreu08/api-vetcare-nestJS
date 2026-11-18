import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ClinicServicesBusinessService } from "./clinic-services.business.service";
import { ClinicServicesController } from "./clinic-services.controller";
import { ClinicServicesService } from "./clinic-services.service";
import { ClinicServiceEntity } from "./entities/clinic-service.entity";
import { EmployeeServiceEntity } from "./entities/employee-service.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ClinicServiceEntity, EmployeeServiceEntity])],
  controllers: [ClinicServicesController],
  providers: [ClinicServicesService, ClinicServicesBusinessService],
  exports: [ClinicServicesService],
})
export class ClinicServicesModule {}
