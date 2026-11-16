import { MeasurementService } from "../animal-measurements/measurement.service";
import { projectMeasurements } from "../animal-measurements/measurement.projection";
import { BadRequestException, ConflictException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, FindOptionsWhere, Repository } from "typeorm";
import { ClinicalVisitEntity } from "../clinical-visits/entities/clinical-visit.entity";
import { ClinicalVisitStatus } from "../clinical-visits/enums/clinical-visit-status.enum";
import { findOpenReservations } from "../reservation/open-reservations";
import { EmployeeQualificationService } from "../employees/employee-qualification.service";
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
import { ConfirmAnimalDto } from "./dto/confirm-animal.dto";
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
    private readonly dataSource: DataSource,
    private readonly qualifications: EmployeeQualificationService,
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

  /**
   * Locks the animal row (UPDLOCK, no joins) and then reads it with its relations in the same transaction. update
   * and confirm lock only this row, so they serialize with each other and with reservations, visits and deletion
   * (lock order reservation -> animal -> ...) without forming a cycle.
   */
  private async lockAnimal(manager: EntityManager, id: string): Promise<AnimalEntity> {
    const locked = await manager.findOne(AnimalEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
    if (!locked) throw new NotFoundException(AnimalMessage.NotFound);
    const animal = await manager.findOne(AnimalEntity, {
      where: { id }, relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed],
    });
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
   * latestMeasurements hide updatedBy from clients (projectMeasurement).
   */
  private async serializeAnimal(animal: AnimalEntity, actor: Actor, latest?: Awaited<ReturnType<MeasurementService["latest"]>>) {
    const measurements = latest ?? await this.measurements.latest(animal.id);
    return {
      ...animal, owner: projectRelatedUser(animal.owner, actor, contactSummary),
      ...measurements, latestMeasurements: projectMeasurements(measurements.latestMeasurements, actor), breedDetails: animal.breed, breed: animal.breed?.name ?? null,
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
      // Same approval rule as update/confirm: only an administrator or a veterinarian (not for their own animal)
      // registers it verified; anyone else (client, receptionist) leaves it pending approval.
      isVerified: await this.canApprove(actor, owner.id),
    });
    return this.serializeAnimal(await this.persistence.execute(() => this.animalRepository.save(animal)), actor);
  }

  /**
   * Whether the actor may approve an animal's data (verification) or change its species/breed with immediate
   * effect: an administrator, or a veterinarian (active employee holding the job title of the
   * VETERINARIAN_JOB_TITLE_ID setting; none when unset) acting on another client's animal. Staff acting on their own animal follow the client path, as on creation.
   */
  private async canApprove(actor: Actor, ownerId: string | null | undefined, manager?: EntityManager): Promise<boolean> {
    if (actor.isAdmin) return true;
    if (ownerId && sameId(ownerId, actor.id)) return false;
    return this.qualifications.isVeterinarian(actor, manager);
  }

  /**
   * The owner (and any staff with write access) may change species and breed; sending the current values is not a
   * change. A change by an administrator or a veterinarian is approved at once (isVerified=true); a change by
   * anyone else (client, non-veterinarian employee) leaves the animal unverified until an administrator or a
   * veterinarian approves it through PUT /api/animal/confirm/:id.
   */
  async update(id: string, dto: UpdateAnimalDto, actor: Actor) {
    const attributes = this.mapWritableAttributes(dto);
    const saved = await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const animal = await this.lockAnimal(manager, id);
      this.requireReadOrWriteAccess(animal, actor);
      const previous = { speciesId: animal.speciesId, breedId: animal.breedId };
      if (dto.ownerId !== undefined) {
        requireAnimalAccess(actor, dto.ownerId);
        animal.owner = await this.requireClientOwner(dto.ownerId);
      }
      if (dto.speciesId !== undefined || dto.type !== undefined || dto.breedId !== undefined || dto.breed !== undefined) {
        const speciesId = dto.speciesId ?? (dto.type !== undefined ? undefined : animal.speciesId);
        const breedId = dto.breedId !== undefined ? dto.breedId : dto.breed !== undefined ? undefined : animal.breedId;
        Object.assign(animal, await this.resolveAnimalTaxonomy(speciesId, breedId, dto.type, dto.breed));
      }
      if (!sameOptionalId(previous.speciesId, animal.speciesId) || !sameOptionalId(previous.breedId, animal.breedId)) {
        animal.isVerified = await this.canApprove(actor, animal.owner?.id, manager);
      }
      Object.assign(animal, attributes);
      return manager.save(animal);
    }));
    return this.serializeAnimal(saved, actor);
  }

  /**
   * Approval (isVerified=true) by an administrator or a veterinarian (not of their own animal); 403 otherwise. The
   * animal row is locked, so a concurrent species/breed change either commits first (and is what gets approved) or
   * waits and then leaves the animal unverified again. Optional expectedSpeciesId/expectedBreedId (the values the
   * approver reviewed) make the approval conditional: 409 ANIMAL_DATA_CHANGED when the stored values differ.
   */
  async confirm(id: string, actor: Actor, dto: ConfirmAnimalDto = {}) {
    const saved = await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const animal = await this.lockAnimal(manager, id);
      if (!(await this.canApprove(actor, animal.owner?.id, manager))) throw new ForbiddenException(AnimalMessage.VerificationForbidden);
      if ((dto.expectedSpeciesId !== undefined && !sameId(dto.expectedSpeciesId, animal.speciesId))
        || (dto.expectedBreedId !== undefined && !sameOptionalId(dto.expectedBreedId, animal.breedId))) {
        throw new ConflictException({
          statusCode: 409, code: "ANIMAL_DATA_CHANGED", message: AnimalMessage.DataChanged,
          speciesId: animal.speciesId, breedId: animal.breedId,
        });
      }
      animal.isVerified = true;
      return manager.save(animal);
    }));
    return this.serializeAnimal(saved, actor);
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

  /**
   * Soft delete, refused (409 with the ids) while the animal has PENDING/CONFIRMED reservations not yet finished
   * or an IN_PROGRESS clinical visit. The animal row is locked (UPDLOCK) before those reads; reservation creation,
   * confirmation, reschedule and visit start lock the same row (lock order reservation -> animal -> visit), so
   * none of them can slip in before the deletion commits.
   */
  async delete(id: string) {
    await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const animal = await manager.findOne(AnimalEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!animal) throw new NotFoundException(AnimalMessage.NotFound);
      const reservations = await findOpenReservations(manager, { animalId: animal.id });
      const visits = await manager.find(ClinicalVisitEntity, {
        select: { id: true }, where: { animalId: animal.id, status: ClinicalVisitStatus.IN_PROGRESS }, order: { startedAt: "ASC" },
      });
      if (reservations.length || visits.length) {
        throw new ConflictException({
          statusCode: 409, code: "ANIMAL_HAS_OPEN_ACTIVITY", message: AnimalMessage.OpenActivity,
          reservationIds: reservations.map(reservation => reservation.id), clinicalVisitIds: visits.map(visit => visit.id),
        });
      }
      await manager.softDelete(AnimalEntity, { id: animal.id });
    }));
    return { statusCode: HttpStatus.OK, message: AnimalMessage.Deleted };
  }
}

/** Case-insensitive id equality where two nulls are equal (optional breed). */
function sameOptionalId(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null) || sameId(a, b);
}
