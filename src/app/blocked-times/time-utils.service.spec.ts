import { BadRequestException } from "@nestjs/common";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { TimeUtilsService } from "./time-utils.service";
import { TimeUtilsMessages } from "./time-utils.messages";

describe("TimeUtilsService invalid dates", () => {
  it("identifies invalid dates as invalid input with the domain message", () => {
    const service = new TimeUtilsService();
    try {
      service.isWithinBusinessHours("10:00", "11:00", "invalid-date");
      throw new Error("Expected invalid date failure");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errorMetadata: ErrorMetadata.INVALID_VALUE,
        message: TimeUtilsMessages.INVALID_DATE,
      });
    }
  });
});
