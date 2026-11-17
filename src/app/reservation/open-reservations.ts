import { ConflictException } from "@nestjs/common";
import { applicationError } from "../core/exceptions/application-error";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { EntityManager } from "typeorm";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { toDbUtc } from "../core/persistence/utc-datetime";
import { ReservationEntity } from "./entities/reservation.entity";

/** States that still commit a client, an animal and an employee to a future appointment. */
export const OPEN_RESERVATION_STATUSES = [ReservationStatus.PENDING, ReservationStatus.CONFIRMED];

export type OpenReservation = Pick<ReservationEntity, "id" | "status" | "startAt" | "endAt" | "employeeId" | "clientId" | "animalId">;

/** Exactly one filter: the assigned employee profile, the client account or the animal. */
export type OpenReservationFilter = { employeeId: string } | { clientId: string } | { animalId: string };

/**
 * PENDING/CONFIRMED reservations not yet finished (end_at after `now`, UTC), oldest first. Plain read without
 * lock hints: callers serialize through a row they have already locked (employee profile, account or animal)
 * that every flow creating or confirming such a reservation also locks (see the lock order in
 * docs/API_ORGANIZATION.md), so no reservation lock is taken here and the documented order is never inverted.
 */
export async function findOpenReservations(manager: EntityManager, filter: OpenReservationFilter, now = new Date()): Promise<OpenReservation[]> {
  const [key, value] = Object.entries(filter)[0] as [keyof OpenReservationFilter & string, string];
  return manager.createQueryBuilder(ReservationEntity, "r")
    .select(["r.id", "r.status", "r.startAt", "r.endAt", "r.employeeId", "r.clientId", "r.animalId"])
    .where(`r.${key} = :value`, { value })
    .andWhere("r.status IN (:...openStatuses)", { openStatuses: OPEN_RESERVATION_STATUSES })
    .andWhere("r.endAt > :now", { now: toDbUtc(now) })
    .orderBy("r.startAt", "ASC").addOrderBy("r.id", "ASC")
    .getMany();
}

/**
 * 409 IN_USE whose only public detail is a readable message with the number of affected reservations (no id lists or
 * count fields); clients find them through GET /api/vetcare/reservations with filters.
 */
export function openReservationsConflict(code: string, message: (count: number) => string, reservations: OpenReservation[]): ConflictException {
  return applicationError(ErrorMetadata.IN_USE, message(reservations.length), undefined, { code });
}
