// reset-token.service.ts
import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { ResetTokenEntity } from "../../auth/entities/reset-token.entity";

@Injectable()
export class ResetTokenService {
  constructor(
    @InjectRepository(ResetTokenEntity)
    private readonly resetTokenRepo: Repository<ResetTokenEntity>
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async deleteExpiredTokens() {
    await this.resetTokenRepo
      .createQueryBuilder()
      .delete()
      .from(ResetTokenEntity)
      .where("expires_at < :now", { now: new Date() })
      .execute();

    console.log("Expired reset tokens cleaned up!");
  }
}
