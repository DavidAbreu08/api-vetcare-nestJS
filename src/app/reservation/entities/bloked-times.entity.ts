import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity('blocked_times')
@Index(['date', 'time'], { unique: true })
export class BlockedTimeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date; // YYYY-MM-DD

  @Column()
  time: string; // HH:mm

  @Column({ nullable: true })
  reason: string;
}