import { Module } from "@nestjs/common";
import { EmployeeSchedulesBusinessService } from "./employee-schedules.business.service";

/**
 * vc_employee_schedules. No controller: GET/PUT /employees/:id/schedules live in EmployeesController (like the service
 * qualifications). Depends only on the global DataSource and PersistenceService (no circular imports).
 */
@Module({
  providers: [EmployeeSchedulesBusinessService],
  exports: [EmployeeSchedulesBusinessService],
})
export class EmployeeSchedulesModule {}
