import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("blocked_times")
export class BlockedTimeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  date: Date; // YYYY-MM-DD

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
}
