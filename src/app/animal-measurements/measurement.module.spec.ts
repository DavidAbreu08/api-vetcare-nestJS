import { MeasurementTypeEntity } from "../measurement-types/entities/measurement-type.entity";
import { Test } from "@nestjs/testing";
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

it("resolves the integrated animal/catalog/measurement dependency graph without a database", async () => {
  const builder = Test.createTestingModule({ imports: [PersistenceModule, AnimalModule] });
  for (const entity of [AnimalEntity, UsersEntity, SpeciesEntity, BreedEntity, AnimalMeasurementEntity, MeasurementTypeEntity]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  const module = await builder.compile();
  expect(module.get(AnimalService)).toBeInstanceOf(AnimalService);
  expect(module.get(MeasurementService)).toBeInstanceOf(MeasurementService);
  await module.close();
});
