import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiUnauthorizedResponse, ApiTooManyRequestsResponse, ApiBadRequestResponse, ApiResponse } from "@nestjs/swagger";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ResponseMessage } from "src/app/core/decorators/response-message.decorator";
import { AuthMessages } from "./auth.messages";

/** Per-IP limits of the public password recovery routes (the guard is applied only to these routes). */
export const PASSWORD_RECOVERY_THROTTLE_TTL_MS = 15 * 60 * 1000;
export const FORGOT_PASSWORD_LIMIT = 5;
export const RESET_PASSWORD_LIMIT = 10;

@Controller("auth")
@ApiTags("Authentication")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard("local"))
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in" })
  @ApiResponse({ status: HttpStatus.OK, description: "Signed in successfully.", schema: { type: "object", required: ["token"], properties: { token: { type: "string", description: "JWT access token." } } } })
  @ApiBody({
    required: true,
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", format: "password", writeOnly: true },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Invalid credentials." })
  async login(@Req() req: any) {
    return await this.authService.login(req.user);
  }

  /** Any authenticated account: profile, roles [{id, code, name}] and employee (or null). */
  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  @ApiOperation({ summary: "Get the authenticated profile" })
  @ApiBearerAuth("bearer")
  async getProfile(@Req() req: any) {
    return await this.authService.getProfile(req.user);
  }

  @UseGuards(AuthGuard("jwt"))
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, description: "Password changed; the result may include a new session token." })
  @ApiOperation({ summary: "Change password" })
  @ApiBearerAuth("bearer")
  @ResponseMessage(AuthMessages.PASSWORD_CHANGED)
  @ApiBadRequestResponse({ description: "Invalid input or password confirmation mismatch." })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req
  ) {
    return await this.authService.changePassword(
      req.user.id,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
      changePasswordDto.confirmNewPassword
    );
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: FORGOT_PASSWORD_LIMIT, ttl: PASSWORD_RECOVERY_THROTTLE_TTL_MS } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: "Request accepted; password recovery is processed in the background." })
  @ApiOperation({ summary: "Request password recovery", description: "Public operation with per-IP rate limiting. The generic response does not reveal whether the account exists; email delivery is asynchronous." })
  @ResponseMessage(AuthMessages.PASSWORD_RESET_REQUESTED)
  @ApiBadRequestResponse({ description: "A valid email is required." })
  @ApiTooManyRequestsResponse({ description: "Per-IP password recovery request limit exceeded." })
  async forgotPassword(@Body() forgotPassword: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPassword.email);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: RESET_PASSWORD_LIMIT, ttl: PASSWORD_RECOVERY_THROTTLE_TTL_MS } })
  @Put("reset-password")
  @ApiResponse({ status: HttpStatus.OK, description: "Password reset successfully." })
  @ApiOperation({ summary: "Reset password", description: "Public operation with per-IP rate limiting. Requires a valid recovery token and matching new password confirmation." })
  @ResponseMessage(AuthMessages.PASSWORD_RESET)
  @ApiBadRequestResponse({ description: "Invalid or expired token, or invalid recovery input." })
  @ApiTooManyRequestsResponse({ description: "Per-IP password recovery attempt limit exceeded." })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.resetToken,
      resetPasswordDto.newPassword,
      resetPasswordDto.confirmNewPassword
    );
  }
}
