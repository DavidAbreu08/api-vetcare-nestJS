import { Actor, sameId } from "../core/authorization";
import { AccountSummary, serializeAccount } from "../employees/employee.serializer";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { contactSummary, projectRelatedUser, PublicEmployeeSummary } from "../users/user.projection";
import { ReservationEntity } from "./entities/reservation.entity";
import { clinicServiceSummary } from "../clinic-services/clinic-service.projection";

export type AdminEmployeeSummary = PublicEmployeeSummary & { userId: string; user: AccountSummary | null };

/**
 * Employee profile attached to a record (reservation, clinical visit). Non-administrators see
 * { id, name, profilePictureUrl } (id = vc_employees.id, name/picture from the account); administrators
 * also get userId and the full account (never the password hash).
 */
export function projectEmployee(employee: EmployeeEntity | null | undefined, actor: Actor): PublicEmployeeSummary | AdminEmployeeSummary | null | undefined {
  if (!employee) return employee;
  const summary: PublicEmployeeSummary = { id: employee.id, name: employee.user?.name ?? "", profilePictureUrl: employee.user?.profilePictureUrl ?? null };
  return actor.isAdmin ? { ...summary, userId: employee.userId, user: employee.user ? serializeAccount(employee.user) : null } : summary;
}

/**
 * Reservation response for the actor. Non-administrators see the employee as { id, name, profilePictureUrl }
 * and the client (the responsible tutor, client_id) as { id, name, email, phone }; the animal's owner (its current
 * primary tutor, which may differ from the client) is only shown (full) to administrators. Administrators see full
 * accounts, never password hashes.
 * Authorship (created_by), same rule as changedBy in history events: administrators see createdBy; everyone else sees
 * it only when it is their own id (null otherwise, so the id of the employee who booked for a client never leaks), and
 * every caller gets createdBySelf. The creator account itself is never serialized to non-administrators.
 */
export function serializeReservation<R extends ReservationEntity>(reservation: R, actor: Actor) {
  const { creator, ...rest } = reservation;
  const view = { ...rest } as unknown as Record<string, unknown>;
  const createdBy = reservation.createdBy ?? null;
  view.createdBy = actor.isAdmin || sameId(createdBy, actor.id) ? createdBy : null;
  view.createdBySelf = sameId(createdBy, actor.id);
  if (actor.isAdmin && creator !== undefined) view.creator = projectRelatedUser(creator, actor, contactSummary);
  if ("client" in reservation) view.client = projectRelatedUser(reservation.client, actor, contactSummary);
  if ("employee" in reservation) view.employee = projectEmployee(reservation.employee, actor);
  // Service summary { id, code, name, durationMinutes } (same for every caller), always present; null for legacy
  // reservations (service_id NULL). Every loader joins the relation, so a missing one is a programming error, never omitted.
  if (reservation.service) view.service = clinicServiceSummary(reservation.service);
  else if (!reservation.serviceId) view.service = null;
  else throw new Error(`Reservation ${reservation.id}: service relation not loaded`);
  if (reservation.animal) {
    const { owner, ...animal } = reservation.animal;
    view.animal = actor.isAdmin && owner !== undefined ? { ...animal, owner: projectRelatedUser(owner, actor, contactSummary) } : animal;
  }
  return view as Omit<R, "client" | "employee" | "animal" | "creator" | "createdBy" | "service">
    & Record<"client" | "employee" | "animal" | "service", unknown> & { createdBy: string | null; createdBySelf: boolean };
}

export function serializeReservations(reservations: ReservationEntity[], actor: Actor) {
  return reservations.map(reservation => serializeReservation(reservation, actor));
}
