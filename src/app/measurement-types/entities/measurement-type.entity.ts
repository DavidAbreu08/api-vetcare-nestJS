import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/** Configurable catalog; referenced types are retained for historical observations. */
@Entity("vc_measurement_types")
@Unique("uq_vc_measurement_types_code", ["code"])
@Check("ck_vc_measurement_types_code", "[code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%'")
export class MeasurementTypeEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "varchar", length: 64 }) code: string;
  @Column({ type: "nvarchar", length: 255 }) name: string;
  @Column({ type: "nvarchar", length: 32 }) unit: string;
  @Column({ name: "is_active", type: "bit", default: true }) isActive: boolean;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
