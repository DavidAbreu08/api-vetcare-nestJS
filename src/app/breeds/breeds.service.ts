import { Injectable } from "@nestjs/common";
import { BreedsBusinessService } from "./breeds.business.service";
import { CreateBreedDto, ListBreedsQueryDto, UpdateBreedDto } from "./dto/create-breed.dto";

@Injectable()
export class BreedsService {
  constructor(private readonly business: BreedsBusinessService) {}
  getAll(query: ListBreedsQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  findByName(speciesId: string, name: string) { return this.business.findByName(speciesId, name); }
  create(dto: CreateBreedDto) { return this.business.create(dto); }
  update(id: string, dto: UpdateBreedDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
