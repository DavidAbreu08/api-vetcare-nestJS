import { Exclude, Expose } from "class-transformer";
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AnimalEntity } from "../../animal/entities/animal.entity";
import { ClinicalVisitEntity } from "../../clinical-visits/entities/clinical-visit.entity";
import { ClinicalVisitStatus } from "../../clinical-visits/enums/clinical-visit-status.enum";
import { utcDateTimeTransformer } from "../../core/persistence/utc-datetime";
import { MeasurementTypeEntity } from "../../measurement-types/entities/measurement-type.entity";
import { UsersEntity } from "../../users/entities/users.entity";

/**
 * Historical typed observation; value is a decimal string to preserve storage precision. A null measuredAt
 * identifies an imported observation of unknown time. Never physically deleted: an administrator soft-deletes
 * standalone rows with an audited reason; rows of a clinical visit cannot be deleted.
 */
@Entity("vc_animal_measurements")
@Index("ix_vc_animal_measurements_animal_type_date", ["animalId", "measurementTypeId", "measuredAt", "createdAt", "id"])
@Index("ix_vc_animal_measurements_recorded_by", ["recordedBy"])
@Index("ix_vc_animal_measurements_updated_by", ["updatedBy"])
@Index("ix_vc_animal_measurements_deleted_by", ["deletedBy"])
@Index("ix_vc_animal_measurements_clinical_visit_id", ["clinicalVisitId"])
@Check("ck_vc_animal_measurements_deleted",
  "([deleted_at] IS NULL AND [deleted_by] IS NULL AND [delete_reason] IS NULL) OR ([deleted_at] IS NOT NULL AND [deleted_by] IS NOT NULL AND [delete_reason] IS NOT NULL AND LEN(LTRIM(RTRIM([delete_reason]))) > 0)")
@Check("ck_vc_animal_measurements_clinical_not_deleted", "[clinical_visit_id] IS NULL OR [deleted_at] IS NULL")
export class AnimalMeasurementEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "animal_id", type: "uniqueidentifier" }) animalId: string;
  @ManyToOne(() => AnimalEntity, { nullable: false })
  @JoinColumn({ name: "animal_id", foreignKeyConstraintName: "fk_vc_animal_measurements_animal" }) animal: AnimalEntity;
  @Column({ type: "nvarchar", length: 255, nullable: true }) name: string | null;
  /** Immutable after creation. */
  @Column({ name: "measurement_type_id", type: "uniqueidentifier" }) measurementTypeId: string;
  @ManyToOne(() => MeasurementTypeEntity, { nullable: false })
  @JoinColumn({ name: "measurement_type_id", foreignKeyConstraintName: "fk_vc_animal_measurements_type" }) measurementType: MeasurementTypeEntity;
  @Column({ type: "decimal", precision: 18, scale: 6 }) value: string;
  /** UTC instant (null for imported observations of unknown time). */
  @Column({ name: "measured_at", type: "datetime2", nullable: true, transformer: utcDateTimeTransformer }) measuredAt: Date | null;
  @Column({ type: "nvarchar", length: 240, nullable: true }) description: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) notes: string | null;
  /** Original author (vc_users.id); never rewritten by updates. */
  @Column({ name: "recorded_by", type: "uniqueidentifier" }) recordedBy: string;
  @ManyToOne(() => UsersEntity, { nullable: false })
  @JoinColumn({ name: "recorded_by", foreignKeyConstraintName: "fk_vc_animal_measurements_recorder" }) recorder: UsersEntity;
  /** Last editor (vc_users.id); null until the first update. */
  @Column({ name: "updated_by", type: "uniqueidentifier", nullable: true }) updatedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "updated_by", foreignKeyConstraintName: "fk_vc_animal_measurements_updated_by" }) updater: UsersEntity | null;
  /** Clinical context (same animal, composite FK); immutable after creation. recordedBy remains the author. */
  @Column({ name: "clinical_visit_id", type: "uniqueidentifier", nullable: true }) clinicalVisitId: string | null;
  /**
   * Read-only join used to expose clinicalVisitStatus; never serialized (it would carry clinical data).
   * Mapped on clinical_visit_id only: a composite join column sharing animal_id with `animal` makes TypeORM 0.3
   * reuse/overwrite that column's metadata and generate wrong joins (animal.animalId = measurement.animal_id).
   * The composite FK fk_vc_animal_measurements_clinical_visit (clinical_visit_id, animal_id) ->
   * vc_clinical_visits (id, animal_id) exists only in the database (migration 1795089600000), hence
   * createForeignKeyConstraints: false.
   */
  @Exclude()
  @ManyToOne(() => ClinicalVisitEntity, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: "clinical_visit_id", referencedColumnName: "id" })
  clinicalVisit?: ClinicalVisitEntity | null;
  /** Soft-delete (UTC instant), author and reason; deleted rows are excluded from every read of this API. */
  @Column({ name: "deleted_at", type: "datetime2", precision: 3, nullable: true, transformer: utcDateTimeTransformer }) deletedAt: Date | null;
  @Column({ name: "deleted_by", type: "uniqueidentifier", nullable: true }) deletedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "deleted_by", foreignKeyConstraintName: "fk_vc_animal_measurements_deleted_by" }) deleter: UsersEntity | null;
  @Column({ name: "delete_reason", type: "nvarchar", length: 500, nullable: true }) deleteReason: string | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2" }) createdAt: Date;
  @UpdateDateColumn({ name: "updated_at", type: "datetime2" }) updatedAt: Date;

  /** Status of the linked clinical visit (every read of this API loads it); null without a visit. VOIDED rows never count as latest values. */
  @Expose()
  get clinicalVisitStatus(): ClinicalVisitStatus | null { return this.clinicalVisit?.status ?? null; }
}
