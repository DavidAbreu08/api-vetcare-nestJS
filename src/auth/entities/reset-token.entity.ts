import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UsersEntity } from "../../app/users/entities/users.entity";
import { utcDateTimeTransformer } from "../../app/core/persistence/utc-datetime";

/**
 * Single-use password reset / welcome token. Only the SHA-256 of the token is stored (token_hash); the plain
 * token exists only in the email link. A token is consumed by setting used_at; rows are removed explicitly when
 * the user is soft-deleted (no cascading FK) and by the hourly cleanup (ResetTokenService).
 */
@Entity({ name: "vc_reset_tokens" })
@Index("uq_vc_reset_tokens_token_hash", ["tokenHash"], { unique: true })
@Index("ix_vc_reset_tokens_user_id", ["userId"])
export class ResetTokenEntity {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "pk_vc_reset_tokens" })
  id: string;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  /** SHA-256 (32 bytes) of the token text in utf8. */
  @Column({ name: "token_hash", type: "binary", length: 32 })
  tokenHash: Buffer;

  @Column({ name: "user_id", type: "uniqueidentifier" })
  userId: string;

  @ManyToOne(() => UsersEntity, (user) => user.resetTokens, { nullable: false })
  @JoinColumn({ name: "user_id", foreignKeyConstraintName: "fk_vc_reset_tokens_user" })
  user: UsersEntity;

  /** UTC instant. */
  @Column({ name: "expires_at", type: "datetime2", transformer: utcDateTimeTransformer })
  expiresAt: Date;

  /** UTC instant of consumption or invalidation; null while pending. */
  @Column({ name: "used_at", type: "datetime2", nullable: true, transformer: utcDateTimeTransformer })
  usedAt: Date | null;

  /** UTC instant, written by the application (database default SYSUTCDATETIME()). */
  @Column({ name: "created_at", type: "datetime2", default: () => "SYSUTCDATETIME()", transformer: utcDateTimeTransformer })
  createdAt: Date;
}
