import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ResetTokenEntityRepository } from "./repository/reset-token.repository";

/** Used tokens are kept this long after use (audit window; also covers the per-account issuance limit). */
export const USED_RESET_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;

export const ResetTokenMessages = { STALE_TOKENS_DELETED: "Stale reset tokens cleaned up", CLEANUP_FAILED: "Reset token cleanup failed" } as const;

/** Hourly cleanup of expired tokens and of tokens used more than 24 hours ago. */
@Injectable()
export class ResetTokenService {
  private readonly logger = new Logger(ResetTokenService.name);

  constructor(private readonly resetTokenRepo: ResetTokenEntityRepository) {}

  @Cron(CronExpression.EVERY_HOUR)
  async deleteStaleTokens(): Promise<void> {
    const now = new Date();
    try {
      const deleted = await this.resetTokenRepo.deleteStale(now, new Date(now.getTime() - USED_RESET_TOKEN_RETENTION_MS));
      this.logger.log(`${ResetTokenMessages.STALE_TOKENS_DELETED}: ${deleted}`);
    } catch {
      this.logger.error(ResetTokenMessages.CLEANUP_FAILED);
    }
  }
}
