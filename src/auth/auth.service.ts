import { AuthMessages } from "./auth.messages";
import { HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { UsersService } from "src/app/users/users.service";
import { compareSync, hashSync } from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { CurrentUser } from "./types/current-user";
import { normalizeEmail } from "src/app/core/catalog";
import { EmailService } from "src/email/email.service";
import { ResetTokenEntityRepository } from "./repository/reset-token.repository";
import { generateResetToken } from "src/app/core/generated/generate-reset-token";

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly resetTokenRepo: ResetTokenEntityRepository
  ) {}

  async login(user: UsersEntity) {
    const userEntity = await this.userService.findOneOrFail({
      email: user.email,
    });
    if (!userEntity || !userEntity.isActive) {
      throw new UnauthorizedException(AuthMessages.INVALID_CREDENTIALS);
    }
    const payload = { sub: user.id, email: user.email, name: user.name };

    return {
      token: this.jwtService.sign(payload),
    };
  }

  async validateUser(email: string, password: string) {
    const normalized = normalizeEmail(email);
    if (typeof normalized !== "string" || !normalized || typeof password !== "string") return null;
    const user = await this.userService.findForAuthentication({ email: normalized });
    if (!user || !user.isActive) return null;

    const isPasswordValid = compareSync(password, user.passwordHash);
    if (!isPasswordValid) return null;

    return user;
  }

  /** Loads active roles (via vc_user_roles) and the employee profile on every authenticated request. */
  async validateJwtUser(id: string): Promise<CurrentUser> {
    const currentUser = await this.userService.loadActor(id);
    if (!currentUser) throw new UnauthorizedException(AuthMessages.USER_NOT_FOUND_AUTHENTICATION);
    return currentUser;
  }

  /** Account without password, active roles and employee profile (with job titles) or null. */
  async getProfile(user: CurrentUser) {
    return this.userService.getAccountProfile(user.id);
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    const user = await this.userService.findForAuthentication({ id });
    if (!user) {
      throw new UnauthorizedException(AuthMessages.USER_NOT_FOUND_AUTHENTICATION);
    }

    const isPasswordValid = compareSync(oldPassword, user.passwordHash);

    if (!isPasswordValid)
      throw new UnauthorizedException(AuthMessages.INVALID_OLD_PASSWORD);

    if (newPassword !== confirmNewPassword)
      throw new UnauthorizedException(
        AuthMessages.PASSWORD_CONFIRMATION_MISMATCH
      );

    await this.userService.updatePasswordHash(user.id, hashSync(newPassword, 10));

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: AuthMessages.PASSWORD_CHANGED,
    };
  }

  async forgotPassword(email: string) {
    try {
      const user = await this.userService.findOneOrFail({ email: normalizeEmail(email) as string });

      // Delete any existing reset tokens for the user
      await this.resetTokenRepo.delete({ user: { id: user.id } });

      // Generate the reset token and expiration date
      const { token, expiresAt } = generateResetToken();

      // Save the token in the database
      const resetToken = this.resetTokenRepo.create({
        resetToken: token,
        user: user,
        expiresAt,
      });
      await this.resetTokenRepo.save(resetToken);

      // Send the email
      await this.emailService.sendResetPasswordEmail(user.email, token);

      return { message: AuthMessages.PASSWORD_RESET_REQUESTED };
    } catch {
      console.error(AuthMessages.PASSWORD_RESET_FAILED);
    }

    return {
      message: AuthMessages.PASSWORD_RESET_REQUESTED,
    };
  }

  async resetPassword(
    resetToken: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    const resetTokenEntity = await this.resetTokenRepo.findOne({
      where: { resetToken },
      relations: ["user"],
    });
    if (!resetTokenEntity) {
      throw new UnauthorizedException(AuthMessages.INVALID_RESET_TOKEN);
    }

    if (resetTokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException(AuthMessages.EXPIRED_RESET_TOKEN);
    }

    if (newPassword !== confirmNewPassword) {
      throw new UnauthorizedException(
        AuthMessages.PASSWORD_CONFIRMATION_MISMATCH
      );
    }
    const user = resetTokenEntity.user;

    if (!user) {
      throw new UnauthorizedException(AuthMessages.USER_NOT_FOUND);
    }

    await this.userService.updatePasswordHash(user.id, hashSync(newPassword, 10));

    await this.resetTokenRepo.delete(resetTokenEntity.resetToken);

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: AuthMessages.PASSWORD_RESET,
    };
  }
}
