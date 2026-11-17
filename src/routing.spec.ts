import "reflect-metadata";
import { ExecutionContext, INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import * as request from "supertest";
import { AnimalController } from "./app/animal/animal.controller";
import { AnimalOwnersController } from "./app/animal-owners/animal-owners.controller";
import { MeasurementController } from "./app/animal-measurements/measurement.controller";
import { BlockedTimeController } from "./app/blocked-times/blocked-time.controller";
import { BreedsController } from "./app/breeds/breeds.controller";
import { ClinicalVisitController } from "./app/clinical-visits/clinical-visit.controller";
import { ClinicServicesController } from "./app/clinic-services/clinic-services.controller";
import { EmployeesController } from "./app/employees/employees.controller";
import { JobTitlesController } from "./app/job-titles/job-titles.controller";
import { MeasurementTypeController } from "./app/measurement-types/measurement-type.controller";
import { ClinicController } from "./app/reservation/clinic.controller";
import { ReservationController } from "./app/reservation/reservation.controller";
import { RolesController } from "./app/roles/roles.controller";
import { SpeciesController } from "./app/species/species.controller";
import { SystemSettingsController } from "./app/system-settings/system-settings.controller";
import { UsersController } from "./app/users/users.controller";
import { AuthController } from "./auth/auth.controller";
import { RolesGuard } from "./app/core/guards/roles/roles.guard";
import { HttpResponseModule } from "./app/core/http-response.module";
import { setupSwagger } from "./swagger";
import { API_PREFIX, configureApiRouting } from "./api-routing";

const controllers = [AnimalController, AnimalOwnersController, MeasurementController, BlockedTimeController, BreedsController, ClinicalVisitController, ClinicServicesController, EmployeesController, JobTitlesController, MeasurementTypeController, ClinicController, ReservationController, RolesController, SpeciesController, SystemSettingsController, UsersController, AuthController];
const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Exercises the real controllers/route table, with domain services isolated from SQL and email. */
describe("API routing and published OpenAPI contract", () => {
  let app: INestApplication;
  const services = new Map<Function, Record<string, jest.Mock>>();
  const previousSwagger = process.env.SWAGGER_ENABLED;
  const actor = { id: uuid, roleIds: [], isAdmin: true, isEmployee: false, isClient: true, employeeId: null };

  beforeAll(async () => {
    const providers = controllers.flatMap(controller => Reflect.getMetadata("design:paramtypes", controller) ?? [])
      .filter((token, index, all) => all.indexOf(token) === index)
      .map(token => {
        const methods: Record<string, jest.Mock> = {};
        services.set(token, methods);
        return { provide: token, useValue: new Proxy({}, { get: (_target, key: string) => {
          if (key === "then" || key.startsWith("on") || key === "constructor") return undefined;
          return methods[key] ??= jest.fn().mockImplementation(() => ({ handler: key }));
        } }) };
      });
    const allow = { canActivate(context: ExecutionContext) { context.switchToHttp().getRequest().user = actor; return true; } };
    const builder = Test.createTestingModule({ imports: [HttpResponseModule], controllers, providers });
    for (const guard of [AuthGuard("jwt"), AuthGuard("local"), RolesGuard, ThrottlerGuard]) builder.overrideGuard(guard).useValue(allow);
    const module = await builder.compile();
    app = module.createNestApplication();
    configureApiRouting(app);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    process.env.SWAGGER_ENABLED = "true";
    setupSwagger(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (previousSwagger === undefined) delete process.env.SWAGGER_ENABLED;
    else process.env.SWAGGER_ENABLED = previousSwagger;
  });

  it("has no duplicate verb/path patterns across controllers", () => {
    const routes: string[] = [];
    for (const controller of controllers) {
      const prefix = Reflect.getMetadata(PATH_METADATA, controller);
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const path = `${prefix}/${Reflect.getMetadata(PATH_METADATA, handler)}`.replace(/\/+$/, "").replace(/:[^/]+/g, ":param");
        routes.push(`${RequestMethod[method]} ${path}`);
      }
    }
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("serves resources only under the VetCare prefix", async () => {
    await request(app.getHttpServer()).get("/api/vetcare/clinic/hours").expect(200);
    await request(app.getHttpServer()).get("/api/clinic/hours").expect(404);
    await request(app.getHttpServer()).get("/clinic/hours").expect(404);
  });

  it.each([
    ["/api/vetcare/employees/me", "getMine"],
    ["/api/vetcare/employees/available/2026-11-16", "getAvailableByDate"],
    ["/api/vetcare/users/clients", "findAllClients"],
    ["/api/vetcare/animal/all", "findAll"],
    [`/api/vetcare/animal/${uuid}/owners`, "list"],
    [`/api/vetcare/reservations/${uuid}/history`, "getHistory"],
    [`/api/vetcare/services/${uuid}/employees`, "getEmployees"],
    [`/api/vetcare/services/${uuid}`, "getById"],
    [`/api/vetcare/employees/${uuid}/services`, "getServices"],
  ])("dispatches %s to its intended handler", async (path, handler) => {
    const response = await request(app.getHttpServer()).get(path).expect(200);
    expect(response.body.result.handler).toBe(handler);
  });

  it("no longer serves the removed public email availability route", async () => {
    const document = (await request(app.getHttpServer()).get("/docs-json").expect(200)).body;
    expect(Object.keys(document.paths)).not.toContain("/api/vetcare/users/check-email");
    // Matches GET /users/:id, where ParseUUIDPipe rejects "check-email" before any service call.
    await request(app.getHttpServer()).get("/api/vetcare/users/check-email").expect(400);
    expect([...services.values()].flatMap(service => service.checkEmailExists?.mock.calls ?? [])).toHaveLength(0);
  });

  it("updates animals through PATCH and rejects malformed identifiers", async () => {
    const response = await request(app.getHttpServer()).patch(`/api/vetcare/animal/${uuid}`).send({ name: "Rex" }).expect(200);
    expect(response.body.result.handler).toBe("update");
    await request(app.getHttpServer()).get("/api/vetcare/animal/invalid-id").expect(400);
  });

  it("creates clients through the collection route", async () => {
    const body = { name: "Ana", email: "ana@example.com", birthDate: "1990-05-20", phone: "912345678", nif: "123456789" };
    const response = await request(app.getHttpServer()).post("/api/vetcare/users/clients").send(body).expect(201);
    expect(response.body.result.handler).toBe("storeClient");
  });

  it("does not register legacy aliases or duplicated partial-update PUT routes", async () => {
    await request(app.getHttpServer()).post("/api/vetcare/animal/create").send({}).expect(404);
    await request(app.getHttpServer()).patch(`/api/vetcare/animal/update/${uuid}`).send({}).expect(404);
    await request(app.getHttpServer()).post("/api/vetcare/users/create-clients").send({}).expect(404);
    for (const resource of ["animal", "users", "employees", "roles", "job-titles", "species", "breeds", "measurement-types", "system-settings", "blocked-times", "services"]) {
      await request(app.getHttpServer()).put(`/api/vetcare/${resource}/${uuid}`).send({}).expect(404);
      await request(app.getHttpServer()).patch(`/api/vetcare/${resource}/${uuid}`).send({}).expect(200);
    }
  });

  it("uses explicit action statuses and retains the common response envelope", async () => {
    const login = await request(app.getHttpServer()).post("/api/vetcare/auth/login").send({}).expect(200);
    expect(login.body.status).toBe(200);
    const forgot = await request(app.getHttpServer()).post("/api/vetcare/auth/forgot-password").send({ email: "client@example.com" }).expect(202);
    expect(forgot.body.status).toBe(202);
    const transfer = await request(app.getHttpServer()).post(`/api/vetcare/animal/${uuid}/transfer`).send({ newPrimaryUserId: uuid }).expect(200);
    expect(transfer.body.status).toBe(200);
  });

  it("documents every route with the same JWT requirement as its real guards", async () => {
    const response = await request(app.getHttpServer()).get("/docs-json").expect(200);
    const document = response.body;
    expect(Object.keys(document.paths).every(path => path.startsWith(`/${API_PREFIX}/`))).toBe(true);
    for (const controller of controllers) {
      const prefix = Reflect.getMetadata(PATH_METADATA, controller);
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const path = `/${API_PREFIX}/${prefix}/${Reflect.getMetadata(PATH_METADATA, handler)}`.replace(/\/+$/, "").replace(/:([^/]+)/g, "{$1}");
        const operation = document.paths[path]?.[RequestMethod[method].toLowerCase()];
        expect(operation).toBeDefined();
        const guards = [...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []), ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
        const requiresJwt = guards.includes(AuthGuard("jwt"));
        expect(operation.security?.some((security: Record<string, unknown>) => "bearer" in security) ?? false).toBe(requiresJwt);
        expect(operation.tags).toHaveLength(1);
        expect(operation.tags[0]).not.toBe("API");
        expect(operation.summary).toBeTruthy();
        expect(operation.deprecated).not.toBe(true);
        const successStatus = Reflect.getMetadata(HTTP_CODE_METADATA, handler) ?? (method === RequestMethod.POST ? 201 : 200);
        expect(Object.keys(operation.responses)).toContain(String(successStatus));
        if (successStatus !== 204) {
          expect(operation.responses[successStatus].content["application/json"].example).toMatchObject({ status: successStatus, success: true });
          expect(operation.responses[successStatus].content["application/json"].example).toHaveProperty("result");
        }
        for (const parameter of operation.parameters ?? []) {
          if (parameter.in === "query" && ["skip", "take"].includes(parameter.name)) expect(parameter.schema.type).toBe("integer");
        }
      }
    }
    expect(document.paths["/api/vetcare/animal/{id}"].delete.security).toEqual([{ bearer: [] }]);
    expect(document.paths["/api/vetcare/clinic/hours"].get.security ?? []).toEqual([]);
    expect(document.paths["/api/vetcare/reservations"].get.tags).toEqual(["Reservations"]);
    expect(document.paths["/api/vetcare/animal/create"]).toBeUndefined();
    expect(document.paths["/api/vetcare/animal/update/{id}"]).toBeUndefined();
    expect(document.paths["/api/vetcare/users/create-clients"]).toBeUndefined();
    expect(document.paths["/api/vetcare/animal/{id}"].put).toBeUndefined();
    expect(document.paths["/api/vetcare/users/clients"].post.deprecated).not.toBe(true);
    expect(document.paths["/api/vetcare/auth/login"].post.requestBody.content["application/json"].schema.required).toEqual(["email", "password"]);
    expect(document.paths["/api/vetcare/animal/{id}/owners/{userId}"].delete.requestBody.required).toBe(false);
    expect(document.paths["/api/vetcare/animal/{id}/owners/{userId}"].delete.requestBody.content["application/json"].schema).toBeDefined();
    expect(document.paths["/api/vetcare/auth/forgot-password"].post.responses["202"]).toBeDefined();
    expect(document.paths["/api/vetcare/users/{id}"].delete.responses["204"].content).toBeUndefined();
    // Reservation authorship: response fields and the createdBy filter.
    const reservationSchema = document.components.schemas.ReservationResponseDto;
    expect(reservationSchema.properties.createdBy).toMatchObject({ type: "string", format: "uuid", nullable: true });
    expect(reservationSchema.properties.createdBySelf).toMatchObject({ type: "boolean" });
    expect(reservationSchema.required).toEqual(expect.arrayContaining(["createdBy", "createdBySelf"]));
    const createdResult = document.paths["/api/vetcare/reservations"].post.responses["201"].content["application/json"].schema.allOf[1].properties.result;
    expect(createdResult).toEqual({ $ref: "#/components/schemas/ReservationResponseDto" });
    expect(document.paths["/api/vetcare/reservations"].get.responses["200"].content["application/json"].schema.allOf[1].properties.result)
      .toEqual({ type: "array", items: { $ref: "#/components/schemas/ReservationResponseDto" } });
    expect(document.paths["/api/vetcare/reservations"].get.parameters.find((parameter: { name: string }) => parameter.name === "createdBy"))
      .toMatchObject({ in: "query", required: false, schema: { type: "string", format: "uuid" } });
    expect(document.components.schemas.CreateReservationDto.properties).not.toHaveProperty("createdBy");
  });

  it("replaces employee services through PUT with a validated body and documents the services catalog", async () => {
    const replaced = await request(app.getHttpServer()).put(`/api/vetcare/employees/${uuid}/services`).send({ serviceIds: [uuid] }).expect(200);
    expect(replaced.body.result.handler).toBe("replaceServices");
    await request(app.getHttpServer()).put(`/api/vetcare/employees/${uuid}/services`).send({ serviceIds: ["nope"] }).expect(400);
    await request(app.getHttpServer()).put(`/api/vetcare/employees/${uuid}/services`).send({}).expect(400);
    await request(app.getHttpServer()).get("/api/vetcare/services/invalid-id").expect(400);
    await request(app.getHttpServer()).post("/api/vetcare/services").send({ code: "CONSULTATION", name: "Consultation", durationMinutes: 30 }).expect(201);
    await request(app.getHttpServer()).post("/api/vetcare/services").send({ code: "CONSULTATION", name: "Consultation", durationMinutes: 32 }).expect(400);
    await request(app.getHttpServer()).delete(`/api/vetcare/services/${uuid}`).expect(204);
    // Reservations: serviceId required, endAt optional (computed by the server).
    await request(app.getHttpServer()).post("/api/vetcare/reservations").send({ animalId: uuid, startAt: "2030-01-07T10:00:00Z" }).expect(400);
    await request(app.getHttpServer()).post("/api/vetcare/reservations").send({ animalId: uuid, serviceId: uuid, startAt: "2030-01-07T10:00:00Z" }).expect(201);
    await request(app.getHttpServer()).post(`/api/vetcare/reservations/${uuid}/reschedule`).send({ startAt: "2030-01-08T10:00:00Z" }).expect(200);

    const document = (await request(app.getHttpServer()).get("/docs-json").expect(200)).body;
    for (const [path, method] of [["/api/vetcare/services", "get"], ["/api/vetcare/services/{id}", "patch"], ["/api/vetcare/services/{id}/employees", "get"]]) {
      expect(document.paths[path][method].tags).toEqual(["Services"]);
    }
    expect(document.paths["/api/vetcare/services/{id}"].put).toBeUndefined();
    expect(document.paths["/api/vetcare/services/{id}"].delete.responses["204"]).toBeDefined();
    expect(document.paths["/api/vetcare/employees/{id}/services"].put.tags).toEqual(["Employees"]);
    expect(document.paths["/api/vetcare/employees/{id}/services"].put.requestBody.content["application/json"].schema).toEqual({ $ref: "#/components/schemas/ReplaceEmployeeServicesDto" });
    expect(document.components.schemas.CreateClinicServiceDto.properties.durationMinutes).toMatchObject({ type: "integer", minimum: 5, maximum: 1440, multipleOf: 5 });
    expect(document.components.schemas.CreateClinicServiceDto.properties).not.toHaveProperty("price");
    expect(document.paths["/api/vetcare/services"].get.parameters.find((parameter: { name: string }) => parameter.name === "isActive")).toMatchObject({ in: "query", required: false, schema: { type: "boolean" } });
    const create = document.components.schemas.CreateReservationDto;
    expect(create.required).toEqual(expect.arrayContaining(["animalId", "serviceId", "startAt"]));
    expect(create.required).not.toContain("endAt");
    expect(document.components.schemas.RescheduleReservationDto.required).not.toContain("endAt");
    const reservation = document.components.schemas.ReservationResponseDto;
    expect(reservation.properties.serviceId).toMatchObject({ type: "string", format: "uuid", nullable: true });
    expect(reservation.properties.service).toMatchObject({ nullable: true });
    expect(JSON.stringify(reservation.properties.service)).toContain("ClinicServiceSummaryDto");
    expect(document.components.schemas.ClinicServiceSummaryDto.properties.durationMinutes).toMatchObject({ type: "integer" });
  });
});
