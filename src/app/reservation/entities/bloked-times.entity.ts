import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('blocked_times')
export class BlockedTimeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: string; // YYYY-MM-DD

  @Column()
  time: string; // HH:mm

  @Column({ nullable: true })
  reason: string;
}