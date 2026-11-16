import { DataSource, EntityManager, MssqlParameter, Repository } from "typeorm";
import { ResetTokenEntity } from "../entities/reset-token.entity";
import { utcInstantParam, uuidParam } from "src/app/core/persistence/sql-params";

const hashParam = (tokenHash: Buffer) => new MssqlParameter(tokenHash, "varbinary", 32);

/** Token persistence; every method receives only the SHA-256 hash, never the plain token. */
export class ResetTokenEntityRepository extends Repository<ResetTokenEntity> {
  constructor(dataSource: DataSource) {
    super(ResetTokenEntity, dataSource.createEntityManager());
  }

  /** Stores a new pending token inside the caller's transaction. */
  async issue(manager: EntityManager, userId: string, tokenHash: Buffer, expiresAt: Date, now: Date): Promise<void> {
    await manager.insert(ResetTokenEntity, { userId, tokenHash, expiresAt, createdAt: now, usedAt: null });
  }

  /**
   * User of a pending, unexpired token, read without lock hints (the caller locks the account row next and then
   * consumes the token with consume, which re-checks every condition). Null when no row matches.
   */
  async findPendingUserId(manager: EntityManager, tokenHash: Buffer, now: Date): Promise<string | null> {
    const rows: { user_id: string }[] = await manager.query(
      "SELECT [user_id] FROM [dbo].[vc_reset_tokens] WHERE [token_hash] = @0 AND [used_at] IS NULL AND [expires_at] > @1",
      [hashParam(tokenHash), utcInstantParam(now)],
    );
    return rows?.length === 1 ? rows[0].user_id : null;
  }

  /**
   * Atomically marks a pending, unexpired token of the given user as used; false when no row matched (unknown,
   * expired, already used or consumed concurrently), in which case nothing was written.
   */
  async consume(manager: EntityManager, tokenHash: Buffer, userId: string, now: Date): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      "UPDATE [dbo].[vc_reset_tokens] SET [used_at] = @0 OUTPUT inserted.[id] " +
      "WHERE [token_hash] = @1 AND [user_id] = @2 AND [used_at] IS NULL AND [expires_at] > @0",
      [utcInstantParam(now), hashParam(tokenHash), uuidParam(userId)],
    );
    return rows?.length === 1;
  }

  /** Marks every still-pending token of the user as used (other links stop working). */
  async invalidatePending(manager: EntityManager, userId: string, now: Date): Promise<void> {
    await manager.query(
      "UPDATE [dbo].[vc_reset_tokens] SET [used_at] = @0 WHERE [user_id] = @1 AND [used_at] IS NULL",
      [utcInstantParam(now), uuidParam(userId)],
    );
  }

  /** Tokens created for the user after `since` (per-account issuance limit). */
  async countCreatedSince(manager: EntityManager, userId: string, since: Date): Promise<number> {
    const rows: { total: number }[] = await manager.query(
      "SELECT COUNT(*) AS [total] FROM [dbo].[vc_reset_tokens] WHERE [user_id] = @0 AND [created_at] > @1",
      [uuidParam(userId), utcInstantParam(since)],
    );
    return Number(rows?.[0]?.total ?? 0);
  }

  /** Cleanup: expired tokens and tokens used before `usedBefore`. Returns the number of deleted rows. */
  async deleteStale(now: Date, usedBefore: Date): Promise<number> {
    const result = await this.createQueryBuilder()
      .delete()
      .from(ResetTokenEntity)
      .where("[expires_at] < :now OR [used_at] < :usedBefore", { now: utcInstantParam(now), usedBefore: utcInstantParam(usedBefore) })
      .execute();
    return result.affected ?? 0;
  }
}
