import { Actor } from "../core/authorization";
import { contactSummary, projectRelatedUser, publicEmployeeSummary } from "../users/user.projection";
import { ReservationEntity } from "./entities/reservation.entity";

/**
 * Reservation response for the actor. Non-administrators see the assigned employee as
 * { id, name, profilePictureUrl } and the client as { id, name, email, phone }; the animal's owner is
 * the client and is only repeated (full) for administrators. Administrators see full accounts,
 * never password hashes.
 */
export function serializeReservation<R extends ReservationEntity>(reservation: R, actor: Actor) {
  const view = { ...reservation } as unknown as Record<string, unknown>;
  if ("client" in reservation) view.client = projectRelatedUser(reservation.client, actor, contactSummary);
  if ("employee" in reservation) view.employee = projectRelatedUser(reservation.employee, actor, publicEmployeeSummary);
  if (reservation.animal) {
    const { owner, ...animal } = reservation.animal;
    view.animal = actor.isAdmin && owner !== undefined ? { ...animal, owner: projectRelatedUser(owner, actor, contactSummary) } : animal;
  }
  return view as Omit<R, "client" | "employee" | "animal"> & Record<"client" | "employee" | "animal", unknown>;
}

export function serializeReservations(reservations: ReservationEntity[], actor: Actor) {
  return reservations.map(reservation => serializeReservation(reservation, actor));
}
