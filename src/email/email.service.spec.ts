import { HttpException, Logger } from "@nestjs/common";
import { ErrorMetadata } from "../app/core/enums/error-metadata.enum";
import { EmailService } from "./email.service";

describe("EmailService error translation", () => {
  beforeEach(() => jest.spyOn(Logger.prototype, "error").mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["reservation created", (service: EmailService) => service.sendReservationCreatedEmail("client@example.test", "Client", "2026-11-16", "10:00", "11:00")],
    ["reservation confirmed", (service: EmailService) => service.sendReservationConfirmedEmail("client@example.test", "Client", "2026-11-16", "10:00", "11:00")],
    ["password reset", (service: EmailService) => service.sendResetPasswordEmail("client@example.test", "token")],
    ["employee welcome", (service: EmailService) => service.sendEmployeeWelcomeEmail("client@example.test", "token")],
    ["client welcome", (service: EmailService) => service.sendClientWelcomeEmail("client@example.test", "token")],
    ["reservation rescheduled", (service: EmailService) => service.sendReservationRescheduledEmail("client@example.test", "Client", "2026-11-16", "10:00", "11:00", "2026-11-17", "11:00", "12:00")],
    ["reservation cancelled", (service: EmailService) => service.sendReservationCancelledEmail("client@example.test", "Client", "2026-11-16")],
  ])("preserves the SMTP cause and translates %s failures into service unavailability", async (_label, send) => {
    const service = new EmailService();
    const cause = new Error("private SMTP detail");
    const transporter = (service as unknown as { transporter: { sendMail: (...args: unknown[]) => Promise<unknown> } }).transporter;
    jest.spyOn(transporter, "sendMail").mockRejectedValue(cause);

    try {
      await send(service);
      throw new Error("Expected email failure");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      const failure = error as HttpException;
      expect(failure.getStatus()).toBe(503);
      expect(failure.getResponse()).toMatchObject({ errorMetadata: ErrorMetadata.SERVICE_UNAVAILABLE });
      expect(failure.cause).toBe(cause);
      expect(JSON.stringify(failure.getResponse())).not.toContain("private SMTP detail");
    }
  });
});
