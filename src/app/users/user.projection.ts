import { Actor } from "../core/authorization";
import { AccountSummary, serializeAccount } from "../employees/employee.serializer";
import { UsersEntity } from "./entities/users.entity";

/** What another user may see of an employee attached to a record (reservation). */
export type PublicEmployeeSummary = { id: string; name: string; profilePictureUrl: string | null };

/** Contact data staff need to serve a client (reservation client, animal owner). */
export type ContactSummary = { id: string; name: string; email: string; phone: string | null };

export function publicEmployeeSummary(user: UsersEntity): PublicEmployeeSummary {
  return { id: user.id, name: user.name, profilePictureUrl: user.profilePictureUrl ?? null };
}

export function contactSummary(user: UsersEntity): ContactSummary {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone ?? null };
}

/**
 * Related account as seen by the actor: administrators get the full account (never the password hash),
 * everyone else the given reduced projection. Missing relations stay as they are (null/undefined).
 */
export function projectRelatedUser<T>(
  user: UsersEntity | null | undefined, actor: Actor, reduced: (user: UsersEntity) => T,
): AccountSummary | T | null | undefined {
  if (!user) return user;
  return actor.isAdmin ? serializeAccount(user) : reduced(user);
}
