import { Module } from "@nestjs/common";
import { EmployeeQualificationService } from "./employee-qualification.service";

/**
 * Standalone so any module can check qualifications without importing EmployeesModule (no circular imports);
 * depends only on the global DataSource and SystemSettingsService.
 */
@Module({
  providers: [EmployeeQualificationService],
  exports: [EmployeeQualificationService],
})
export class EmployeeQualificationModule {}
