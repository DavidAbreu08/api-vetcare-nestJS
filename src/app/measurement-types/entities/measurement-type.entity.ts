import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/** Configurable catalog; referenced types are retained for historical observations. */
@Entity("vc_measurement_types")
export class MeasurementTypeEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "varchar", length: 64, unique: true }) code: string;
  @Column({ type: "nvarchar", length: 255 }) name: string;
  @Column({ type: "nvarchar", length: 32 }) unit: string;
  @Column({ name: "is_active", type: "bit", default: true }) isActive: boolean;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
