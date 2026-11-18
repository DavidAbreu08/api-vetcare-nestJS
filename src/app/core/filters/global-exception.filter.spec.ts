import { ArgumentsHost, BadRequestException, ForbiddenException, HttpException, HttpStatus, InternalServerErrorException, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { QueryFailedError } from "typeorm";
import { ErrorMetadata } from "../enums/error-metadata.enum";
import { ApplicationException } from "../exceptions/application.exception";
import { applicationError } from "../exceptions/application-error";
import { PersistenceService } from "../persistence/persistence.service";
import { GlobalExceptionFilter } from "./global-exception.filter";

describe("GlobalExceptionFilter", () => {
  const rawResponse = {};
  let reply: jest.Mock;
  let headersSent: jest.Mock;
  let filter: GlobalExceptionFilter;
  let log: jest.SpyInstance;
  const host = { switchToHttp: () => ({ getResponse: () => rawResponse }) } as ArgumentsHost;

  beforeEach(() => {
    reply = jest.fn();
    headersSent = jest.fn().mockReturnValue(false);
    filter = new GlobalExceptionFilter(new PersistenceService(), {
      httpAdapter: { reply, isHeadersSent: headersSent },
    } as unknown as HttpAdapterHost);
    log = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it("preserves a domain message and emits only the agreed response fields", () => {
    filter.catch(new ApplicationException(ErrorMetadata.NOT_FOUND, "Measurement not found."), host);
    expect(reply).toHaveBeenCalledWith(rawResponse, {
      status: 404, friendlyMessage: "Measurement not found.", success: false,
      result: null, errorMetadata: ErrorMetadata.NOT_FOUND,
    }, 404);
  });

  it("joins DTO validation messages without losing them", () => {
    filter.catch(new BadRequestException(["value must be a number", "typeId must be a UUID"]), host);
    expect(reply.mock.calls[0][1]).toMatchObject({
      status: 400, errorMetadata: ErrorMetadata.VALIDATION_ERROR,
      friendlyMessage: "value must be a number; typeId must be a UUID",
    });
  });

  it.each([
    [new UnauthorizedException("Invalid session."), 401, ErrorMetadata.UNAUTHORIZED],
    [new ForbiddenException("Access denied."), 403, ErrorMetadata.FORBIDDEN],
    [new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS), 429, ErrorMetadata.TOO_MANY_REQUESTS],
    [new ServiceUnavailableException("private infrastructure detail"), 503, ErrorMetadata.SERVICE_UNAVAILABLE],
  ])("preserves HTTP status for guards, rate limits and infrastructure", (error, status, metadata) => {
    filter.catch(error, host);
    expect(reply.mock.calls[0][1]).toMatchObject({ status, errorMetadata: metadata });
    expect(reply.mock.calls[0][2]).toBe(status);
  });

  it("translates SQL failures outside execute and excludes driver data", () => {
    filter.catch(new QueryFailedError("INSERT secret", ["password"], Object.assign(new Error("private driver detail"), { number: 2627 })), host);
    expect(reply.mock.calls[0][1]).toMatchObject({ status: 409, errorMetadata: ErrorMetadata.ALREADY_EXISTS });
    expect(JSON.stringify(reply.mock.calls)).not.toMatch(/secret|password|private driver/);
  });

  it.each([new Error("password=secret"), new InternalServerErrorException("password=secret")])("hides unexpected failure messages and logs no sensitive message", error => {
    filter.catch(error, host);
    expect(reply.mock.calls[0][1]).toMatchObject({ status: 500, errorMetadata: ErrorMetadata.INTERNAL_ERROR });
    expect(JSON.stringify(reply.mock.calls)).not.toContain("secret");
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("allows explicitly public application messages for 5xx failures", () => {
    filter.catch(new ApplicationException(ErrorMetadata.SERVICE_UNAVAILABLE, "Service temporarily unavailable."), host);
    expect(reply.mock.calls[0][1].friendlyMessage).toBe("Service temporarily unavailable.");
  });

  it("preserves explicitly public domain factory messages for 5xx failures", () => {
    filter.catch(applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, "Email temporarily unavailable.", new Error("private SMTP detail")), host);
    expect(reply.mock.calls[0][1]).toMatchObject({ status: 503, errorMetadata: ErrorMetadata.SERVICE_UNAVAILABLE, friendlyMessage: "Email temporarily unavailable." });
    expect(JSON.stringify(reply.mock.calls)).not.toContain("private SMTP detail");
  });

  it("drops legacy rich domain payloads instead of leaking them into the envelope", () => {
    filter.catch(new HttpException({ message: "Conflict", code: "OLD_CODE", internal: "private" }, 409), host);
    expect(reply.mock.calls[0][1]).toEqual({
      status: 409, friendlyMessage: "Conflict", success: false, result: null, errorMetadata: ErrorMetadata.CONFLICT,
    });
  });

  it("does not send a second response after headers were sent", () => {
    headersSent.mockReturnValue(true);
    filter.catch(new BadRequestException(), host);
    expect(reply).not.toHaveBeenCalled();
  });
});
