import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { utcDateTimeTransformer } from "../../core/persistence/utc-datetime";
import { EmployeeEntity } from "../../employees/entities/employee.entity";
import { UsersEntity } from "../../users/entities/users.entity";

/**
 * Blocked time (migration 1795694400000): a UTC interval [startAt, endAt) that may span several days. employeeId NULL =
 * clinic-wide closure; otherwise the unavailability of one employee profile. Blocks may overlap each other.
 * The legacy single-day columns (date, time_start, time_end, start, end) still exist in SQL as NULL-able deprecated
 * columns; they are deliberately not mapped, so they are never written or read.
 */
@Entity("vc_blocked_times")
@Index("ix_vc_blocked_times_start_end", ["startAt", "endAt"])
@Index("ix_vc_blocked_times_employee_start", ["employeeId", "startAt"])
export class BlockedTimeEntity {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "PK_blocked_times" }) id: string;

  /** vc_employees.id; NULL = the whole clinic is closed. */
  @Column({ name: "employee_id", type: "uniqueidentifier", nullable: true }) employeeId: string | null;
  @ManyToOne(() => EmployeeEntity, { nullable: true })
  @JoinColumn({ name: "employee_id", foreignKeyConstraintName: "fk_vc_blocked_times_employee" }) employee: EmployeeEntity | null;

  /** UTC instant. */
  @Column({ name: "start_at", type: "datetime2", precision: 3, transformer: utcDateTimeTransformer }) startAt: Date;
  /** UTC instant, after startAt (ck_vc_blocked_times_interval). */
  @Column({ name: "end_at", type: "datetime2", precision: 3, transformer: utcDateTimeTransformer }) endAt: Date;

  @Column({ type: "nvarchar", length: 255, nullable: true }) reason: string | null;
  @Column({ type: "nvarchar", length: 255, nullable: true }) name: string | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;

  /** vc_users.id of the account that created the block (always the authenticated actor). NULL = legacy rows. Immutable. */
  @Column({ name: "created_by", type: "uniqueidentifier", nullable: true, update: false }) createdBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "created_by", foreignKeyConstraintName: "fk_vc_blocked_times_created_by" }) creator: UsersEntity | null;

  /** UTC instant set by the database default (SYSUTCDATETIME()). */
  @Column({ name: "created_at", type: "datetime2", precision: 3, insert: false, update: false, default: () => "SYSUTCDATETIME()", transformer: utcDateTimeTransformer })
  createdAt: Date;
}
