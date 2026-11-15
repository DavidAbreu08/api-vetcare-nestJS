import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AnimalEntity } from "../../animal/entities/animal.entity";
import { UsersEntity } from "../../users/entities/users.entity";

/** Historical observation in kilograms and centimeters. Null author/time identify imported observations. */
@Entity("vc_animal_measurements")
export class AnimalMeasurementEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "animal_id", type: "uniqueidentifier" }) animalId: string;
  @ManyToOne(() => AnimalEntity, { nullable: false })
  @JoinColumn({ name: "animal_id" }) animal: AnimalEntity;
  @Column({ type: "nvarchar", length: 255, nullable: true }) name: string | null;
  @Column({ type: "decimal", precision: 13, scale: 3, nullable: true }) weight: number | null;
  @Column({ type: "decimal", precision: 6, scale: 2, nullable: true }) height: number | null;
  @Column({ name: "measured_at", type: "datetime2", nullable: true }) measuredAt: Date | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @Column({ name: "user_id", type: "uniqueidentifier", nullable: true }) userId: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "user_id" }) user: UsersEntity | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2" }) updatedAt: Date;
}
