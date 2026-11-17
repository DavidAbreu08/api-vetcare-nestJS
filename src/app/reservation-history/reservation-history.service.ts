import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Actor, sameId } from "../core/authorization";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { ReservationHistoryEntity } from "./entities/reservation-history.entity";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryAction } from "./enums/reservation-history-action.enum";

/** State of a reservation stored in history snapshots (instants as ISO-8601 UTC). */
export type ReservationSnapshot = {
  status: string; employeeId: string | null; serviceId: string | null; startAt: string; endAt: string; confirmedAt: string | null; cancelledAt: string | null;
};

/** serviceId is recorded for events written after migration 1795608000000 (older snapshots do not have it). */
export function reservationSnapshot(reservation: Pick<ReservationEntity, "status" | "employeeId" | "startAt" | "endAt" | "confirmedAt" | "cancelledAt"> & Partial<Pick<ReservationEntity, "serviceId">>): ReservationSnapshot {
  const iso = (value: Date | null | undefined) => (value instanceof Date ? value.toISOString() : null);
  return {
    status: reservation.status, employeeId: reservation.employeeId ?? null, serviceId: reservation.serviceId ?? null,
    startAt: iso(reservation.startAt)!, endAt: iso(reservation.endAt)!,
    confirmedAt: iso(reservation.confirmedAt), cancelledAt: iso(reservation.cancelledAt),
  };
}

export type ReservationEvent = {
  reservationId: string;
  action: ReservationHistoryAction;
  changedBy: string | null;
  oldData?: object | null;
  newData?: object | null;
  reason?: string | null;
};

/**
 * Internal, append-only history. record() must run in the transaction of the change it describes; there is
 * no update or delete path (and a database trigger rejects both).
 */
@Injectable()
export class ReservationHistoryService {
  constructor(
    @InjectRepository(ReservationHistoryEntity) private readonly repository: Repository<ReservationHistoryEntity>,
    private readonly persistence: PersistenceService,
  ) {}

  async record(manager: EntityManager, event: ReservationEvent): Promise<void> {
    await manager.insert(ReservationHistoryEntity, {
      reservationId: event.reservationId,
      action: event.action,
      changedBy: event.changedBy,
      oldData: event.oldData ? JSON.stringify(event.oldData) : null,
      newData: event.newData ? JSON.stringify(event.newData) : null,
      reason: event.reason ?? null,
    });
  }

  /** Events in chronological order; access to the reservation is checked by the caller. */
  async list(reservationId: string, query: ListQueryDto, actor: Actor) {
    const rows = await this.persistence.execute(() => this.repository.find({
      where: { reservationId }, order: { createdAt: "ASC", id: "ASC" }, skip: query.skip, take: query.take,
    }));
    return rows.map(row => serializeHistoryEvent(row, actor));
  }
}

/**
 * Administrators see who made each change; others only learn whether it was themselves (no third-party ids). The same
 * rule applies to the client ids of CLIENT_CHANGED snapshots: a non-administrator sees only their own id, null otherwise.
 */
export function serializeHistoryEvent(row: ReservationHistoryEntity, actor: Actor) {
  const visibleId = (id: unknown) => (actor.isAdmin || (typeof id === "string" && sameId(id, actor.id)) ? id : null);
  const parse = (value: string | null) => {
    const data = value ? JSON.parse(value) as unknown : null;
    if (row.action !== ReservationHistoryAction.CLIENT_CHANGED || !data || typeof data !== "object" || !("clientId" in data)) return data;
    return { ...data, clientId: visibleId((data as { clientId: unknown }).clientId) };
  };
  return {
    id: row.id, reservationId: row.reservationId, action: row.action,
    changedBy: visibleId(row.changedBy) as string | null,
    changedBySelf: sameId(row.changedBy, actor.id),
    oldData: parse(row.oldData), newData: parse(row.newData), reason: row.reason, createdAt: row.createdAt,
  };
}
