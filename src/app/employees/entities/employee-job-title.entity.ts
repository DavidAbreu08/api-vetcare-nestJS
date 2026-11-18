import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { JobTitleEntity } from "../../job-titles/entities/job-title.entity";
import { EmployeeEntity } from "./employee.entity";

/** Assignment of a job title to an employee (composite key). */
@Entity("vc_employee_job_titles")
@Index("ix_vc_employee_job_titles_job_title_id", ["jobTitleId"])
export class EmployeeJobTitleEntity {
  @PrimaryColumn({ name: "employee_id", type: "uniqueidentifier" }) employeeId: string;
  @PrimaryColumn({ name: "job_title_id", type: "uniqueidentifier" }) jobTitleId: string;
  @ManyToOne(() => EmployeeEntity, employee => employee.jobTitleLinks, { nullable: false })
  @JoinColumn({ name: "employee_id", foreignKeyConstraintName: "fk_vc_employee_job_titles_employee" }) employee: EmployeeEntity;
  @ManyToOne(() => JobTitleEntity, { nullable: false })
  @JoinColumn({ name: "job_title_id", foreignKeyConstraintName: "fk_vc_employee_job_titles_job_title" }) jobTitle: JobTitleEntity;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
}
