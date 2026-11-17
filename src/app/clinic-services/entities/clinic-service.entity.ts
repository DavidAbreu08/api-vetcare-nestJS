import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/** Allowed durations: 1..1440 minutes, multiples of 5 (same rule as ck_vc_services_duration). */
export const SERVICE_DURATION = Object.freeze({ min: 5, max: 1440, step: 5 });

/**
 * Catalog of bookable clinic services (migration 1795608000000, table vc_services). Named ClinicService to avoid
 * confusion with Nest "services". The duration only computes endAt of NEW reservations; existing reservations keep
 * their own start_at/end_at. Referenced services are deactivated (is_active = 0), never deleted.
 */
@Entity("vc_services")
@Unique("uq_vc_services_code", ["code"])
@Check("ck_vc_services_code", "[code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%'")
@Check("ck_vc_services_duration", "[duration_minutes] BETWEEN 1 AND 1440 AND [duration_minutes] % 5 = 0")
export class ClinicServiceEntity {
  @PrimaryGeneratedColumn("uuid", { primaryKeyConstraintName: "pk_vc_services" }) id: string;
  @Column({ type: "varchar", length: 64 }) code: string;
  @Column({ type: "nvarchar", length: 100 }) name: string;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ name: "duration_minutes", type: "int" }) durationMinutes: number;
  @Column({ name: "is_active", type: "bit", default: true }) isActive: boolean;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
