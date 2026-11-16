import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { MeasurementBusinessService } from "./measurement.business.service";
import { CreateMeasurementDto, ListMeasurementsQueryDto, UpdateMeasurementDto } from "./dto/create-measurement.dto";
/** Application facade delegating observation policies to the business service. */
@Injectable()
export class MeasurementService {
  constructor(private readonly business: MeasurementBusinessService) {}
  list(query: ListMeasurementsQueryDto, actor: Actor) { return this.business.list(query, actor); }
  get(id: string, actor: Actor) { return this.business.get(id, actor); }
  create(dto: CreateMeasurementDto, actor: Actor) { return this.business.create(dto, actor); }
  update(id: string, dto: UpdateMeasurementDto, actor: Actor) { return this.business.update(id, dto, actor); }
  delete(id: string, actor: Actor) { return this.business.delete(id, actor); }
  latestMany(animalIds: string[]) { return this.business.latestMany(animalIds); }
  latest(animalId: string) { return this.business.latest(animalId); }
}
