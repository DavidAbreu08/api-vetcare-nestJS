import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AnimalEntity } from "../../animal/entities/animal.entity";
import { utcDateTimeTransformer } from "../../core/persistence/utc-datetime";
import { UsersEntity } from "../../users/entities/users.entity";
import { AnimalOwnerEndReason } from "../enums/animal-owner-end-reason.enum";

/** Filtered unique index: one active tutorship per (animal, user). */
export const ANIMAL_OWNER_ACTIVE_INDEX = "uq_vc_animal_owners_active";
/** Filtered unique index: at most one active primary tutor per animal. */
export const ANIMAL_OWNER_PRIMARY_INDEX = "uq_vc_animal_owners_primary";

/**
 * Tutorship period of an account over an animal (migration 1795435200000). Rows are immutable periods: an active row
 * (ended_at NULL) is only ever closed (ended_at/ended_by/end_reason), never deleted or rewritten; promoting or demoting
 * a tutor closes the row and opens a new one. vc_animals.owner_id is kept as a synchronized copy of the active primary.
 * ix_vc_animal_owners_user_active also has INCLUDE (is_primary) in SQL (not expressible in TypeORM metadata).
 */
@Entity("vc_animal_owners")
@Index(ANIMAL_OWNER_ACTIVE_INDEX, ["animalId", "userId"], { unique: true, where: "[ended_at] IS NULL" })
@Index(ANIMAL_OWNER_PRIMARY_INDEX, ["animalId"], { unique: true, where: "[ended_at] IS NULL AND [is_primary] = 1" })
@Index("ix_vc_animal_owners_user_active", ["userId", "animalId"], { where: "[ended_at] IS NULL" })
@Index("ix_vc_animal_owners_animal_assigned", ["animalId", "assignedAt"])
@Index("ix_vc_animal_owners_assigned_by", ["assignedBy"])
@Index("ix_vc_animal_owners_ended_by", ["endedBy"])
@Check("ck_vc_animal_owners_dates", "[ended_at] IS NULL OR [ended_at] >= [assigned_at]")
@Check("ck_vc_animal_owners_ended", "[ended_at] IS NOT NULL OR ([ended_by] IS NULL AND [end_reason] IS NULL)")
@Check("ck_vc_animal_owners_end_reason",
  "[end_reason] IS NULL OR [end_reason] COLLATE Latin1_General_100_BIN2 IN (N'TRANSFERRED', N'REMOVED', N'ROLE_CHANGED', N'ACCOUNT_DELETED', N'MIGRATED')")
export class AnimalOwnerEntity {
  @PrimaryGeneratedColumn("uuid") id: string;

  @Column({ name: "animal_id", type: "uniqueidentifier" }) animalId: string;
  @ManyToOne(() => AnimalEntity, { nullable: false })
  @JoinColumn({ name: "animal_id", foreignKeyConstraintName: "fk_vc_animal_owners_animal" }) animal: AnimalEntity;

  @Column({ name: "user_id", type: "uniqueidentifier" }) userId: string;
  @ManyToOne(() => UsersEntity, { nullable: false })
  @JoinColumn({ name: "user_id", foreignKeyConstraintName: "fk_vc_animal_owners_user" }) user: UsersEntity;

  @Column({ name: "is_primary", type: "bit", default: false }) isPrimary: boolean;

  /** UTC instant the period started. */
  @Column({ name: "assigned_at", type: "datetime2", precision: 3, transformer: utcDateTimeTransformer }) assignedAt: Date;
  /** UTC instant the period ended; NULL while active. */
  @Column({ name: "ended_at", type: "datetime2", precision: 3, nullable: true, transformer: utcDateTimeTransformer }) endedAt: Date | null;

  /** vc_users.id of who opened the period; NULL for rows copied by the migration. */
  @Column({ name: "assigned_by", type: "uniqueidentifier", nullable: true }) assignedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "assigned_by", foreignKeyConstraintName: "fk_vc_animal_owners_assigned_by" }) assignedByUser: UsersEntity | null;

  /** vc_users.id of who closed the period. */
  @Column({ name: "ended_by", type: "uniqueidentifier", nullable: true }) endedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "ended_by", foreignKeyConstraintName: "fk_vc_animal_owners_ended_by" }) endedByUser: UsersEntity | null;

  @Column({ name: "end_reason", type: "nvarchar", length: 30, nullable: true }) endReason: AnimalOwnerEndReason | null;

  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
