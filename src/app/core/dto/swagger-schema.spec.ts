import { Body, Controller, INestApplication, Patch } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ApiExtraModels, DocumentBuilder, SchemaObject, SwaggerModule } from "@nestjs/swagger";
import { UpdateAnimalDto } from "../../animal/dto/update-animal.dto";
import { CreateAnimalDto } from "../../animal/dto/create-animal.dto";
import { CreateSpeciesDto, UpdateSpeciesDto } from "../../species/dto/create-species.dto";
import { CreateRoleDto, UpdateRoleDto } from "../../roles/dto/create-role.dto";
import { CreateJobTitleDto, UpdateJobTitleDto } from "../../job-titles/dto/create-job-title.dto";
import { CreateBlockedTimeDto } from "../../blocked-times/dto/create-blocked-time.dto";
import { UpdateBlockedTimeDto } from "../../blocked-times/dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "../../blocked-times/dto/list-blocked-times-query.dto";
import { ChangePasswordDto } from "../../../auth/dto/change-password.dto";
import { ForgotPasswordDto } from "../../../auth/dto/forgot-password.dto";
import { ResetPasswordDto } from "../../../auth/dto/reset-password.dto";
import * as EmployeeDtos from "../../employees/dto/create-employee.dto";
import * as MeasurementDtos from "../../animal-measurements/dto/create-measurement.dto";
import * as MeasurementTypeDtos from "../../measurement-types/dto/create-measurement-type.dto";
import * as ClinicalVisitDtos from "../../clinical-visits/dto/clinical-visit.dto";
import { UpdateUserDto } from "../../users/dto/update-user.dto";
import { UpdateSystemSettingDto } from "../../system-settings/dto/update-system-setting.dto";

const models: unknown[] = [
  CreateAnimalDto, UpdateAnimalDto, CreateSpeciesDto, UpdateSpeciesDto, CreateRoleDto, UpdateRoleDto,
  CreateJobTitleDto, UpdateJobTitleDto, CreateBlockedTimeDto, UpdateBlockedTimeDto, ListBlockedTimesQueryDto,
  ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, UpdateUserDto, UpdateSystemSettingDto,
  ...Object.values(EmployeeDtos), ...Object.values(MeasurementDtos), ...Object.values(MeasurementTypeDtos),
  ...Object.entries(ClinicalVisitDtos).filter(([name]) => name.endsWith("Dto")).map(([, model]) => model),
];
const extraModels = models.filter((model): model is Function => typeof model === "function");

@ApiExtraModels(...extraModels)
@Controller("schema-probe")
class SchemaProbeController {
  @Patch("animal")
  updateAnimal(@Body() body: UpdateAnimalDto) { return body; }
}

describe("Public DTO OpenAPI schemas", () => {
  let app: INestApplication;
  let schemas: Record<string, SchemaObject>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [SchemaProbeController] }).compile();
    app = module.createNestApplication();
    await app.init();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    schemas = document.components!.schemas as Record<string, SchemaObject>;
  });

  afterAll(async () => app?.close());

  it.each([
    ["CreateAnimalDto", "UpdateAnimalDto"],
    ["CreateSpeciesDto", "UpdateSpeciesDto"],
    ["CreateRoleDto", "UpdateRoleDto"],
    ["CreateJobTitleDto", "UpdateJobTitleDto"],
    ["CreateBlockedTimeDto", "UpdateBlockedTimeDto"],
    ["CreateMeasurementTypeDto", "UpdateMeasurementTypeDto"],
  ])("retains all %s properties while making %s optional", (createName, updateName) => {
    expect(Object.keys(schemas[createName].properties!).length).toBeGreaterThan(0);
    expect(Object.keys(schemas[updateName].properties!)).toEqual(Object.keys(schemas[createName].properties!));
    expect(schemas[updateName].required ?? []).toEqual([]);
  });

  it("documents auth request properties and treats passwords/tokens as write-only", () => {
    expect(schemas.ForgotPasswordDto.properties!.email).toMatchObject({ type: "string", format: "email" });
    expect(schemas.ChangePasswordDto.required).toEqual(["oldPassword", "newPassword", "confirmNewPassword"]);
    expect(schemas.ResetPasswordDto.required).toEqual(["resetToken", "newPassword", "confirmNewPassword"]);
    for (const schema of [schemas.ChangePasswordDto, schemas.ResetPasswordDto]) {
      for (const property of Object.values(schema.properties!)) expect(property).toMatchObject({ type: "string", writeOnly: true });
    }
  });

  it("represents nullable primitives using their public primitive type", () => {
    let count = 0;
    for (const schema of Object.values(schemas)) {
      for (const property of Object.values(schema.properties ?? {})) {
        const field = property as SchemaObject;
        if (field.nullable) {
          count++;
          expect(["string", "boolean", "number", "integer"]).toContain(field.type);
        }
      }
    }
    expect(count).toBeGreaterThan(20);
    expect(schemas.CreateAnimalDto.properties!.isNeutered).toMatchObject({ type: "boolean", nullable: true });
  });

  it("keeps immutable fields out of measurement updates", () => {
    expect(schemas.UpdateMeasurementDto.properties).toHaveProperty("value");
    expect(schemas.UpdateMeasurementDto.properties).not.toHaveProperty("animalId");
    expect(schemas.UpdateMeasurementDto.properties).not.toHaveProperty("measurementTypeId");
    expect(schemas.UpdateMeasurementDto.properties).not.toHaveProperty("clinicalVisitId");
    expect(schemas.UpdateMeasurementDto.required ?? []).toEqual([]);
  });

  it("documents blocked calendar dates as date strings and includes the date query filter", () => {
    expect(schemas.CreateBlockedTimeDto.properties!.date).toMatchObject({ type: "string", format: "date" });
    expect(schemas.ListBlockedTimesQueryDto.properties).toHaveProperty("date");
    expect(schemas.ListBlockedTimesQueryDto.properties).toHaveProperty("skip");
    expect(schemas.ListBlockedTimesQueryDto.properties).toHaveProperty("take");
  });
});
