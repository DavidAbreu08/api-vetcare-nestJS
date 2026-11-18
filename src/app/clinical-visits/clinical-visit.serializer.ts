import { Actor } from "../core/authorization";
import { projectEmployee } from "../reservation/reservation.serializer";
import { contactSummary, projectRelatedUser } from "../users/user.projection";
import { ClinicalVisitEntity } from "./entities/clinical-visit.entity";

/**
 * Clinical visit as seen by the actor. Without professional access (the owner as client) clinicalNotes and
 * voidReason are removed; voidedBy and completedBy (account ids) are shown only to administrators. The employee is projected
 * as in reservations and the animal's owner is repeated only for administrators.
 */
export function serializeClinicalVisit(visit: ClinicalVisitEntity, actor: Actor, professional: boolean) {
  const view = { ...visit } as Record<string, unknown>;
  delete view.voidedByUser;
  delete view.completedByUser;
  delete view.reservation;
  if (!professional) {
    delete view.clinicalNotes;
    delete view.voidReason;
  }
  if (!actor.isAdmin) {
    delete view.voidedBy;
    delete view.completedBy;
  }
  if ("employee" in visit) view.employee = projectEmployee(visit.employee, actor);
  if (visit.animal) {
    const { owner, ...animal } = visit.animal;
    view.animal = actor.isAdmin && owner !== undefined ? { ...animal, owner: projectRelatedUser(owner, actor, contactSummary) } : animal;
  }
  return view;
}
