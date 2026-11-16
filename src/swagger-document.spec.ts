import { Controller, Get, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject, ResponseObject, SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { ClinicController } from "./app/reservation/clinic.controller";
import { prepareSwaggerDocument } from "./swagger-document";
import { configureApiRouting } from "./api-routing";
import { setupSwagger } from "./swagger";
import * as request from "supertest";

@ApiTags("Reservas")
@ApiBearerAuth("bearer")
@Controller("reservations")
class DocumentedController {
  @Get()
  @ApiOperation({ summary: "Listar reservas", description: "Apenas reservas visíveis ao utilizador." })
  @ApiResponse({ status: 200, description: "Reservas encontradas.", schema: { type: "array", items: { type: "string" } } })
  @ApiResponse({ status: 409, description: "Conflito de negócio documentado." })
  list() { return []; }
}

function document(): OpenAPIObject {
  return { openapi: "3.0.0", info: { title: "Test", version: "1" }, paths: {} };
}

describe("Swagger document contract", () => {
  it("keeps declared response details and wraps result schemas and examples exactly once", () => {
    const doc = document();
    doc.paths["/items"] = { get: { tags: ["Custom"], summary: "Original", responses: {
      200: {
        description: "Original description", headers: { "X-Count": { schema: { type: "integer" } } },
        content: {
          "application/json": { schema: { type: "array", items: { type: "string" } }, example: ["A"], examples: { sample: { summary: "List", value: ["B"] } } },
          "text/csv": { schema: { type: "string" }, example: "A,B" },
        },
      },
      409: { description: "Specific conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/CustomError" }, example: { custom: true } } } },
    } } };
    prepareSwaggerDocument(doc);
    const response = doc.paths["/items"].get!.responses[200] as ResponseObject;
    expect(response.description).toBe("Original description");
    expect(response.headers).toHaveProperty("X-Count");
    expect(response.content!["text/csv"].example).toBe("A,B");
    const json = response.content!["application/json"];
    expect(json.schema).toMatchObject({ allOf: [{ $ref: "#/components/schemas/HttpSuccessResponse" }, { properties: { result: { type: "array" } } }] });
    expect(json.example).toMatchObject({ success: true, result: ["A"] });
    expect(json.examples!.sample).toMatchObject({ summary: "List", value: { result: ["B"] } });
    expect(doc.paths["/items"].get!.responses[409]).toMatchObject({ description: "Specific conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/CustomError" }, example: { custom: true } } } });
    const before = JSON.stringify(doc);
    prepareSwaggerDocument(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("separates success and error schemas and does not invent every possible status", () => {
    const doc = document();
    doc.paths["/public"] = { get: { responses: { 200: { description: "OK" } } } };
    doc.paths["/private"] = { get: { security: [{ bearer: [] }], responses: { 200: { description: "OK" } } } };
    prepareSwaggerDocument(doc);
    const success = doc.components!.schemas!.HttpSuccessResponse as SchemaObject;
    const error = doc.components!.schemas!.HttpErrorResponse as SchemaObject;
    expect(success.properties!.success).toMatchObject({ enum: [true] });
    expect(success.properties).not.toHaveProperty("errorMetadata");
    expect(error.required).toContain("errorMetadata");
    expect(error.properties!.success).toMatchObject({ enum: [false] });
    expect(error.properties!.result).toMatchObject({ nullable: true, enum: [null] });
    expect(Object.keys(doc.paths["/public"].get!.responses).sort()).toEqual(["200", "500"]);
    expect(Object.keys(doc.paths["/private"].get!.responses).sort()).toEqual(["200", "401", "403", "500"]);
  });

  it("preserves file media and empty response bodies", () => {
    const doc = document();
    doc.paths["/file"] = { get: { responses: { 200: { description: "File", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, 204: { description: "Empty" }, 304: { description: "Unmodified" } } } };
    prepareSwaggerDocument(doc);
    expect(doc.paths["/file"].get!.responses[200]).not.toHaveProperty("content.application/json");
    expect(doc.paths["/file"].get!.responses[204]).not.toHaveProperty("content");
    expect(doc.paths["/file"].get!.responses[304]).not.toHaveProperty("content");
  });

  describe("real Swagger metadata generation without a database", () => {
    let app: INestApplication;
    afterAll(async () => { await app?.close(); });

    it("honours declared groups/security/summaries and leaves the real clinic route public", async () => {
      const module = await Test.createTestingModule({ controllers: [DocumentedController, ClinicController] }).compile();
      app = module.createNestApplication();
      configureApiRouting(app);
      const swaggerEnabled = process.env.SWAGGER_ENABLED;
      process.env.SWAGGER_ENABLED = "true";
      try { setupSwagger(app); }
      finally {
        if (swaggerEnabled === undefined) delete process.env.SWAGGER_ENABLED;
        else process.env.SWAGGER_ENABLED = swaggerEnabled;
      }
      await app.init();
      const doc = prepareSwaggerDocument(SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth(undefined, "bearer").build()));
      const reservations = doc.paths["/api/vetcare/reservations"].get!;
      expect(reservations.tags).toContain("Reservas");
      expect(reservations.security).toEqual([{ bearer: [] }]);
      expect(reservations.summary).toBe("Listar reservas");
      expect(reservations.description).toBe("Apenas reservas visíveis ao utilizador.");
      expect(reservations.responses[409]).toMatchObject({ description: "Conflito de negócio documentado.", content: { "application/json": { schema: { $ref: "#/components/schemas/HttpErrorResponse" } } } });
      expect(doc.paths["/api/vetcare/clinic/hours"].get!.security).toBeUndefined();
      expect(doc.paths["/api/vetcare/clinic/hours"].get!.responses).not.toHaveProperty("401");
      const published = await request(app.getHttpServer()).get("/docs-json").expect(200);
      expect(published.body.paths).toHaveProperty("/api/vetcare/clinic/hours");
      await request(app.getHttpServer()).get("/docs/").expect(200);
      await request(app.getHttpServer()).get("/api/vetcare/docs-json").expect(404);
    });
  });
});
