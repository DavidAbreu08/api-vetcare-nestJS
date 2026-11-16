import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { MeasurementService } from "../animal-measurements/measurement.service";
import { projectMeasurements } from "../animal-measurements/measurement.projection";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
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
import { activeTutorExists, AnimalAccessService } from "../animal-owners/animal-access.service";
import { AnimalOwnersBusinessService, serializeTutor } from "../animal-owners/animal-owners.business.service";
import { AnimalOwnerEntity } from "../animal-owners/entities/animal-owner.entity";

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
    private readonly access: AnimalAccessService,
    private readonly owners: AnimalOwnersBusinessService,
  ) {}

  /**
   * Account holding CLIENT (400 otherwise). A new tutor (creation) must also be active (requireActive); listing the
   * animals of an inactive client stays possible.
   */
  private async requireClientOwner(ownerId: string, requireActive = false): Promise<UsersEntity> {
    const owner = await this.persistence.execute(() => this.usersRepository.findOneBy({ id: ownerId }));
    if (!owner || (requireActive && !owner.isActive) || !(await this.membership.hasSystemRole(owner.id, SystemRole.CLIENT))) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.InvalidOwner);
    }
    return owner;
  }

  private async loadAnimal(id: string): Promise<AnimalEntity> {
    const animal = await this.persistence.execute(() => this.animalRepository.findOne({
      where: { id }, relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed] }));
    if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalMessage.NotFound);
    return animal;
  }

  /**
   * Locks the animal row (UPDLOCK, no joins) and then reads it with its relations in the same transaction. update
   * and confirm lock only this row, so they serialize with each other and with reservations, visits and deletion
   * (lock order reservation -> animal -> ...) without forming a cycle.
   */
  private async lockAnimal(manager: EntityManager, id: string): Promise<AnimalEntity> {
    const locked = await manager.findOne(AnimalEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
    if (!locked) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalMessage.NotFound);
    const animal = await manager.findOne(AnimalEntity, {
      where: { id }, relations: [AnimalRelation.Owner, AnimalRelation.Species, AnimalRelation.Breed] });
    if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalMessage.NotFound);
    return animal;
  }

  /** Staff, or an active tutor (primary or secondary) of the animal; former tutors lose access. */
  private async requireReadAccess(animal: AnimalEntity, actor: Actor): Promise<void> {
    if (!(await this.access.canReadAnimal(actor, animal.id))) throw applicationError(ErrorMetadata.FORBIDDEN, AnimalMessage.AccessDenied);
  }

  /** Staff or the active primary tutor; secondary tutors only read. Run after locking the animal row. */
  private async requireWriteAccess(manager: EntityManager, animal: AnimalEntity, actor: Actor): Promise<void> {
    if (!(await this.access.canManageAnimal(actor, animal.id, manager))) throw applicationError(ErrorMetadata.FORBIDDEN, AnimalMessage.EditForbidden);
  }

  /** Maps validated HTTP fields to writable entity attributes; never accepts verification state. */
  private mapWritableAttributes(dto: UpdateAnimalDto): Partial<AnimalEntity> {
    for (const value of [dto.name, dto.color, dto.sex, dto.gender, dto.speciesId, dto.ownerId, dto.type]) {
      if (value === null) throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.NullRequiredField);
    }
    if (dto.birthDate && dto.birthDate > new Date().toISOString().slice(0, 10)) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.FutureBirthDate);
    }
    if (dto.sex !== undefined && dto.gender !== undefined && dto.sex !== dto.gender) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.SexAliasConflict);
    }
    if (dto.imageUrl !== undefined && dto.image !== undefined && dto.imageUrl !== dto.image) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.ImageAliasConflict);
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
    if (speciesId === null || type === null || breedName === null) throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.NullTaxonomyLabel);
    let species: SpeciesEntity | null = null;
    try {
      species = speciesId ? await this.speciesService.getById(speciesId) : type?.trim() ? await this.speciesService.findByName(type) : null;
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    if (!species) throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.InvalidSpecies);
    if (type !== undefined && (await this.speciesService.findByName(type))?.id !== species.id) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.SpeciesAliasConflict);
    }
    let breed: BreedEntity | null = null;
    try {
      breed = breedId ? await this.breedsService.getById(breedId) : breedName?.trim() ? await this.breedsService.findByName(species.id, breedName) : null;
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    if ((breedId || breedName?.trim()) && !breed) throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.InvalidBreed);
    if (breed && breed.speciesId !== species.id) throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.BreedSpeciesMismatch);
    if (breed && breedName !== undefined && (await this.breedsService.findByName(species.id, breedName))?.id !== breed.id) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.BreedAliasConflict);
    }
    if (breedId === null && breedName?.trim()) throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalMessage.BreedAliasConflict);
    return { species, speciesId: species.id, breed, breedId: breed?.id ?? null };
  }

  private calculateAgeFromBirthDate(birthDate: string): number {
    const today = new Date().toISOString().slice(0, 10);
    return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
  }

  /**
   * Exposes catalog aliases and independently derived dimensions without storing snapshots. The owner (the active
   * primary tutor, vc_animals.owner_id) is the full account (no password hash) for administrators and
   * { id, name, email, phone } otherwise; `tutors` lists every active tutor { user, isPrimary, assignedAt }, primary
   * first, with the same projection. latestMeasurements hide updatedBy from clients (projectMeasurement).
   */
  private async serializeAnimal(animal: AnimalEntity, actor: Actor, latest?: Awaited<ReturnType<MeasurementService["latest"]>>, tutors?: AnimalOwnerEntity[]) {
    const measurements = latest ?? await this.measurements.latest(animal.id);
    const active = tutors ?? (await this.access.activeTutorsOf([animal.id])).get(animal.id.toLowerCase()) ?? [];
    return {
      ...animal, owner: projectRelatedUser(animal.owner, actor, contactSummary), tutors: active.map(row => serializeTutor(row, actor)),
      ...measurements, latestMeasurements: projectMeasurements(measurements.latestMeasurements, actor), breedDetails: animal.breed, breed: animal.breed?.name ?? null,
      type: animal.species?.name ?? null,
      age: animal.birthDate ? this.calculateAgeFromBirthDate(animal.birthDate) : null,
      gender: animal.sex, image: animal.imageUrl, confirmed: animal.isVerified,
    };
  }

  /** Bound SQL observation reads even on compatibility collections without pagination. */
  private async serializeAnimals(animals: AnimalEntity[], actor: Actor) {
    const ids = animals.map(animal => animal.id);
    const [latest, tutors] = await Promise.all([this.measurements.latestMany(ids), this.access.activeTutorsOf(ids)]);
    return Promise.all(animals.map(animal => this.serializeAnimal(animal, actor, latest.get(animal.id), tutors.get(animal.id.toLowerCase()) ?? [])));
  }

  /** Animals with owner, species and breed; `tutorId` keeps those of which the account is an active tutor (EXISTS). */
  private animalsQuery(tutorId?: string) {
    const builder = this.animalRepository.createQueryBuilder("animal")
      .leftJoinAndSelect("animal.owner", "owner")
      .leftJoinAndSelect("animal.species", "species")
      .leftJoinAndSelect("animal.breed", "breed");
    if (tutorId) builder.andWhere(activeTutorExists("animal.id", "tutorId"), { tutorId });
    return builder;
  }

  /**
   * Staff list every animal (ownerId = animals of which that account is an active tutor, primary or secondary);
   * everyone else only the animals of which they are an active tutor (ownerId other than themselves: 403).
   */
  async getAll(query: ListAnimalsQueryDto, actor: Actor) {
    if (!isStaff(actor) && query.ownerId) requireAnimalAccess(actor, query.ownerId);
    const builder = this.animalsQuery(isStaff(actor) ? query.ownerId : actor.id);
    if (query.speciesId) builder.andWhere("animal.speciesId = :speciesId", { speciesId: query.speciesId });
    const animals = await this.persistence.execute(() => builder
      .orderBy("animal.name", "ASC").addOrderBy("animal.id", "ASC").skip(query.skip).take(query.take).getMany());
    return this.serializeAnimals(animals, actor);
  }

  async getById(id: string, actor: Actor) {
    const animal = await this.loadAnimal(id);
    await this.requireReadAccess(animal, actor);
    return this.serializeAnimal(animal, actor);
  }

  /**
   * Creates the animal and its first primary tutorship (vc_animal_owners) in one transaction. The owner must be an
   * active client account (400); clients register only their own animals. The new animal row is written first (no
   * other transaction can be waiting on it), then the owner's account is locked before the tutorship row, as in every
   * tutorship write (animal -> account -> vc_animal_owners).
   */
  async create(dto: CreateAnimalDto, actor: Actor) {
    const attributes = this.mapWritableAttributes(dto);
    requireAnimalAccess(actor, dto.ownerId);
    const owner = await this.requireClientOwner(dto.ownerId, true);
    const taxonomy = await this.resolveAnimalTaxonomy(dto.speciesId, dto.breedId, dto.type, dto.breed);
    const animal = this.animalRepository.create({
      ...attributes, ...taxonomy, owner,
      // Same approval rule as update/confirm: only an administrator or a veterinarian (not for their own animal)
      // registers it verified; anyone else (client, receptionist) leaves it pending approval.
      isVerified: await this.canApprove(actor, sameId(owner.id, actor.id)) });
    const saved = await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const created = await manager.save(animal);
      await this.owners.lockTutorAccount(manager, owner.id);
      await this.owners.openInitialPrimary(manager, created.id, owner.id, actor.id);
      return created;
    }));
    return this.serializeAnimal(saved, actor);
  }

  /**
   * Whether the actor may approve an animal's data (verification) or change its species/breed with immediate
   * effect: an administrator, or a veterinarian (active employee holding the job title of the
   * VETERINARIAN_JOB_TITLE_ID setting; none when unset) acting on another client's animal. Staff who are an active
   * tutor (primary or secondary) of the animal follow the client path, as on creation.
   */
  private async canApprove(actor: Actor, isTutor: boolean, manager?: EntityManager): Promise<boolean> {
    if (actor.isAdmin) return true;
    if (isTutor) return false;
    return this.qualifications.isVeterinarian(actor, manager);
  }

  /**
   * Staff and the active primary tutor edit the animal (secondary tutors: 403). The primary tutor (and any staff)
   * may change species and breed; sending the current values is not a change. A change by an administrator or a
   * veterinarian is approved at once (isVerified=true); a change by anyone else (client, non-veterinarian employee)
   * leaves the animal unverified until an administrator or a veterinarian approves it through PUT /api/vetcare/animal/confirm/:id.
   *
   * ownerId no longer overwrites owner_id: sending the current primary tutor is accepted as a no-op (clients that
   * send the whole object keep working); a different ownerId is a primary-tutor transfer, allowed only to
   * administrators (403 otherwise) and done in this transaction by AnimalOwnersBusinessService.transferLocked (history
   * kept, owner_id synchronized). Here it never moves reservations: when the previous primary tutor is the client of
   * open reservations of the animal the update fails with 409 TUTOR_HAS_OPEN_RESERVATIONS; use
   * POST /api/vetcare/animal/:id/transfer with transferFutureReservations.
   */
  async update(id: string, dto: UpdateAnimalDto, actor: Actor) {
    const attributes = this.mapWritableAttributes(dto);
    const saved = await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const animal = await this.lockAnimal(manager, id);
      await this.requireWriteAccess(manager, animal, actor);
      const previous = { speciesId: animal.speciesId, breedId: animal.breedId };
      if (dto.ownerId !== undefined && !sameId(dto.ownerId, animal.owner?.id)) {
        if (!actor.isAdmin) throw applicationError(ErrorMetadata.FORBIDDEN, AnimalMessage.OwnerChangeForbidden);
        animal.owner = await this.owners.transferLocked(manager, animal.id, { newPrimaryUserId: dto.ownerId }, actor);
      }
      if (dto.speciesId !== undefined || dto.type !== undefined || dto.breedId !== undefined || dto.breed !== undefined) {
        const speciesId = dto.speciesId ?? (dto.type !== undefined ? undefined : animal.speciesId);
        const breedId = dto.breedId !== undefined ? dto.breedId : dto.breed !== undefined ? undefined : animal.breedId;
        Object.assign(animal, await this.resolveAnimalTaxonomy(speciesId, breedId, dto.type, dto.breed));
      }
      if (!sameOptionalId(previous.speciesId, animal.speciesId) || !sameOptionalId(previous.breedId, animal.breedId)) {
        animal.isVerified = await this.canApprove(actor, await this.access.isActiveTutor(animal.id, actor.id, manager), manager);
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
      if (!(await this.canApprove(actor, await this.access.isActiveTutor(animal.id, actor.id, manager), manager))) {
        throw applicationError(ErrorMetadata.FORBIDDEN, AnimalMessage.VerificationForbidden);
      }
      if ((dto.expectedSpeciesId !== undefined && !sameId(dto.expectedSpeciesId, animal.speciesId))
        || (dto.expectedBreedId !== undefined && !sameOptionalId(dto.expectedBreedId, animal.breedId))) {
        throw applicationError(ErrorMetadata.CONFLICT, AnimalMessage.DataChanged, undefined, {
          code: "ANIMAL_DATA_CHANGED", speciesId: animal.speciesId, breedId: animal.breedId });
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

  /** Animals of which the account is an active tutor (primary or secondary); the account itself or staff. */
  async findByOwner(ownerId: string, actor: Actor) {
    requireAnimalAccess(actor, ownerId);
    await this.requireClientOwner(ownerId);
    const animals = await this.persistence.execute(() => this.animalsQuery(ownerId)
      .orderBy("animal.name", "ASC").addOrderBy("animal.id", "ASC").getMany());
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
      if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalMessage.NotFound);
      const reservations = await findOpenReservations(manager, { animalId: animal.id });
      const visits = await manager.find(ClinicalVisitEntity, {
        select: { id: true }, where: { animalId: animal.id, status: ClinicalVisitStatus.IN_PROGRESS }, order: { startedAt: "ASC" },
      });
      if (reservations.length || visits.length) {
        throw applicationError(ErrorMetadata.IN_USE, AnimalMessage.OpenActivity, undefined, {
          code: "ANIMAL_HAS_OPEN_ACTIVITY", reservationIds: reservations.map(reservation => reservation.id), clinicalVisitIds: visits.map(visit => visit.id) });
      }
      await manager.softDelete(AnimalEntity, { id: animal.id });
    }));
    return null;
  }
}

/** Case-insensitive id equality where two nulls are equal (optional breed). */
function sameOptionalId(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null) || sameId(a, b);
}
