import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmployeeJobTitleEntity } from "../employees/entities/employee-job-title.entity";
import { JobTitleEntity } from "./entities/job-title.entity";
import { JobTitlesService } from "./job-titles.service";
import { JobTitlesBusinessService } from "./job-titles.business.service";
import { JobTitlesController } from "./job-titles.controller";

@Module({
  imports: [TypeOrmModule.forFeature([JobTitleEntity, EmployeeJobTitleEntity])],
  controllers: [JobTitlesController],
  providers: [JobTitlesService, JobTitlesBusinessService],
  exports: [JobTitlesService],
})
export class JobTitlesModule {}
