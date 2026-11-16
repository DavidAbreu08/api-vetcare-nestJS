import { MeasurementTypeEntity } from "../measurement-types/entities/measurement-type.entity";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AnimalModule } from "../animal/animal.module";
import { AnimalService } from "../animal/animal.service";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { UsersEntity } from "../users/entities/users.entity";
import { SpeciesEntity } from "../species/entities/species.entity";
import { BreedEntity } from "../breeds/entities/breed.entity";
import { PersistenceModule } from "../core/persistence/persistence.module";
import { AnimalMeasurementEntity } from "./entities/animal-measurement.entity";
import { MeasurementService } from "./measurement.service";
import { SystemSettingsModule } from "../system-settings/system-settings.module";
import { SystemSettingEntity } from "../system-settings/entities/system-setting.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { ClinicalVisitEntity } from "../clinical-visits/entities/clinical-visit.entity";
import { ClinicalVisitService } from "../clinical-visits/clinical-visit.service";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryEntity } from "../reservation-history/entities/reservation-history.entity";

@Global()
@Module({ providers: [{ provide: DataSource, useValue: {} }], exports: [DataSource] })
class FakeDataSourceModule {}

it("resolves the integrated animal/catalog/measurement dependency graph without a database", async () => {
  const builder = Test.createTestingModule({ imports: [FakeDataSourceModule, PersistenceModule, SystemSettingsModule, AnimalModule] });
  for (const entity of [AnimalEntity, UsersEntity, SpeciesEntity, BreedEntity, AnimalMeasurementEntity, MeasurementTypeEntity, SystemSettingEntity, RoleEntity, UserRoleEntity, EmployeeEntity, ClinicalVisitEntity, ReservationEntity, ReservationHistoryEntity]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  const module = await builder.compile();
  expect(module.get(AnimalService)).toBeInstanceOf(AnimalService);
  expect(module.get(MeasurementService)).toBeInstanceOf(MeasurementService);
  expect(module.get(ClinicalVisitService)).toBeInstanceOf(ClinicalVisitService);
  await module.close();
});
