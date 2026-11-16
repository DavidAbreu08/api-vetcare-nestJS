import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { Actor } from "../core/authorization";
import { ClinicalVisitBusinessService } from "./clinical-visit.business.service";
import { CompleteClinicalVisitDto, CreateClinicalVisitDto, ListClinicalVisitsQueryDto, UpdateClinicalVisitDto, VoidClinicalVisitDto } from "./dto/clinical-visit.dto";

/** Application entry points for the clinical-visits resource. */
@Injectable()
export class ClinicalVisitService {
  constructor(private readonly business: ClinicalVisitBusinessService) {}
  list(query: ListClinicalVisitsQueryDto, actor: Actor) { return this.business.list(query, actor); }
  get(id: string, actor: Actor) { return this.business.get(id, actor); }
  start(dto: CreateClinicalVisitDto, actor: Actor) { return this.business.start(dto, actor); }
  update(id: string, dto: UpdateClinicalVisitDto, actor: Actor) { return this.business.update(id, dto, actor); }
  complete(id: string, dto: CompleteClinicalVisitDto, actor: Actor) { return this.business.complete(id, dto, actor); }
  voidVisit(id: string, dto: VoidClinicalVisitDto, actor: Actor) { return this.business.voidVisit(id, dto, actor); }
  withWritableVisit<T>(visitId: string, animalId: string, actor: Actor, work: (manager: EntityManager) => Promise<T>) {
    return this.business.withWritableVisit(visitId, animalId, actor, work);
  }
}
