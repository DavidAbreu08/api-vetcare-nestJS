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
@ApiTags("Autenticação")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard("local"))
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Iniciar sessão" })
  @ApiResponse({ status: HttpStatus.OK, description: "Sessão iniciada.", schema: { type: "object", required: ["token"], properties: { token: { type: "string", description: "Token JWT de acesso." } } } })
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
  @ApiUnauthorizedResponse({ description: "Credenciais inválidas." })
  async login(@Req() req: any) {
    return await this.authService.login(req.user);
  }

  /** Any authenticated account: profile, roles [{id, code, name}] and employee (or null). */
  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  @ApiOperation({ summary: "Consultar o perfil autenticado" })
  @ApiBearerAuth("bearer")
  async getProfile(@Req() req: any) {
    return await this.authService.getProfile(req.user);
  }

  @UseGuards(AuthGuard("jwt"))
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, description: "Palavra-passe alterada; pode incluir um novo token de sessão." })
  @ApiOperation({ summary: "Alterar a palavra-passe" })
  @ApiBearerAuth("bearer")
  @ResponseMessage(AuthMessages.PASSWORD_CHANGED)
  @ApiBadRequestResponse({ description: "Dados inválidos ou confirmação da palavra-passe diferente." })
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
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: "Pedido aceite; a recuperação é processada em segundo plano." })
  @ApiOperation({ summary: "Pedir recuperação da palavra-passe", description: "Operação pública com limite por IP. A resposta é genérica para não revelar se a conta existe; o envio de email é assíncrono." })
  @ResponseMessage(AuthMessages.PASSWORD_RESET_REQUESTED)
  @ApiBadRequestResponse({ description: "Email obrigatório e válido." })
  @ApiTooManyRequestsResponse({ description: "Limite de pedidos de recuperação por IP excedido." })
  async forgotPassword(@Body() forgotPassword: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPassword.email);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: RESET_PASSWORD_LIMIT, ttl: PASSWORD_RECOVERY_THROTTLE_TTL_MS } })
  @Put("reset-password")
  @ApiResponse({ status: HttpStatus.OK, description: "Palavra-passe reposta." })
  @ApiOperation({ summary: "Repor a palavra-passe", description: "Operação pública com limite por IP. Exige um token de recuperação válido e a confirmação da nova palavra-passe." })
  @ResponseMessage(AuthMessages.PASSWORD_RESET)
  @ApiBadRequestResponse({ description: "Token inválido, expirado ou dados de recuperação inválidos." })
  @ApiTooManyRequestsResponse({ description: "Limite de tentativas de recuperação por IP excedido." })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.resetToken,
      resetPasswordDto.newPassword,
      resetPasswordDto.confirmNewPassword
    );
  }
}
