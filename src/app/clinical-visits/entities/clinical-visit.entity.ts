import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import { AnimalEntity } from "../../animal/entities/animal.entity";
import { utcDateTimeTransformer } from "../../core/persistence/utc-datetime";
import { EmployeeEntity } from "../../employees/entities/employee.entity";
import { ReservationEntity } from "../../reservation/entities/reservation.entity";
import { UsersEntity } from "../../users/entities/users.entity";
import { ClinicalVisitStatus } from "../enums/clinical-visit-status.enum";

/**
 * Clinical attendance of an animal, optionally originated by a reservation of the same animal
 * (composite FK (reservation_id, animal_id)). Never physically deleted; VOIDED keeps reason, instant and author.
 */
@Entity("vc_clinical_visits")
@Unique("uq_vc_clinical_visits_id_animal", ["id", "animalId"])
@Index("uq_vc_clinical_visits_reservation_id", ["reservationId"], { unique: true, where: "[reservation_id] IS NOT NULL" })
@Index("ix_vc_clinical_visits_animal_started", ["animalId", "startedAt"])
@Index("ix_vc_clinical_visits_employee_started", ["employeeId", "startedAt"])
@Index("ix_vc_clinical_visits_voided_by", ["voidedBy"])
export class ClinicalVisitEntity {
  @PrimaryGeneratedColumn("uuid") id: string;

  @Column({ name: "reservation_id", type: "uniqueidentifier", nullable: true }) reservationId: string | null;
  /**
   * Mapped on reservation_id only: a composite join column sharing animal_id with `animal` makes TypeORM 0.3
   * reuse/overwrite that column's metadata and generate wrong joins. The composite FK
   * fk_vc_clinical_visits_reservation_animal (reservation_id, animal_id) -> vc_reservations (id, animal_id)
   * exists only in the database (migration 1795089600000), hence createForeignKeyConstraints: false.
   */
  @ManyToOne(() => ReservationEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: "reservation_id", referencedColumnName: "id" })
  reservation: ReservationEntity | null;

  @Column({ name: "animal_id", type: "uniqueidentifier" }) animalId: string;
  @ManyToOne(() => AnimalEntity, { nullable: false })
  @JoinColumn({ name: "animal_id" }) animal: AnimalEntity;

  /** Responsible employee (vc_employees.id); may differ from the reservation's employee. */
  @Column({ name: "employee_id", type: "uniqueidentifier" }) employeeId: string;
  @ManyToOne(() => EmployeeEntity, { nullable: false })
  @JoinColumn({ name: "employee_id" }) employee: EmployeeEntity;

  @Column({ type: "nvarchar", length: 30, default: ClinicalVisitStatus.IN_PROGRESS }) status: ClinicalVisitStatus;
  /** UTC instant. */
  @Column({ name: "started_at", type: "datetime2", precision: 3, transformer: utcDateTimeTransformer }) startedAt: Date;
  /** UTC instant; set on completion. */
  @Column({ name: "ended_at", type: "datetime2", precision: 3, nullable: true, transformer: utcDateTimeTransformer }) endedAt: Date | null;
  /** Professional notes; never returned to clients. */
  @Column({ name: "clinical_notes", type: "nvarchar", length: "MAX", nullable: true }) clinicalNotes: string | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;

  @Column({ name: "void_reason", type: "nvarchar", length: 500, nullable: true }) voidReason: string | null;
  @Column({ name: "voided_at", type: "datetime2", precision: 3, nullable: true, transformer: utcDateTimeTransformer }) voidedAt: Date | null;
  /** vc_users.id of the administrator who voided the visit. */
  @Column({ name: "voided_by", type: "uniqueidentifier", nullable: true }) voidedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "voided_by" }) voidedByUser: UsersEntity | null;

  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
