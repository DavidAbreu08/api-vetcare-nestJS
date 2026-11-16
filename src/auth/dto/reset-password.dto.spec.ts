import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ResetPasswordDto } from "./reset-password.dto";

describe("ResetPasswordDto", () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
  const validate = (resetToken: unknown) =>
    pipe.transform({ resetToken, newPassword: "NewSecret#123", confirmNewPassword: "NewSecret#123" }, { type: "body", metatype: ResetPasswordDto });

  it("accepts 64 lowercase hexadecimal characters", async () => {
    await expect(validate("0123456789abcdef".repeat(4))).resolves.toBeInstanceOf(ResetPasswordDto);
  });

  it.each([["short", "ab".repeat(31)], ["long", "ab".repeat(33)], ["uppercase", "AB".repeat(32)], ["non hex", "zz".repeat(32)],
    ["spaces", ` ${"ab".repeat(32)}`], ["number", 12345]])("rejects a %s token with 400", async (_label, token) => {
    await expect(validate(token)).rejects.toBeInstanceOf(BadRequestException);
  });
});
