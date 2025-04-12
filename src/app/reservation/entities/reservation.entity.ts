import { AnimalEntity } from "src/app/animal/entities/animal.entity";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('reservation')
export class ReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AnimalEntity)
  @JoinColumn({ name: 'animalId' })
  animal: AnimalEntity;

  @ManyToOne(() => UsersEntity)
  @JoinColumn({ name: 'clientId' })
  client: UsersEntity;

  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: 'employeeId' })
  employee: UsersEntity | null;

  @Column()
  date: Date; // YYYY-MM-DD

  @Column()
  time: string; // HH:mm

  @Column({ nullable: true })
  reason: string;

  @Column({ 
    type: 'enum', 
    enum: ReservationStatus, 
    default: ReservationStatus.PENDING 
  })
  status: ReservationStatus;

  @Column({ nullable: true })
  rescheduleNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}