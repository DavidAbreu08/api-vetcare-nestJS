import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import { UsersEntity } from "../../users/entities/users.entity";
import { EmployeeJobTitleEntity } from "./employee-job-title.entity";

/** Employment profile of a user account; booking eligibility is independent of roles. */
@Entity("vc_employees")
@Unique("uq_vc_employees_user_id", ["userId"])
@Index("uq_vc_employees_employee_number", ["employeeNumber"], { unique: true, where: "[employee_number] IS NOT NULL" })
export class EmployeeEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "user_id", type: "uniqueidentifier" }) userId: string;
  @OneToOne(() => UsersEntity, user => user.employee, { nullable: false })
  @JoinColumn({ name: "user_id" }) user: UsersEntity;
  @Column({ name: "employee_number", type: "nvarchar", length: 30, nullable: true }) employeeNumber: string | null;
  @Column({ name: "license_number", type: "nvarchar", length: 50, nullable: true }) licenseNumber: string | null;
  /** YYYY-MM-DD. */
  @Column({ name: "hire_date", type: "date", nullable: true }) hireDate: string | null;
  /** YYYY-MM-DD; on or after hireDate when both are known. */
  @Column({ name: "termination_date", type: "date", nullable: true }) terminationDate: string | null;
  @Column({ name: "is_available_for_bookings", type: "bit", default: true }) isAvailableForBookings: boolean;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @OneToMany(() => EmployeeJobTitleEntity, link => link.employee) jobTitleLinks: EmployeeJobTitleEntity[];
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
