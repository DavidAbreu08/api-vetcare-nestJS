import { ForbiddenException } from "@nestjs/common";
import { Role } from "./enums/role.enum";

export type Actor = { id: string; role: Role };

export function requireOwnerOrAdmin(actor: Actor, ownerId: string): void {
  if (actor.role !== Role.ADMIN && actor.id !== ownerId) {
    throw new ForbiddenException("Access denied");
  }
}

export function requireAnimalAccess(actor: Actor, ownerId: string): void {
  if (actor.role !== Role.ADMIN && actor.role !== Role.FUNCIONARIO) {
    requireOwnerOrAdmin(actor, ownerId);
  }
}
