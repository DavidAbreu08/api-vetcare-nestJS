import { AnimalOwnerEntity } from "../animal-owners/entities/animal-owner.entity";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { PersistenceModule } from "../core/persistence/persistence.module";
import { SystemSettingsModule } from "../system-settings/system-settings.module";
import { SystemSettingEntity } from "../system-settings/entities/system-setting.entity";
import { RolesModule } from "../roles/roles.module";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { JobTitlesModule } from "../job-titles/job-titles.module";
import { JobTitleEntity } from "../job-titles/entities/job-title.entity";
import { UsersModule } from "../users/users.module";
import { UsersEntity } from "../users/entities/users.entity";
import { ReservationModule } from "../reservation/reservation.module";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { BlockedTimeEntity } from "../blocked-times/entities/bloked-times.entity";
import { ReservationService } from "../reservation/reservation.service";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { ReservationHistoryEntity } from "../reservation-history/entities/reservation-history.entity";
import { ClinicalVisitEntity } from "../clinical-visits/entities/clinical-visit.entity";
import { EmployeesModule } from "./employees.module";
import { EmployeesService } from "./employees.service";
import { EmployeeEntity } from "./entities/employee.entity";
import { EmployeeJobTitleEntity } from "./entities/employee-job-title.entity";
import { ClinicServicesModule } from "../clinic-services/clinic-services.module";
import { ClinicServicesService } from "../clinic-services/clinic-services.service";
import { ClinicServiceEntity } from "../clinic-services/entities/clinic-service.entity";
import { EmployeeServiceEntity } from "../clinic-services/entities/employee-service.entity";

@Global()
@Module({ providers: [{ provide: DataSource, useValue: {} }], exports: [DataSource] })
class FakeDataSourceModule {}

it("resolves the users/roles/employees/reservation/services dependency graph without a database", async () => {
  const builder = Test.createTestingModule({
    imports: [FakeDataSourceModule, PersistenceModule, SystemSettingsModule, RolesModule, JobTitlesModule, UsersModule, EmployeesModule, ReservationModule, ClinicServicesModule],
  });
  for (const entity of [SystemSettingEntity, RoleEntity, UserRoleEntity, JobTitleEntity, UsersEntity, EmployeeEntity, EmployeeJobTitleEntity, ReservationEntity, BlockedTimeEntity, AnimalEntity, ReservationHistoryEntity, ClinicalVisitEntity, AnimalOwnerEntity, ClinicServiceEntity, EmployeeServiceEntity]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  const module = await builder.compile();
  expect(module.get(EmployeesService)).toBeInstanceOf(EmployeesService);
  expect(module.get(ReservationService)).toBeInstanceOf(ReservationService);
  expect(module.get(ClinicServicesService)).toBeInstanceOf(ClinicServicesService);
  await module.close();
});
