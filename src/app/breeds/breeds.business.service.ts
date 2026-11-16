import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BreedEntity } from "./entities/breed.entity";
import { SpeciesService } from "../species/species.service";
import { PersistenceService } from "../core/persistence/persistence.service";
import { CreateBreedDto, ListBreedsQueryDto, UpdateBreedDto } from "./dto/create-breed.dto";
import { BreedsMessage } from "./breeds.messages";

export enum BreedRelation { Species = "species" }

/** Validates breed identity, ownership by species and catalog mutations. */
@Injectable()
export class BreedsBusinessService {
  constructor(
    @InjectRepository(BreedEntity) private readonly repository: Repository<BreedEntity>,
    private readonly speciesService: SpeciesService,
    private readonly persistence: PersistenceService,
  ) {}

  getAll(query: ListBreedsQueryDto) {
    return this.persistence.execute(() => this.repository.find({
      where: query.speciesId ? { speciesId: query.speciesId } : {},
      relations: [BreedRelation.Species],
      skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" },
    }));
  }

  findByName(speciesId: string, name: string) {
    return this.persistence.execute(() => this.repository.findOneBy({ speciesId, name: name.trim() }));
  }

  async getById(id: string) {
    const breed = await this.persistence.execute(() => this.repository.findOne({ where: { id }, relations: [BreedRelation.Species] }));
    if (!breed) throw applicationError(ErrorMetadata.NOT_FOUND, BreedsMessage.NotFound);
    return breed;
  }

  private validateName(name: string) {
    if (typeof name !== "string" || !name.trim()) throw applicationError(ErrorMetadata.INVALID_VALUE, BreedsMessage.InvalidName);
    return name.trim();
  }

  async create(dto: CreateBreedDto) {
    try { await this.speciesService.getById(dto.speciesId); }
    catch (error) {
      if (error instanceof NotFoundException) throw applicationError(ErrorMetadata.INVALID_VALUE, BreedsMessage.InvalidSpecies);
      throw error;
    }
    const breed = this.repository.create({ speciesId: dto.speciesId, name: this.validateName(dto.name), description: dto.description, notes: dto.notes });
    return this.persistence.execute(() => this.repository.save(breed));
  }

  async update(id: string, dto: UpdateBreedDto) {
    const breed = await this.getById(id);
    if (dto.name !== undefined) breed.name = this.validateName(dto.name);
    if (dto.description !== undefined) breed.description = dto.description;
    if (dto.notes !== undefined) breed.notes = dto.notes;
    return this.persistence.execute(() => this.repository.save(breed));
  }

  async delete(id: string) {
    const breed = await this.getById(id);
    await this.persistence.execute(() => this.repository.remove(breed));
  }
}
