import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SpeciesEntity } from "./entities/species.entity";
import { BreedEntity } from "./entities/breed.entity";

@Injectable()
export class TaxonomyService {
  constructor(
    @InjectRepository(SpeciesEntity) private readonly speciesRepo: Repository<SpeciesEntity>,
    @InjectRepository(BreedEntity) private readonly breedRepo: Repository<BreedEntity>,
  ) {}

  private name(value: string) {
    if (typeof value !== "string" || !value.trim()) throw new BadRequestException("Name must not be empty");
    return value.trim();
  }
  listSpecies() { return this.speciesRepo.find({ order: { name: "ASC" } }); }
  listBreeds(speciesId?: string) {
    return this.breedRepo.find({ where: speciesId ? { speciesId } : {}, relations: ["species"], order: { name: "ASC" } });
  }
  private async save<T>(repo: Repository<any>, entity: T): Promise<T> {
    try { return await repo.save(entity); }
    catch (error) {
      if ([2601, 2627].includes(error?.driverError?.number ?? error?.number)) throw new ConflictException("This name already exists in the catalog");
      throw error;
    }
  }
  async species(id: string) {
    const species = await this.speciesRepo.findOneBy({ id });
    if (!species) throw new BadRequestException("Unknown species");
    return species;
  }
  async createSpecies(name: string) {
    return this.save(this.speciesRepo, this.speciesRepo.create({ name: this.name(name) }));
  }
  async updateSpecies(id: string, name?: string) {
    const species = await this.species(id);
    if (name !== undefined) species.name = this.name(name);
    return this.save(this.speciesRepo, species);
  }
  async createBreed(speciesId: string, name: string) {
    await this.species(speciesId);
    return this.save(this.breedRepo, this.breedRepo.create({ speciesId, name: this.name(name) }));
  }
  async updateBreed(id: string, name?: string) {
    const breed = await this.breedRepo.findOneBy({ id });
    if (!breed) throw new NotFoundException("Breed not found");
    if (name !== undefined) breed.name = this.name(name);
    return this.save(this.breedRepo, breed);
  }
  async resolve(speciesId?: string, breedId?: string | null, type?: string, breedName?: string) {
    if (speciesId === null || type === null || breedName === null) throw new BadRequestException("Taxonomy identifiers and legacy labels cannot be null; use breedId:null to clear a breed");
    const species = speciesId ? await this.species(speciesId) :
      type?.trim() ? await this.speciesRepo.findOneBy({ name: type.trim() }) : null;
    if (!species) throw new BadRequestException("Provide a valid speciesId (legacy type must match an existing species)");
    if (type !== undefined && (await this.speciesRepo.findOneBy({ name: type.trim() }))?.id !== species.id) {
      throw new BadRequestException("type conflicts with speciesId");
    }
    let breed: BreedEntity | null = null;
    if (breedId) breed = await this.breedRepo.findOneBy({ id: breedId });
    else if (breedName?.trim()) breed = await this.breedRepo.findOneBy({ speciesId: species.id, name: breedName.trim() });
    if ((breedId || breedName?.trim()) && !breed) throw new BadRequestException("Unknown breed");
    if (breed && breed.speciesId !== species.id) throw new BadRequestException("Breed does not belong to this species");
    if (breed && breedName !== undefined && (await this.breedRepo.findOneBy({ speciesId: species.id, name: breedName.trim() }))?.id !== breed.id) {
      throw new BadRequestException("breed conflicts with breedId");
    }
    if (breedId === null && breedName?.trim()) throw new BadRequestException("breed conflicts with breedId");
    return { species, speciesId: species.id, breed, breedId: breed?.id ?? null };
  }
}
