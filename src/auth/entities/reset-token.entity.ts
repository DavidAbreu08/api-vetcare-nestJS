import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from "typeorm";
import { UsersEntity } from "../../app/users/entities/users.entity";

@Entity({ name: "vc_reset_tokens" })
export class ResetTokenEntity {
  @Column({ type: "nvarchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryColumn({ name: "reset_token", type: "nvarchar", length: 255 })
  resetToken: string;

  @Index("IDX_RESET_TOKEN", ["resetToken"])
  @ManyToOne(() => UsersEntity, (user) => user.resetTokens, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user: UsersEntity;

  @Column({
    name: "expires_at",
    type: "datetime2",
    nullable: true,
  })
  expiresAt: Date;
}
