import { MeasurementService } from "../animal-measurements/measurement.service";
import { BadRequestException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, Repository } from "typeorm";
import { Actor, isStaff, requireAnimalAccess, sameId } from "../core/authorization";
import { SystemRole } from "../core/enums/system-role.enum";
import { RoleMembershipService } from "../roles/role-membership.service";
import { PersistenceService } from "../core/persistence/persistence.service";
import { UsersEntity } from "../users/entities/users.entity";
import { SpeciesService } from "../species/species.service";
import { BreedsService } from "../breeds/breeds.service";
import { SpeciesEntity } from "../species/entities/species.entity";
import { BreedEntity } from "../breeds/entities/breed.entity";
import { AnimalEntity } from "./entities/animal.entity";
import { AnimalRelation } from "./enums/animal-relation.enum";
import { AnimalMessage } from "./animal.messages";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { ListAnimalsQueryDto } from "./dto/list-animals-query.dto";
import { contactSummary, projectRelatedUser } from "../users/user.projection";

/** Owns animal access rules, taxonomy consistency, derived measurements and lifecycle. */
@Injectable()
export class AnimalBusinessService {
  constructor(
    @InjectRepository(AnimalEntity) private readonly animalRepository: Repository<AnimalEntity>,
    @InjectRepository(UsersEntity) private readonly usersRepository: Repository<UsersEntity>,
    private readonly speciesService: SpeciesService,
    private readonly breedsService: BreedsService,
    private readonly persistence: PersistenceService,
    private readonly measurements: MeasurementService,
    private readonly membership: RoleMembershipService,
  ) {}

  private async requireClientOwner(ownerId: string): Promise<UsersEntity> {
    const owner = await this.persistence.execute(() => this.usersRepository.findOneBy({ id: ownerId }));
    if (!owner || !(await this.membership.hasSystemRole(owner.id, SystemRole.CLIENT))) throw new BadRequestException(AnimalMessage.InvalidOwner);
    return owner;
  }

