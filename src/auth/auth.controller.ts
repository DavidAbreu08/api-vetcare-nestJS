import {
  Body,
  Controller,
  Get,
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

/** Per-IP limits of the public password recovery routes (the guard is applied only to these routes). */
export const PASSWORD_RECOVERY_THROTTLE_TTL_MS = 15 * 60 * 1000;
export const FORGOT_PASSWORD_LIMIT = 5;
export const RESET_PASSWORD_LIMIT = 10;

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard("local"))
  @Post("login")
  async login(@Req() req: any) {
    return await this.authService.login(req.user);
  }

  /** Any authenticated account: profile, roles [{id, code, name}] and employee (or null). */
  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  async getProfile(@Req() req: any) {
    return await this.authService.getProfile(req.user);
  }

  @UseGuards(AuthGuard("jwt"))
  @Post("change-password")
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
  async forgotPassword(@Body() forgotPassword: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPassword.email);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: RESET_PASSWORD_LIMIT, ttl: PASSWORD_RECOVERY_THROTTLE_TTL_MS } })
  @Put("reset-password")
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.resetToken,
      resetPasswordDto.newPassword,
      resetPasswordDto.confirmNewPassword
    );
  }
}
