import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Exclude } from "class-transformer";
import { hashSync } from "bcrypt";
import { Role } from "../../core/enums/role.enum";
import { Function } from "../../core/enums/function.enum";
import { ResetTokenEntity } from "../../../auth/entities/reset-token.entity";
import { AnimalEntity } from "src/app/animal/entities/animal.entity";

@Entity({ name: "vc_users" })
export class UsersEntity {
  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "name" })
  name: string;

  @Column()
  email: string;

  @Exclude()
  @Column({ select: false })
  password: string;

  @Column({
    type: "simple-enum",
    enum: Role,
    name: "user_role",
    default: Role.CLIENTE,
  })
  role: Role;

  @Column({
    type: "simple-enum",
    enum: Function,
    default: Function.CLIENTE,
  })
  function: Function;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: "work_load", nullable: true, default: "none" })
  workLoad: string;

  @Column({ name: "birth_date", nullable: true })
  dateBirth: string;

  @Column({ name: "nif", nullable: true })
  nif: number;

  @OneToMany(() => ResetTokenEntity, (token) => token.user)
  resetTokens: ResetTokenEntity[];

  @OneToMany(() => AnimalEntity, (animal) => animal.owner)
  idAnimal: AnimalEntity[];

  @Column({ name: "profile_picture", type: "nvarchar", length: "MAX", nullable: true })
  profilePicture: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: string;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: string;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt: string;

  @BeforeInsert()
  hashPassword() {
    this.password = hashSync(this.password, 10);
  }
}