  private async loadAnimal(id: string): Promise<AnimalEntity> {
    const animal = await this.persistence.execute(() => this.animalRepository.findOne({
      where: { id }, relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed],
    }));
    if (!animal) throw new NotFoundException(AnimalMessage.NotFound);
    return animal;
  }

  private requireReadOrWriteAccess(animal: AnimalEntity, actor: Actor): void {
    if (animal.owner) requireAnimalAccess(actor, animal.owner.id);
    else if (!isStaff(actor)) {
      throw new ForbiddenException(AnimalMessage.MissingOwner);
    }
  }

  /** Maps validated HTTP fields to writable entity attributes; never accepts verification state. */
  private mapWritableAttributes(dto: UpdateAnimalDto): Partial<AnimalEntity> {
    for (const value of [dto.name, dto.color, dto.sex, dto.gender, dto.speciesId, dto.ownerId, dto.type]) {
      if (value === null) throw new BadRequestException(AnimalMessage.NullRequiredField);
    }
    if (dto.birthDate && dto.birthDate > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException(AnimalMessage.FutureBirthDate);
    }
    if (dto.sex !== undefined && dto.gender !== undefined && dto.sex !== dto.gender) {
      throw new BadRequestException(AnimalMessage.SexAliasConflict);
    }
    if (dto.imageUrl !== undefined && dto.image !== undefined && dto.imageUrl !== dto.image) {
      throw new BadRequestException(AnimalMessage.ImageAliasConflict);
    }
    const attributes: Partial<AnimalEntity> = {};
    if (dto.name !== undefined) attributes.name = dto.name;
    if (dto.color !== undefined) attributes.color = dto.color;
    if (dto.notes !== undefined) attributes.notes = dto.notes;
    if (dto.description !== undefined) attributes.description = dto.description;
    if (dto.birthDate !== undefined) attributes.birthDate = dto.birthDate;
    if (dto.microchipNumber !== undefined) attributes.microchipNumber = dto.microchipNumber;
    if (dto.isNeutered !== undefined) attributes.isNeutered = dto.isNeutered;
    if (dto.sex !== undefined || dto.gender !== undefined) attributes.sex = dto.sex ?? dto.gender;
    if (dto.imageUrl !== undefined || dto.image !== undefined) attributes.imageUrl = dto.imageUrl !== undefined ? dto.imageUrl : dto.image;
    return attributes;
  }

  /** Database lookups apply the same collation rules used by the migration and UNIQUE constraints. */
  private async resolveAnimalTaxonomy(speciesId?: string, breedId?: string | null, type?: string, breedName?: string) {
    if (speciesId === null || type === null || breedName === null) throw new BadRequestException(AnimalMessage.NullTaxonomyLabel);
    let species: SpeciesEntity | null = null;
    try {
      species = speciesId ? await this.speciesService.getById(speciesId) : type?.trim() ? await this.speciesService.findByName(type) : null;
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    if (!species) throw new BadRequestException(AnimalMessage.InvalidSpecies);
    if (type !== undefined && (await this.speciesService.findByName(type))?.id !== species.id) {
      throw new BadRequestException(AnimalMessage.SpeciesAliasConflict);
    }
    let breed: BreedEntity | null = null;
    try {
      breed = breedId ? await this.breedsService.getById(breedId) : breedName?.trim() ? await this.breedsService.findByName(species.id, breedName) : null;
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    if ((breedId || breedName?.trim()) && !breed) throw new BadRequestException(AnimalMessage.InvalidBreed);
    if (breed && breed.speciesId !== species.id) throw new BadRequestException(AnimalMessage.BreedSpeciesMismatch);
    if (breed && breedName !== undefined && (await this.breedsService.findByName(species.id, breedName))?.id !== breed.id) {
      throw new BadRequestException(AnimalMessage.BreedAliasConflict);
    }
    if (breedId === null && breedName?.trim()) throw new BadRequestException(AnimalMessage.BreedAliasConflict);
    return { species, speciesId: species.id, breed, breedId: breed?.id ?? null };
  }

  private calculateAgeFromBirthDate(birthDate: string): number {
    const today = new Date().toISOString().slice(0, 10);
    return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
  }

  /**
   * Exposes catalog aliases and independently derived dimensions without storing snapshots. The owner is
   * the full account (no password hash) for administrators and { id, name, email, phone } otherwise.
   */
  private async serializeAnimal(animal: AnimalEntity, actor: Actor, latest?: Awaited<ReturnType<MeasurementService["latest"]>>) {
    return {
      ...animal, owner: projectRelatedUser(animal.owner, actor, contactSummary),
      ...(latest ?? await this.measurements.latest(animal.id)), breedDetails: animal.breed, breed: animal.breed?.name ?? null,
      type: animal.species?.name ?? null,
      age: animal.birthDate ? this.calculateAgeFromBirthDate(animal.birthDate) : null,
      gender: animal.sex, image: animal.imageUrl, confirmed: animal.isVerified,
    };
  }

  /** Bound SQL observation reads even on compatibility collections without pagination. */
  private async serializeAnimals(animals: AnimalEntity[], actor: Actor) {
    const latest = await this.measurements.latestMany(animals.map(animal => animal.id));
    return Promise.all(animals.map(animal => this.serializeAnimal(animal, actor, latest.get(animal.id))));
  }

  async getAll(query: ListAnimalsQueryDto, actor: Actor) {
    const where: FindOptionsWhere<AnimalEntity> = {};
    if (!isStaff(actor)) {
      if (query.ownerId) requireAnimalAccess(actor, query.ownerId);
      where.owner = { id: actor.id };
    } else if (query.ownerId) where.owner = { id: query.ownerId };
    if (query.speciesId) where.speciesId = query.speciesId;
    const animals = await this.persistence.execute(() => this.animalRepository.find({
      where, skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" },
      relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed],
    }));
    return this.serializeAnimals(animals, actor);
  }

  async getById(id: string, actor: Actor) {
    const animal = await this.loadAnimal(id);
    this.requireReadOrWriteAccess(animal, actor);
    return this.serializeAnimal(animal, actor);
  }

  async create(dto: CreateAnimalDto, actor: Actor) {
    const attributes = this.mapWritableAttributes(dto);
    requireAnimalAccess(actor, dto.ownerId);
    const owner = await this.requireClientOwner(dto.ownerId);
    const taxonomy = await this.resolveAnimalTaxonomy(dto.speciesId, dto.breedId, dto.type, dto.breed);
    const animal = this.animalRepository.create({
      ...attributes, ...taxonomy, owner,
      // Staff registering a client's animal verify it; their own animals (as clients) follow the client path.
      isVerified: actor.isAdmin || (isStaff(actor) && !sameId(actor.id, owner.id)),
    });
    return this.serializeAnimal(await this.persistence.execute(() => this.animalRepository.save(animal)), actor);
  }

  async update(id: string, dto: UpdateAnimalDto, actor: Actor) {
    const attributes = this.mapWritableAttributes(dto);
    const animal = await this.loadAnimal(id);
    this.requireReadOrWriteAccess(animal, actor);
    if (dto.ownerId !== undefined) {
      requireAnimalAccess(actor, dto.ownerId);
      animal.owner = await this.requireClientOwner(dto.ownerId);
    }
    if (dto.speciesId !== undefined || dto.type !== undefined || dto.breedId !== undefined || dto.breed !== undefined) {
      const speciesId = dto.speciesId ?? (dto.type !== undefined ? undefined : animal.speciesId);
      const breedId = dto.breedId !== undefined ? dto.breedId : dto.breed !== undefined ? undefined : animal.breedId;
      Object.assign(animal, await this.resolveAnimalTaxonomy(speciesId, breedId, dto.type, dto.breed));
    }
    Object.assign(animal, attributes);
    return this.serializeAnimal(await this.persistence.execute(() => this.animalRepository.save(animal)), actor);
  }

  async confirm(id: string, actor: Actor) {
    const animal = await this.loadAnimal(id);
    animal.isVerified = true;
    return this.serializeAnimal(await this.persistence.execute(() => this.animalRepository.save(animal)), actor);
  }

  async findAll(actor: Actor) {
    const animals = await this.persistence.execute(() => this.animalRepository.find({
      relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed],
    }));
    return this.serializeAnimals(animals, actor);
  }

  async findByOwner(ownerId: string, actor: Actor) {
    requireAnimalAccess(actor, ownerId);
    await this.requireClientOwner(ownerId);
    const animals = await this.persistence.execute(() => this.animalRepository.find({
      where: { owner: { id: ownerId } },
      relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed],
    }));
    return this.serializeAnimals(animals, actor);
  }

  async delete(id: string) {
    const animal = await this.loadAnimal(id);
    await this.persistence.execute(() => this.animalRepository.softRemove(animal));
    return { statusCode: HttpStatus.OK, message: AnimalMessage.Deleted };
  }
}