import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { hashSync } from 'bcrypt';
import { Role } from "../core/enums/role.enum";
import { Function } from "../core/enums/function.enum";

@Entity({ name: "users" })
export class UsersEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "first_name" })
  firstName: string;

  @Column({ name: "last_name" })
  lastName: string;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column({ 
    type: 'enum', 
    enum: Role,
    name: 'user_role',
    default: Role.CLIENTE 
  })
  role: Role;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column()
  phone: string;

  @Column({
    type: 'enum',
    enum: Function,
    default: Function.ATENDIMENTO,
  })
  function: Function;

  @Column({ name: "NIF", nullable: true })
  nif: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: string;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: string;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt: string;

  @BeforeInsert()
  hashPassword(){
    this.password = hashSync(this.password, 10)
  }
}


