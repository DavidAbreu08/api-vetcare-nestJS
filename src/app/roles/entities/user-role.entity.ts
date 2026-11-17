import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { UsersEntity } from "../../users/entities/users.entity";
import { RoleEntity } from "./role.entity";

/** Assignment of a role to a user (composite key), audited with who assigned it and when. */
@Entity("vc_user_roles")
@Index("ix_vc_user_roles_role_id", ["roleId"])
@Index("ix_vc_user_roles_assigned_by", ["assignedBy"])
export class UserRoleEntity {
  @PrimaryColumn({ name: "user_id", type: "uniqueidentifier" }) userId: string;
  @PrimaryColumn({ name: "role_id", type: "uniqueidentifier" }) roleId: string;
  @ManyToOne(() => UsersEntity, user => user.userRoles, { nullable: false })
  @JoinColumn({ name: "user_id", foreignKeyConstraintName: "fk_vc_user_roles_user" }) user: UsersEntity;
  @ManyToOne(() => RoleEntity, { nullable: false })
  @JoinColumn({ name: "role_id", foreignKeyConstraintName: "fk_vc_user_roles_role" }) role: RoleEntity;
  /** Authenticated actor who made the assignment; null for seeds, migration and public registration. */
  @Column({ name: "assigned_by", type: "uniqueidentifier", nullable: true }) assignedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "assigned_by", foreignKeyConstraintName: "fk_vc_user_roles_assigned_by" }) assigner: UsersEntity | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
}
