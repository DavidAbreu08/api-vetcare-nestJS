import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from "src/email/email.module";
import { UsersModule } from "../users/users.module";
import { EmployeeEntity } from "./entities/employee.entity";
import { EmployeesService } from "./employees.service";
import { EmployeesBusinessService } from "./employees.business.service";
import { EmployeesController } from "./employees.controller";
import { EmployeeSchedulesModule } from "../employee-schedules/employee-schedules.module";

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeEntity]), UsersModule, EmailModule, EmployeeSchedulesModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesBusinessService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
