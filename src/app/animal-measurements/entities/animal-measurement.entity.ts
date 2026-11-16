import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AnimalEntity } from "../../animal/entities/animal.entity";
import { MeasurementTypeEntity } from "../../measurement-types/entities/measurement-type.entity";
import { UsersEntity } from "../../users/entities/users.entity";

/** Historical typed observation; value is a decimal string to preserve storage precision. Null author/time identify imported observations. */
@Entity("vc_animal_measurements")
export class AnimalMeasurementEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "animal_id", type: "uniqueidentifier" }) animalId: string;
  @ManyToOne(() => AnimalEntity, { nullable: false })
  @JoinColumn({ name: "animal_id" }) animal: AnimalEntity;
  @Column({ type: "nvarchar", length: 255, nullable: true }) name: string | null;
  @Column({ name: "measurement_type_id", type: "uniqueidentifier" }) measurementTypeId: string;
  @ManyToOne(() => MeasurementTypeEntity, { nullable: false })
  @JoinColumn({ name: "measurement_type_id" }) measurementType: MeasurementTypeEntity;
  @Column({ type: "decimal", precision: 18, scale: 6 }) value: string;
  @Column({ name: "measured_at", type: "datetime2", nullable: true }) measuredAt: Date | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @Column({ name: "recorded_by", type: "uniqueidentifier", nullable: true }) recordedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "recorded_by" }) recorder: UsersEntity | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2" }) updatedAt: Date;
}
