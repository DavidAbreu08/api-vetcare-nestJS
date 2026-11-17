import { INestApplication } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import * as jwt from "jsonwebtoken";
import * as request from "supertest";
import { ClinicalVisitController } from "../app/clinical-visits/clinical-visit.controller";
import { ClinicalVisitService } from "../app/clinical-visits/clinical-visit.service";
import { ErrorMetadata } from "../app/core/enums/error-metadata.enum";
import { RolesGuard } from "../app/core/guards/roles/roles.guard";
import { HttpResponseModule } from "../app/core/http-response.module";
import { ClinicController } from "../app/reservation/clinic.controller";
import { SystemSettingsService } from "../app/system-settings/system-settings.service";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { configureApiRouting } from "../api-routing";

describe("HTTP authentication with the global response boundary", () => {
  const secret = "isolated-http-authentication-test-secret";
  const originalSecret = process.env.JWT_SECRET_KEY;
  const visits = { list: jest.fn(), get: jest.fn() };
  const auth = { validateJwtUser: jest.fn() };
  const settings = { resolveRoleIds: jest.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET_KEY = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule, HttpResponseModule],
      controllers: [ClinicalVisitController, ClinicController],
      providers: [
        JwtStrategy,
        RolesGuard,
        { provide: ClinicalVisitService, useValue: visits },
        { provide: AuthService, useValue: auth },
        { provide: SystemSettingsService, useValue: settings },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApiRouting(app);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app?.close();
    if (originalSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = originalSecret;
  });

  async function expectUnauthorized(path: string, authorization?: string) {
    const pending = request(app.getHttpServer()).get(path).timeout({ response: 1500, deadline: 2000 });
    if (authorization !== undefined) pending.set("Authorization", authorization);
    const response = await pending.expect(401);
    expect(response.body).toEqual({
      status: 401,
      friendlyMessage: "Unauthorized",
      success: false,
      result: null,
      errorMetadata: ErrorMetadata.UNAUTHORIZED,
    });
    expect(visits.list).not.toHaveBeenCalled();
    expect(visits.get).not.toHaveBeenCalled();
    expect(auth.validateJwtUser).not.toHaveBeenCalled();
    expect(settings.resolveRoleIds).not.toHaveBeenCalled();
  }

  it("finishes protected clinical visit listing without a token as 401", async () => {
    await expectUnauthorized("/api/vetcare/clinical-visits");
  });

  it("finishes protected clinical visit details without a token as 401", async () => {
    await expectUnauthorized("/api/vetcare/clinical-visits/20000000-0000-4000-8000-000000000001");
  });

  it.each(["Bearer malformed-token", "Bearer", "Basic ignored-value"])("rejects malformed authentication (%s) without database validation", async header => {
    await expectUnauthorized("/api/vetcare/clinical-visits", header);
  });

  it("rejects expired tokens without database validation", async () => {
    const token = jwt.sign({ sub: "test-user", exp: 1 }, secret);
    await expectUnauthorized("/api/vetcare/clinical-visits", `Bearer ${token}`);
  });

  it("rejects tokens with an invalid signature without database validation", async () => {
    const token = jwt.sign({ sub: "test-user" }, "different-test-secret");
    await expectUnauthorized("/api/vetcare/clinical-visits", `Bearer ${token}`);
  });

  it("allows public clinic hours without a token", async () => {
    const response = await request(app.getHttpServer()).get("/api/vetcare/clinic/hours")
      .timeout({ response: 1500, deadline: 2000 }).expect(200);
    expect(response.body).toMatchObject({ status: 200, success: true, result: { start: expect.any(String), end: expect.any(String) } });
    expect(auth.validateJwtUser).not.toHaveBeenCalled();
  });
});
