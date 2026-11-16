import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Exclude } from "class-transformer";
import { ResetTokenEntity } from "../../../auth/entities/reset-token.entity";
import { AnimalEntity } from "src/app/animal/entities/animal.entity";
import { UserRoleEntity } from "src/app/roles/entities/user-role.entity";
import { EmployeeEntity } from "src/app/employees/entities/employee.entity";

/** Account data only; authorization lives in vc_user_roles and employment in vc_employees. */
@Entity({ name: "vc_users" })
@Index("uq_vc_users_email", ["email"], { unique: true, where: "[deleted_at] IS NULL" })
@Index("uq_vc_users_nif", ["nif"], { unique: true, where: "[nif] IS NOT NULL AND [deleted_at] IS NULL" })
export class UsersEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "nvarchar", length: 150 })
  name: string;

  /** Stored trimmed and lowercase; unique among non-deleted users. */
  @Column({ type: "nvarchar", length: 255 })
  email: string;

  /** bcrypt hash; never selected by default nor serialized. */
  @Exclude()
  @Column({ name: "password_hash", type: "nvarchar", length: 255, select: false })
  passwordHash: string;

  @Column({ type: "nvarchar", length: 20, nullable: true })
  phone: string | null;

  /** YYYY-MM-DD. */
  @Column({ name: "birth_date", type: "date", nullable: true })
  birthDate: string | null;

  /** Nine-digit string; unique among non-deleted users. */
  @Column({ type: "varchar", length: 9, nullable: true })
  nif: string | null;

  @Column({ name: "profile_picture_url", type: "nvarchar", length: 500, nullable: true })
  profilePictureUrl: string | null;

  @Column({ name: "is_active", type: "bit", default: true })
  isActive: boolean;

  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @OneToMany(() => ResetTokenEntity, (token) => token.user)
  resetTokens: ResetTokenEntity[];

  @OneToMany(() => AnimalEntity, (animal) => animal.owner)
  animals: AnimalEntity[];

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user)
  userRoles: UserRoleEntity[];

  @OneToOne(() => EmployeeEntity, (employee) => employee.user)
  employee: EmployeeEntity | null;

  @CreateDateColumn({ name: "created_at", type: "datetime2" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "datetime2" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "datetime2" })
  deletedAt: Date | null;
}
