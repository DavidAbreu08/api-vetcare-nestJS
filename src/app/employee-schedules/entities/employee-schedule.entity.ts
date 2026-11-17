import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer } from "typeorm";
import { EmployeeEntity } from "../../employees/entities/employee.entity";

/**
 * time(0) <-> "HH:mm". Written as a Date with zero seconds and milliseconds (TypeORM would otherwise build the Date from
 * the current clock and keep its seconds); read back from TypeORM's "HH:mm:ss" string.
 */
export const clinicTimeTransformer: ValueTransformer = {
  to: (value: string | null | undefined) => {
    if (typeof value !== "string") return value;
    const [hours, minutes] = value.split(":").map(Number);
    return new Date(1970, 0, 1, hours, minutes, 0, 0);
  },
  from: (value: string | null | undefined) => (typeof value === "string" ? value.slice(0, 5) : value),
};

/**
 * Weekly working period of an employee profile (vc_employee_schedules, migration 1795694400000) in clinic local time:
 * dayOfWeek 0 = Sunday .. 6 = Saturday (the clinicParts().weekday / CLINIC_POLICY.days convention), startTime < endTime
 * on the same day (no period crosses midnight), valid from validFrom to validUntil inclusive (NULL = open-ended).
 * Several rows for the same day are several periods; they never overlap (application rule, checked under the employee
 * schedule applock by PUT /employees/:id/schedules, the only writer).
 */
@Entity("vc_employee_schedules")
@Index("ix_vc_employee_schedules_employee_day", ["employeeId", "dayOfWeek", "validFrom"])
export class EmployeeScheduleEntity {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "pk_vc_employee_schedules" }) id: string;
  @Column({ name: "employee_id", type: "uniqueidentifier" }) employeeId: string;
  @ManyToOne(() => EmployeeEntity, { nullable: false })
  @JoinColumn({ name: "employee_id", foreignKeyConstraintName: "fk_vc_employee_schedules_employee" }) employee: EmployeeEntity;
  @Column({ name: "day_of_week", type: "tinyint" }) dayOfWeek: number;
  /** "HH:mm", clinic local time. */
  @Column({ name: "start_time", type: "time", precision: 0, transformer: clinicTimeTransformer }) startTime: string;
  /** "HH:mm", clinic local time, after startTime. */
  @Column({ name: "end_time", type: "time", precision: 0, transformer: clinicTimeTransformer }) endTime: string;
  /** YYYY-MM-DD (clinic calendar date), inclusive. */
  @Column({ name: "valid_from", type: "date" }) validFrom: string;
  /** YYYY-MM-DD inclusive; NULL = no end. */
  @Column({ name: "valid_until", type: "date", nullable: true }) validUntil: string | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
