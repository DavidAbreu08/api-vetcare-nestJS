import { AnimalEntity } from "src/app/animal/entities/animal.entity";
import { ClinicServiceEntity } from "src/app/clinic-services/entities/clinic-service.entity";
import { ReservationStatus } from "src/app/core/enums/reservation-status.enum";
import { utcDateTimeTransformer } from "src/app/core/persistence/utc-datetime";
import { EmployeeEntity } from "src/app/employees/entities/employee.entity";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/**
 * Appointment with UTC instants. State changes go through ReservationBusinessService (one transaction with the
 * history event). row_version (rowversion) exists in SQL but is not mapped: writes lock the row (UPDLOCK) and
 * re-validate the state inside the transaction instead of relying on optimistic checks.
 */
@Entity("vc_reservations")
@Unique("uq_vc_reservations_id_animal", ["id", "animalId"])
@Index("ix_vc_reservations_client_start", ["clientId", "startAt"])
@Index("ix_vc_reservations_animal_start", ["animalId", "startAt"])
@Index("ix_vc_reservations_employee_start", ["employeeId", "startAt"])
@Index("ix_vc_reservations_status_start", ["status", "startAt"])
@Index("ix_vc_reservations_created_by", ["createdBy"])
@Index("ix_vc_reservations_service_id", ["serviceId"])
export class ReservationEntity {
  @PrimaryGeneratedColumn("uuid") id: string;

  @Column({ name: "animal_id", type: "uniqueidentifier" }) animalId: string;
  @ManyToOne(() => AnimalEntity, { nullable: false })
  @JoinColumn({ name: "animal_id", foreignKeyConstraintName: "fk_vc_reservations_animal" }) animal: AnimalEntity;

  @Column({ name: "client_id", type: "uniqueidentifier" }) clientId: string;
  @ManyToOne(() => UsersEntity, { nullable: false })
  @JoinColumn({ name: "client_id", foreignKeyConstraintName: "fk_vc_reservations_client" }) client: UsersEntity;

  /**
   * vc_users.id of the account that created the reservation (POST /reservations: always the authenticated actor, never
   * read from the body). NULL = system/unknown (reservations without a CREATED event before migration 1795521600000).
   * Immutable: `update: false` keeps it out of every UPDATE. Invariant: equals changed_by of the CREATED history event.
   * Distinct from clientId (the responsible tutor): staff booking for a client are the creator, not the client.
   */
  @Column({ name: "created_by", type: "uniqueidentifier", nullable: true, update: false }) createdBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "created_by", foreignKeyConstraintName: "fk_vc_reservations_created_by" }) creator: UsersEntity | null;

  /**
   * Clinic service (vc_services.id, migration 1795608000000). Required on POST /reservations; NULL only for reservations
   * created before the catalog existed (no qualification check for them). Immutable: changing the service of an existing
   * reservation is not supported, so `update: false` keeps it out of every UPDATE.
   */
  @Column({ name: "service_id", type: "uniqueidentifier", nullable: true, update: false }) serviceId: string | null;
  @ManyToOne(() => ClinicServiceEntity, { nullable: true })
  @JoinColumn({ name: "service_id", foreignKeyConstraintName: "fk_vc_reservations_service" }) service: ClinicServiceEntity | null;

  /** vc_employees.id (employee profile), not the account. */
  @Column({ name: "employee_id", type: "uniqueidentifier", nullable: true }) employeeId: string | null;
  @ManyToOne(() => EmployeeEntity, { nullable: true })
  @JoinColumn({ name: "employee_id", foreignKeyConstraintName: "fk_vc_reservations_employee" }) employee: EmployeeEntity | null;

  /** UTC instant. */
  @Column({ name: "start_at", type: "datetime2", precision: 3, transformer: utcDateTimeTransformer }) startAt: Date;
  /** UTC instant, after startAt. */
  @Column({ name: "end_at", type: "datetime2", precision: 3, transformer: utcDateTimeTransformer }) endAt: Date;

  @Column({ type: "nvarchar", length: 30, default: ReservationStatus.PENDING }) status: ReservationStatus;
  @Column({ type: "nvarchar", length: 500, nullable: true }) reason: string | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: "MAX", nullable: true }) notes: string | null;

  @Column({ name: "confirmed_at", type: "datetime2", precision: 3, nullable: true, transformer: utcDateTimeTransformer }) confirmedAt: Date | null;
  @Column({ name: "cancelled_at", type: "datetime2", precision: 3, nullable: true, transformer: utcDateTimeTransformer }) cancelledAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2", default: () => "SYSDATETIME()" }) updatedAt: Date;
}
