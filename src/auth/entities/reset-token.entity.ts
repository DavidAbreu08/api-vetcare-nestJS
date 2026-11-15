import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from "typeorm";
import { UsersEntity } from "../../app/users/entities/users.entity";

@Entity({ name: "resetToken" })
export class ResetTokenEntity {
  @PrimaryColumn({ type: "nvarchar", length: 255 })
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
