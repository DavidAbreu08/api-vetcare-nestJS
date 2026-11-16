import { AnimalEntity } from "src/app/animal/entities/animal.entity";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { clinicDateTime } from "../reservation-policy";
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

@Entity("vc_reservations")
export class ReservationEntity {
  @Column({ type: "nvarchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => AnimalEntity)
  @JoinColumn({ name: "animal_id" })
  animal: AnimalEntity;

  @Column({ name: "animal_id", type: "uniqueidentifier", nullable: true })
  animalId: string | null;

  @ManyToOne(() => UsersEntity)
  @JoinColumn({ name: "client_id" })
  client: UsersEntity;

  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "employee_id" })
  employee: UsersEntity | null;

  @Column()
  date: Date;

  @Column({ name: "time_start" })
  timeStart: string; // Format: "HH:mm"

  @Column({ name: "time_end" })
  timeEnd: string; // Format: "HH:mm"

  @Column()
  start: Date;

  @Column()
  end: Date;

  @Column({ nullable: true })
  reason: string;

  @Column({
    type: "simple-enum",
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Column({ name: "reschedule_note", nullable: true })
  rescheduleNote: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
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
    return clinicDateTime(date, timeString);
  }
}
