import { HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { UsersService } from "src/app/users/users.service";
import { compareSync, hashSync } from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { CurrentUser } from "./types/current-user";
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
    if (!userEntity) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const payload = { sub: user.id, email: user.email, name: user.name };

    return {
      token: this.jwtService.sign(payload),
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.userService.findOneOrFail({ email });
    try {
      if (!user) {
        return null;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        return error.message;
      }
      return "An unknown error occurred";
    }

    const isPasswordValid = compareSync(password, user.password);
    if (!isPasswordValid) return null;

    return user;
  }

  async validateJwtUser(id: string) {
    const user = await this.userService.findOneOrFail({ id });
    if (!user) throw new UnauthorizedException("User not Found!");
    const currentUser: CurrentUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user?.phone,
      dateBirth: user?.dateBirth,
      nif: user?.nif,
      role: user.role,
    };
    return currentUser;
  }

  async getEmployees() {
    return await this.userService.findEmployees();
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    const user = await this.userService.findOneOrFail({ id });
    if (!user) {
      throw new UnauthorizedException("User not Found!");
    }

    const isPasswordValid = compareSync(oldPassword, user.password);

    if (!isPasswordValid)
      throw new UnauthorizedException("Old Password is invalid!");

    if (newPassword !== confirmNewPassword)
      throw new UnauthorizedException(
        "New Password and Confirm New Password must be the same!"
      );

    const newHashedPassword = await hashSync(newPassword, 10);
    user.password = newHashedPassword;

    await this.userService.save(user);

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: "Password changed successfully!",
    };
  }

  async forgotPassword(email: string) {
    try {
      const user = await this.userService.findOneOrFail({ email });

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

      return { message: "If this user exists, they will receive an email!" };
    } catch (err) {
      console.error("Error occurred during password reset:", err);
    }

    return {
      message: "If this user exists, they will receive an email!",
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
      throw new UnauthorizedException("Invalid or expired reset token");
    }

    if (resetTokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException("Reset token has expired");
    }

    if (newPassword !== confirmNewPassword) {
      throw new UnauthorizedException(
        "New Password and Confirm New Password must be the same!"
      );
    }
    const user = resetTokenEntity.user;

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    user.password = await hashSync(newPassword, 10);

    await this.userService.save(user);

    await this.resetTokenRepo.delete(resetTokenEntity.resetToken);

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: "Password reset successfully!",
    };
  }
}
