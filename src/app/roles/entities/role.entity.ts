import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/** Role catalog; system roles are identified by vc_system_settings, never by code. */
@Entity("vc_roles")
@Unique("uq_vc_roles_code", ["code"])
export class RoleEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "varchar", length: 64 }) code: string;
  @Column({ type: "nvarchar", length: 100 }) name: string;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @Column({ name: "is_active", type: "bit", default: true }) isActive: boolean;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
