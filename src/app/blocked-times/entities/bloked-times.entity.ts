import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("vc_blocked_times")
export class BlockedTimeEntity {
  @Column({ type: "nvarchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "nvarchar", length: 240, nullable: true })
  description: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true })
  notes: string | null;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  date: Date; // YYYY-MM-DD

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
}
