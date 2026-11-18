import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ErrorMetadata } from "../enums/error-metadata.enum";
import { applicationError } from "./application-error";

describe("applicationError compatibility", () => {
  it("preserves internal conflict context without letting it override the selected category or message", () => {
    const error = applicationError(ErrorMetadata.IN_USE, "Account is in use", undefined, {
      code: "PRIMARY_TUTOR_OF_ANIMALS", animalIds: ["animal"],
      message: "untrusted message", errorMetadata: ErrorMetadata.NOT_FOUND,
    });
    expect(error.getResponse()).toEqual({
      code: "PRIMARY_TUTOR_OF_ANIMALS", animalIds: ["animal"], statusCode: 409,
      message: "Account is in use", errorMetadata: ErrorMetadata.IN_USE,
    });
  });
  it.each([
    [ErrorMetadata.NOT_FOUND, NotFoundException, 404],
    [ErrorMetadata.INVALID_VALUE, BadRequestException, 400],
    [ErrorMetadata.ALREADY_EXISTS, ConflictException, 409],
    [ErrorMetadata.IN_USE, ConflictException, 409],
  ] as const)("preserves Nest classification for %s while carrying global metadata", (metadata, exceptionClass, status) => {
    const cause = new Error("internal cause");
    const error = applicationError(metadata, "Domain-specific message", cause);
    expect(error).toBeInstanceOf(exceptionClass);
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toEqual({ message: "Domain-specific message", errorMetadata: metadata });
    expect(error.cause).toBe(cause);
  });
});
