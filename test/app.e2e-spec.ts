import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { App } from "supertest/types";
import { configureApiRouting } from "../src/api-routing";
import { ClinicController } from "../src/app/reservation/clinic.controller";
import { HttpResponseModule } from "../src/app/core/http-response.module";

/** Public HTTP smoke test; database-dependent domains are isolated in their own suites. */
describe("VetCare public API (e2e)", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [HttpResponseModule],
      controllers: [ClinicController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiRouting(app);
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it("serves public clinic hours under the branded prefix and response contract", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/vetcare/clinic/hours")
      .expect(200);
    expect(response.body).toMatchObject({
      status: 200,
      success: true,
      friendlyMessage: expect.any(String),
      result: { timeZone: "Europe/Lisbon", slotDurationMinutes: 30 },
    });
    expect(response.body.errorMetadata).toBeUndefined();
  });

  it("does not expose resources at the previous prefix", async () => {
    const response = await request(app.getHttpServer()).get("/api/clinic/hours").expect(404);
    expect(response.body).toMatchObject({ status: 404, success: false, result: null, errorMetadata: "NOT_FOUND" });
  });
});
