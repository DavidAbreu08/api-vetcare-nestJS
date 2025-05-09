import { AnimalEntity } from "src/app/animal/entities/animal.entity";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";
import { UsersEntity } from "src/app/users/entities/users.entity";
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("reservation")
export class ReservationEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => AnimalEntity)
  @JoinColumn({ name: "animalId" })
  animal: AnimalEntity;

  @ManyToOne(() => UsersEntity)
  @JoinColumn({ name: "clientId" })
  client: UsersEntity;

  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "employeeId" })
  employee: UsersEntity | null;

  @Column()
  date: Date;

  @Column()
  timeStart: string; // Format: "HH:mm"

  @Column()
  timeEnd: string; // Format: "HH:mm"

  @Column()
  start: Date;

  @Column()
  end: Date;

  @Column({ nullable: true })
  reason: string;

  @Column({
    type: "enum",
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Column({ nullable: true })
  rescheduleNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  combineDateTime() {
    if (this.date && this.timeStart) {
      this.start = this.combineDateAndTime(this.date, this.timeStart);
    }
    if (this.date && this.timeEnd) {
      this.end = this.combineDateAndTime(this.date, this.timeEnd);
    }
  }

  private combineDateAndTime(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }
}
