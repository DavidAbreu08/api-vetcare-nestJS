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
import { hashSync } from 'bcrypt';
import { Role } from "../../core/enums/role.enum";
import { Function } from "../../core/enums/function.enum";
import { ResetTokenEntity } from "../../../auth/entities/reset-token.entity";

@Entity({ name: "users" })
export class UsersEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({name: 'nome'})
  name: string;


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

  @Column({nullable:true})
  phone: string;

  @Column({
    type: 'enum',
    enum: Function,
    default: Function.ATENDIMENTO,
  })
  function: Function;

  @Column({ name: "NIF", nullable: true })
  nif: number;

  @OneToMany(() => ResetTokenEntity, token => token.user)
  resetTokens: ResetTokenEntity[];

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


