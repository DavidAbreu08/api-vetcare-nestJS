import { Injectable } from "@nestjs/common";
import { SpeciesBusinessService } from "./species.business.service";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { CreateSpeciesDto, UpdateSpeciesDto } from "./dto/create-species.dto";

/** Application entry points for the species resource. */
@Injectable()
export class SpeciesService {
  constructor(private readonly business: SpeciesBusinessService) {}
  getAll(query: ListQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  findByName(name: string) { return this.business.findByName(name); }
  create(dto: CreateSpeciesDto) { return this.business.create(dto); }
  update(id: string, dto: UpdateSpeciesDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
