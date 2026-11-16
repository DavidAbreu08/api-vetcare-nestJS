import { Actor } from "../core/authorization";
import { AccountSummary, serializeAccount } from "../employees/employee.serializer";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { contactSummary, projectRelatedUser, PublicEmployeeSummary } from "../users/user.projection";
import { ReservationEntity } from "./entities/reservation.entity";

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
 */
export function serializeReservation<R extends ReservationEntity>(reservation: R, actor: Actor) {
  const view = { ...reservation } as unknown as Record<string, unknown>;
  if ("client" in reservation) view.client = projectRelatedUser(reservation.client, actor, contactSummary);
  if ("employee" in reservation) view.employee = projectEmployee(reservation.employee, actor);
  if (reservation.animal) {
    const { owner, ...animal } = reservation.animal;
    view.animal = actor.isAdmin && owner !== undefined ? { ...animal, owner: projectRelatedUser(owner, actor, contactSummary) } : animal;
  }
  return view as Omit<R, "client" | "employee" | "animal"> & Record<"client" | "employee" | "animal", unknown>;
}

export function serializeReservations(reservations: ReservationEntity[], actor: Actor) {
  return reservations.map(reservation => serializeReservation(reservation, actor));
}
