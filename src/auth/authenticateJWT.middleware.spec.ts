import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AuthenticateJWT } from "./authenticateJWT.middleware";

jest.mock("./jwt-secret", () => ({ jwtSecret: () => "test-secret" }));
jest.mock("jsonwebtoken", () => ({ verify: jest.fn() }));

describe("AuthenticateJWT middleware error propagation", () => {
  const jwt = jest.requireMock("jsonwebtoken");
  const middleware = new AuthenticateJWT();
  const response = {} as any;

  beforeEach(() => jest.resetAllMocks());

  it("throws missing-token errors for the global exception filter", () => {
    const next = jest.fn();
    expect(() => middleware.use({ header: () => undefined } as any, response, next)).toThrow(UnauthorizedException);
    expect(() => middleware.use({ header: () => undefined } as any, response, next)).toThrow("Access denied");
    expect(next).not.toHaveBeenCalled();
  });

  it("preserves the existing forbidden status for invalid tokens", () => {
    jwt.verify.mockImplementation(() => { throw new Error("invalid signature"); });
    const next = jest.fn();
    expect(() => middleware.use({ header: () => "Bearer invalid" } as any, response, next)).toThrow(ForbiddenException);
    expect(() => middleware.use({ header: () => "Bearer invalid" } as any, response, next)).toThrow("Invalid token");
    expect(next).not.toHaveBeenCalled();
  });

  it("does not reclassify downstream errors as token failures", () => {
    const user = { sub: "user" };
    jwt.verify.mockReturnValue(user);
    const request = { header: () => "Bearer valid" } as any;
    const failure = new Error("downstream failure");
    const next = jest.fn(() => { throw failure; });
    expect(() => middleware.use(request, response, next)).toThrow(failure);
    expect(request.user).toBe(user);
  });
});
