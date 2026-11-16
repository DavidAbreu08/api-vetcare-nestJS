import { AuthMessages } from "./auth.messages";
import { BadRequestException, HttpStatus, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { UsersService } from "src/app/users/users.service";
import { compare, compareSync, hash } from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { DataSource, EntityManager } from "typeorm";
import { CurrentUser } from "./types/current-user";
import { normalizeEmail } from "src/app/core/catalog";
import { EmailService } from "src/email/email.service";
import { ResetTokenEntityRepository } from "./repository/reset-token.repository";
import { generateResetToken, hashResetToken } from "src/app/core/generated/generate-reset-token";
import { PersistenceService } from "src/app/core/persistence/persistence.service";

/** Per-account issuance limit: at most this many tokens created in RESET_TOKEN_WINDOW_MS. */
export const RESET_TOKENS_PER_WINDOW = 3;
export const RESET_TOKEN_WINDOW_MS = 1000 * 60 * 60;
const BCRYPT_ROUNDS = 10;

/**
 * Lock order: every transaction that writes vc_reset_tokens (forgot, reset, change password, account deletion)
 * locks the vc_users row first and only then reads with locks or writes vc_reset_tokens. With a single order no
 * two of these flows can wait on each other in a cycle (deadlock).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly resetTokenRepo: ResetTokenEntityRepository,
    private readonly dataSource: DataSource,
    private readonly persistence: PersistenceService,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  async login(user: UsersEntity) {
    const userEntity = await this.userService.findOneOrFail({
      email: user.email,
    });
    if (!userEntity || !userEntity.isActive) {
      throw new UnauthorizedException(AuthMessages.INVALID_CREDENTIALS);
    }
    return {
      token: this.signAccessToken(user),
    };
  }

  /**
   * Session JWT shared by login and change-password (same payload; expiry from JwtModule signOptions, counted
   * from iat). With minIssuedAt the iat is never earlier than that instant's second, so a token issued right after a
   * password change passes isIssuedAfterPasswordChange (iat >= floor(password_changed_at / 1000)) even within the
   * same second or if the clock steps back; jsonwebtoken keeps an explicit iat and computes exp from it.
   */
  private signAccessToken(user: Pick<UsersEntity, "id" | "email" | "name">, minIssuedAt?: Date): string {
    const payload: { sub: string; email: string; name: string; iat?: number } = { sub: user.id, email: user.email, name: user.name };
    if (minIssuedAt) payload.iat = Math.max(Math.floor(Date.now() / 1000), Math.floor(minIssuedAt.getTime() / 1000));
    return this.jwtService.sign(payload);
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

  /**
   * Loads active roles (via vc_user_roles) and the employee profile on every authenticated request.
   * issuedAt (JWT iat, seconds) must not precede the account's last password change.
   */
  async validateJwtUser(id: string, issuedAt?: number): Promise<CurrentUser> {
    const currentUser = await this.userService.loadActor(id, issuedAt);
    if (!currentUser) throw new UnauthorizedException(AuthMessages.USER_NOT_FOUND_AUTHENTICATION);
    return currentUser;
  }

  /** Account without password, active roles and employee profile (with job titles) or null. */
  async getProfile(user: CurrentUser) {
    return this.userService.getAccountProfile(user.id);
  }

  /**
   * Changes the password, records password_changed_at (JWTs issued in earlier seconds stop working) and
   * invalidates pending reset/welcome tokens, all in one transaction. After the commit a new session JWT (same
   * format as login) is returned, since the token used for this request is no longer accepted. If signing fails
   * the password is already changed, so the response stays 202 without a token (the client must log in again).
   */
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

    const isPasswordValid = await compare(oldPassword, user.passwordHash);

    if (!isPasswordValid)
      throw new UnauthorizedException(AuthMessages.INVALID_OLD_PASSWORD);

    if (newPassword !== confirmNewPassword)
      throw new UnauthorizedException(
        AuthMessages.PASSWORD_CONFIRMATION_MISMATCH
      );

    const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();
    await this.transaction(async manager => {
      // The UPDATE of vc_users takes the account row lock before vc_reset_tokens is touched (users -> tokens).
      if (!(await this.userService.setPasswordHash(manager, user.id, passwordHash, now))) {
        throw new UnauthorizedException(AuthMessages.USER_NOT_FOUND_AUTHENTICATION);
      }
      await this.resetTokenRepo.invalidatePending(manager, user.id, now);
    });

    const response: { statusCode: HttpStatus; message: string; token?: string } = {
      statusCode: HttpStatus.ACCEPTED,
      message: AuthMessages.PASSWORD_CHANGED,
    };
    try {
      // now is stored exactly (datetime2(7), millisecond Date), so iat >= its second is accepted by loadActor.
      return { ...response, token: this.signAccessToken(user, now) };
    } catch {
      this.logger.error(AuthMessages.SESSION_TOKEN_AFTER_PASSWORD_CHANGE_FAILED);
      return response;
    }
  }

  /**
   * Always answers PASSWORD_RESET_REQUESTED immediately: the whole issuance (account lookup, limit, invalidation,
   * insert and email) runs in the background, so unknown, inactive or deleted accounts, the per-account limit and
   * database or SMTP failures are indistinguishable, also in response time.
   */
  async forgotPassword(email: string) {
    void this.issuePasswordResetInBackground(email);
    return { message: AuthMessages.PASSWORD_RESET_REQUESTED };
  }

  /** Never rejects (no unhandled rejection); failures are logged as a constant, never the address or the token. */
  protected issuePasswordResetInBackground(email: string): Promise<void> {
    return this.issuePasswordReset(email).catch(() => this.logger.error(AuthMessages.PASSWORD_RESET_FAILED));
  }

  private async issuePasswordReset(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    if (typeof normalized !== "string" || !normalized) return;
    const user = await this.userService.findForAuthentication({ email: normalized });
    if (!user || !user.isActive) return;

    const now = new Date();
    const token = await this.transaction(async manager => {
      // Lock order users -> tokens; the account lock also serializes concurrent requests for the per-account limit.
      if (!(await this.userService.lockForUpdate(manager, user.id))) return null;
      const since = new Date(now.getTime() - RESET_TOKEN_WINDOW_MS);
      if (await this.resetTokenRepo.countCreatedSince(manager, user.id, since) >= RESET_TOKENS_PER_WINDOW) return null;
      // Earlier links stop working; rows are kept (used_at) so created_at still counts toward the limit.
      await this.resetTokenRepo.invalidatePending(manager, user.id, now);
      const generated = generateResetToken(now);
      await this.resetTokenRepo.issue(manager, user.id, generated.tokenHash, generated.expiresAt, now);
      return generated.token;
    });
    if (!token) return;

    await this.emailService.sendResetPasswordEmail(user.email, token)
      .catch(() => this.logger.error(AuthMessages.RESET_EMAIL_FAILED));
  }

  /**
   * Consumes the token and sets the new password atomically. Unknown, expired and used tokens, and accounts
   * that are inactive or deleted, all fail with the same message and leave the database unchanged.
   */
  async resetPassword(
    resetToken: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException(AuthMessages.PASSWORD_CONFIRMATION_MISMATCH);
    }
    const tokenHash = hashResetToken(resetToken);
    const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    await this.transaction(async manager => {
      // Users-first like every other flow: the user id is read from the token without locks, the account row is
      // locked, and only then is the token consumed (re-checking user, pending and expiry atomically).
      const userId = await this.resetTokenRepo.findPendingUserId(manager, tokenHash, now);
      if (!userId) throw new BadRequestException(AuthMessages.INVALID_RESET_TOKEN);
      await this.userService.lockForUpdate(manager, userId);
      if (!(await this.resetTokenRepo.consume(manager, tokenHash, userId, now))) {
        throw new BadRequestException(AuthMessages.INVALID_RESET_TOKEN);
      }
      if (!(await this.userService.setPasswordHash(manager, userId, passwordHash, now))) {
        throw new BadRequestException(AuthMessages.INVALID_RESET_TOKEN);
      }
      await this.resetTokenRepo.invalidatePending(manager, userId, now);
    });

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: AuthMessages.PASSWORD_RESET,
    };
  }
}
