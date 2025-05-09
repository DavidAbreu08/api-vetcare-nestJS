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
import { AuthService } from "./auth.service";
import { Roles } from "src/app/core/decorators/roles.decorator";
import { Role } from "src/app/core/enums/role.enum";
import { RolesGuard } from "src/app/core/guards/roles/roles.guard";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard("local"))
  @Post("login")
  async login(@Req() req: any) {
    return await this.authService.login(req.user);
  }

  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  async getProfile(@Req() req: any) {
    return await req.user;
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(Role.ADMIN)
  @Get("employees")
  async getEmployees() {
    return await this.authService.getEmployees();
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

  @Post("forgot-password")
  async forgotPassword(@Body() forgotPassword: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPassword.email);
  }

  @Put("reset-password")
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.resetToken,
      resetPasswordDto.newPassword,
      resetPasswordDto.confirmNewPassword
    );
  }
}
