import { Injectable } from "@nestjs/common";
import { MeasurementTypeBusinessService } from "./measurement-type.business.service";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { CreateMeasurementTypeDto, UpdateMeasurementTypeDto } from "./dto/create-measurement-type.dto";

/** Application entry points for the measurement-types resource. */
@Injectable()
export class MeasurementTypeService {
  constructor(private readonly business: MeasurementTypeBusinessService) {}
  getAll(query: ListQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  requireActive(id: string) { return this.business.requireActive(id); }
  create(dto: CreateMeasurementTypeDto) { return this.business.create(dto); }
  update(id: string, dto: UpdateMeasurementTypeDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
