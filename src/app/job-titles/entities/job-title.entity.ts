import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/** Professional job-title catalog; an employee may hold several. */
@Entity("vc_job_titles")
@Unique("uq_vc_job_titles_code", ["code"])
export class JobTitleEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "varchar", length: 64 }) code: string;
  @Column({ type: "nvarchar", length: 100 }) name: string;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @Column({ name: "is_active", type: "bit", default: true }) isActive: boolean;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
