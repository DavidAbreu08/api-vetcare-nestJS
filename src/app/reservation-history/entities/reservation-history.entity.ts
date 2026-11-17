import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { ReservationHistoryAction } from "../enums/reservation-history-action.enum";
import { ReservationEntity } from "../../reservation/entities/reservation.entity";

/** Append-only event of a reservation (a trigger rejects UPDATE/DELETE). JSON snapshots in old/new data. */
@Entity("vc_reservation_history")
@Index("ix_vc_reservation_history_reservation_created", ["reservationId", "createdAt"])
@Index("ix_vc_reservation_history_changed_by", ["changedBy"])
/** At most one CREATED event per reservation (migration 1795521600000); its changed_by is the reservation's created_by. */
@Index("uq_vc_reservation_history_created", ["reservationId"], { unique: true, where: "[action] = N'CREATED'" })
export class ReservationHistoryEntity {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "reservation_id", type: "uniqueidentifier" }) reservationId: string;
  @ManyToOne(() => ReservationEntity, { nullable: false })
  @JoinColumn({ name: "reservation_id" }) reservation: ReservationEntity;
  /** vc_users.id of the authenticated actor; null for system changes. */
  @Column({ name: "changed_by", type: "uniqueidentifier", nullable: true }) changedBy: string | null;
  @ManyToOne(() => UsersEntity, { nullable: true })
  @JoinColumn({ name: "changed_by" }) changedByUser: UsersEntity | null;
  @Column({ type: "nvarchar", length: 30 }) action: ReservationHistoryAction;
  @Column({ name: "old_data", type: "nvarchar", length: "MAX", nullable: true }) oldData: string | null;
  @Column({ name: "new_data", type: "nvarchar", length: "MAX", nullable: true }) newData: string | null;
  @Column({ type: "nvarchar", length: 500, nullable: true }) reason: string | null;
  @CreateDateColumn({ name: "created_at", type: "datetime2", default: () => "SYSDATETIME()" }) createdAt: Date;
}
