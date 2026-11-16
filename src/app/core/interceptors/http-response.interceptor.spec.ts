import { ClassSerializerInterceptor, Controller, Get, HttpCode, HttpStatus, INestApplication, StreamableFile } from "@nestjs/common";
import { APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Exclude } from "class-transformer";
import * as request from "supertest";
import { ResponseMessage } from "../decorators/response-message.decorator";
import { HttpResponseInterceptor } from "./http-response.interceptor";

class Account {
  name = "Ana";
  @Exclude()
  password = "never-public";
}

@Controller()
class ResponseController {
  @Get("account")
  @ResponseMessage("Perfil obtido.")
  account() { return new Account(); }

  @Get("list")
  list() { return [{ id: "1" }]; }

  @Get("token")
  @ResponseMessage("Concluído.")
  token() { return { token: "replacement-token" }; }

  @Get("message")
  @ResponseMessage("Eliminado.")
  message() { return null; }

  @Get("business-message")
  businessMessage() { return { message: "Record content", id: "1" }; }

  @Get("empty")
  @HttpCode(HttpStatus.NO_CONTENT)
  empty() { return undefined; }

  @Get("file")
  file() { return new StreamableFile(Buffer.from("file contents")); }
}

describe("HttpResponseInterceptor (HTTP contract)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ResponseController],
      providers: [{ provide: APP_INTERCEPTOR, useClass: HttpResponseInterceptor }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it("wraps serialized entities without revealing excluded fields", async () => {
    const response = await request(app.getHttpServer()).get("/account").expect(200);
    expect(response.body).toEqual({ status: 200, friendlyMessage: "Perfil obtido.", success: true, result: { name: "Ana" } });
  });

  it("preserves lists as the result", async () => {
    const response = await request(app.getHttpServer()).get("/list").expect(200);
    expect(response.body.result).toEqual([{ id: "1" }]);
    expect(response.body.errorMetadata).toBeUndefined();
  });

  it("uses explicit messages and the actual HTTP status without changing operation data", async () => {
    const response = await request(app.getHttpServer()).get("/token").expect(200);
    expect(response.body).toEqual({ status: 200, friendlyMessage: "Concluído.", success: true, result: { token: "replacement-token" } });
  });

  it("supports explicit acknowledgement messages with a null result", async () => {
    const response = await request(app.getHttpServer()).get("/message").expect(200);
    expect(response.body.result).toBeNull();
    expect(response.body.friendlyMessage).toBe("Eliminado.");
  });

  it("keeps business message fields inside ordinary results", async () => {
    const response = await request(app.getHttpServer()).get("/business-message").expect(200);
    expect(response.body.result).toEqual({ message: "Record content", id: "1" });
  });

  it("preserves empty 204 and HEAD responses", async () => {
    const response = await request(app.getHttpServer()).get("/empty").expect(204);
    expect(response.text).toBe("");
    const head = await request(app.getHttpServer()).head("/account").expect(200);
    expect(head.text).toBeUndefined();
  });

  it("passes file responses through unchanged", async () => {
    const response = await request(app.getHttpServer()).get("/file").expect(200);
    expect(response.body.toString()).toBe("file contents");
  });
});
