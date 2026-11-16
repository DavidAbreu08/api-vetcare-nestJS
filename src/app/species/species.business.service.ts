import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SpeciesEntity } from "./entities/species.entity";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { CreateSpeciesDto, UpdateSpeciesDto } from "./dto/create-species.dto";
import { SpeciesMessage } from "./species.messages";

/** Owns catalog validation and repository operations for species. */
@Injectable()
export class SpeciesBusinessService {
  constructor(
    @InjectRepository(SpeciesEntity) private readonly repository: Repository<SpeciesEntity>,
    private readonly persistence: PersistenceService,
  ) {}

  getAll(query: ListQueryDto) {
    return this.persistence.execute(() => this.repository.find({ skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" } }));
  }

  findByName(name: string) {
    return this.persistence.execute(() => this.repository.findOneBy({ name: name.trim() }));
  }

  async getById(id: string) {
    const species = await this.persistence.execute(() => this.repository.findOneBy({ id }));
    if (!species) throw applicationError(ErrorMetadata.NOT_FOUND, SpeciesMessage.NotFound);
    return species;
  }

  private validateName(name: string) {
    if (typeof name !== "string" || !name.trim()) throw applicationError(ErrorMetadata.INVALID_VALUE, SpeciesMessage.InvalidName);
    return name.trim();
  }

  create(dto: CreateSpeciesDto) {
    const species = this.repository.create({ name: this.validateName(dto.name), description: dto.description, notes: dto.notes });
    return this.persistence.execute(() => this.repository.save(species));
  }

  async update(id: string, dto: UpdateSpeciesDto) {
    const species = await this.getById(id);
    if (dto.name !== undefined) species.name = this.validateName(dto.name);
    if (dto.description !== undefined) species.description = dto.description;
    if (dto.notes !== undefined) species.notes = dto.notes;
    return this.persistence.execute(() => this.repository.save(species));
  }

  async delete(id: string) {
    const species = await this.getById(id);
    await this.persistence.execute(() => this.repository.remove(species));
  }
}
