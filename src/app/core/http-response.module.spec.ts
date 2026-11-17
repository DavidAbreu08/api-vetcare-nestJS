import { Body, ClassSerializerInterceptor, Controller, Get, HttpException, INestApplication, Injectable, Logger, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { IsString } from "class-validator";
import * as request from "supertest";
import { QueryFailedError } from "typeorm";
import { ErrorMetadata } from "./enums/error-metadata.enum";
import { ApplicationException } from "./exceptions/application.exception";
import { HttpResponseModule } from "./http-response.module";

class Input { @IsString() name: string; }
@Injectable()
class DenyGuard { canActivate() { return false; } }

@Controller()
class ContractController {
  @Post("validate") validate(@Body() input: Input) { return input; }
  @Get("missing") missing() { throw new ApplicationException(ErrorMetadata.NOT_FOUND, "Measurement not found."); }
  @Get("guard") @UseGuards(DenyGuard) guarded() { return "unreachable"; }
  @Get("limited") limited() { throw new HttpException("Too many requests", 429); }
  @Get("database") database() {
    throw new QueryFailedError("secret SQL", ["secret parameter"], Object.assign(new Error("duplicate"), { number: 2627 }));
  }
  @Get("unexpected") unexpected() { throw new Error("private server detail"); }
}

describe("Global HTTP response module", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [HttpResponseModule], controllers: [ContractController], providers: [DenyGuard] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("formats success and validation through the same global module", async () => {
    const success = await request(app.getHttpServer()).post("/validate").send({ name: "Ana" }).expect(201);
    expect(success.body).toMatchObject({ status: 201, success: true, result: { name: "Ana" } });
    const failure = await request(app.getHttpServer()).post("/validate").send({ name: 1, unexpected: true }).expect(400);
    expect(failure.body).toMatchObject({ status: 400, success: false, result: null, errorMetadata: ErrorMetadata.VALIDATION_ERROR });
    expect(failure.body.friendlyMessage).toContain("name must be a string");
    expect(failure.body.friendlyMessage).toContain("property unexpected should not exist");
  });

  it.each([
    ["/missing", 404, ErrorMetadata.NOT_FOUND],
    ["/guard", 403, ErrorMetadata.FORBIDDEN],
    ["/limited", 429, ErrorMetadata.TOO_MANY_REQUESTS],
    ["/database", 409, ErrorMetadata.ALREADY_EXISTS],
    ["/does-not-exist", 404, ErrorMetadata.NOT_FOUND],
  ])("formats %s without controller catch blocks", async (path, status, metadata) => {
    const response = await request(app.getHttpServer()).get(path as string).expect(status as number);
    expect(response.body).toEqual({ status, success: false, result: null, errorMetadata: metadata, friendlyMessage: expect.any(String) });
  });

  it("hides unexpected internals", async () => {
    const log = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    try {
      const response = await request(app.getHttpServer()).get("/unexpected").expect(500);
      expect(response.body.errorMetadata).toBe(ErrorMetadata.INTERNAL_ERROR);
      expect(response.body.friendlyMessage).toBe("An internal error occurred. Please try again later.");
      expect(JSON.stringify(response.body)).not.toContain("private server detail");
    } finally { log.mockRestore(); }
  });
});
