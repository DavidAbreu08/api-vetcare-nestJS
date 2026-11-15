import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/** Generic application setting identified by an immutable uppercase code. */
@Entity("vc_system_settings")
@Unique("uq_vc_system_settings_code", ["code"])
export class SystemSettingEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "varchar", length: 64 }) code: string;
  @Column({ type: "nvarchar", length: 500, nullable: true }) value: string | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
