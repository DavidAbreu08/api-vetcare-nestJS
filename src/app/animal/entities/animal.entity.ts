import { UsersEntity } from "src/app/users/entities/users.entity";
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "animal" })
export class AnimalEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => UsersEntity, (user) => user.idAnimal)
  @JoinColumn({ name: "idOwner" })
  owner: UsersEntity;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column()
  age: number;

  @Column()
  color: string;

  @Column()
  breed: string;

  @Column()
  weight: number;

  @Column()
  height: number;

  @Column({nullable: true})
  description: string;

  @Column()
  gender: string;

  @Column({nullable: true})
  image: string;
  
  @Column({ default: false })
  confirmed: boolean;
}
