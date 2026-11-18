import { ConflictException } from "@nestjs/common";
import { applicationError } from "../core/exceptions/application-error";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { EntityManager } from "typeorm";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { toDbUtc } from "../core/persistence/utc-datetime";
import { utcInstantParam, uuidParam } from "../core/persistence/sql-params";
import { ReservationEntity } from "./entities/reservation.entity";

/** States that still commit a client, an animal and an employee to a future appointment. */
export const OPEN_RESERVATION_STATUSES = [ReservationStatus.PENDING, ReservationStatus.CONFIRMED];

export type OpenReservation = Pick<ReservationEntity, "id" | "status" | "startAt" | "endAt" | "employeeId" | "clientId" | "animalId" | "serviceId">;

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
    .select(["r.id", "r.status", "r.startAt", "r.endAt", "r.employeeId", "r.clientId", "r.animalId", "r.serviceId"])
    .where(`r.${key} = :value`, { value })
    .andWhere("r.status IN (:...openStatuses)", { openStatuses: OPEN_RESERVATION_STATUSES })
    .andWhere("r.endAt > :now", { now: toDbUtc(now) })
    .orderBy("r.startAt", "ASC").addOrderBy("r.id", "ASC")
    .getMany();
}

/**
 * CONFIRMED reservations intersecting [from, to) (start_at < @to AND end_at > @from, UTC), optionally only of the given
 * employee profiles, oldest first. Plain read without lock hints: block writes call it under the closures applock
 * (Exclusive) or the employee applock, which every confirmation also holds; schedule replacement under the employee
 * applock; availability reads are indicative. PENDING reservations do not occupy time.
 */
export function findConfirmedReservationsBetween(manager: EntityManager, from: Date, to: Date, employeeIds?: string[]): Promise<OpenReservation[]> {
  if (employeeIds && !employeeIds.length) return Promise.resolve([]);
  const query = manager.createQueryBuilder(ReservationEntity, "r")
    .select(["r.id", "r.status", "r.startAt", "r.endAt", "r.employeeId", "r.clientId", "r.animalId", "r.serviceId"])
    .where("r.status = :confirmed", { confirmed: ReservationStatus.CONFIRMED })
    .andWhere("r.startAt < :to", { to: utcInstantParam(to) })
    .andWhere("r.endAt > :from", { from: utcInstantParam(from) });
  if (employeeIds) query.andWhere("r.employeeId IN (:...confirmedEmployeeIds)", { confirmedEmployeeIds: employeeIds.map(uuidParam) });
  return query.orderBy("r.startAt", "ASC").addOrderBy("r.id", "ASC").getMany();
}

/**
 * 409 IN_USE whose only public detail is a readable message with the number of affected reservations (no id lists or
 * count fields); clients find them through GET /api/vetcare/reservations with filters.
 */
export function openReservationsConflict(code: string, message: (count: number) => string, reservations: OpenReservation[]): ConflictException {
  return applicationError(ErrorMetadata.IN_USE, message(reservations.length), undefined, { code });
}
