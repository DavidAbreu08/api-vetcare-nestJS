import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { Actor, requireAnimalAccess } from "../core/authorization";
import { Role } from "../core/enums/role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { AnimalMeasurementEntity } from "./entities/animal-measurement.entity";
import { CreateMeasurementDto, ListMeasurementsQueryDto, UpdateMeasurementDto } from "./dto/create-measurement.dto";
import { MeasurementMessage, MeasurementRelation } from "./measurement.messages";

/** Owns observation validation, active-animal access and deterministic independent latest values. */
@Injectable()
export class MeasurementBusinessService {
  constructor(
    @InjectRepository(AnimalMeasurementEntity) private readonly measurements: Repository<AnimalMeasurementEntity>,
    @InjectRepository(AnimalEntity) private readonly animals: Repository<AnimalEntity>,
    private readonly persistence: PersistenceService,
  ) {}

  private async animal(id: string, actor: Actor) {
    const animal = await this.persistence.execute(() => this.animals.findOne({ where: { id }, relations: [MeasurementRelation.Owner] }));
    if (!animal) throw new NotFoundException(MeasurementMessage.AnimalNotFound);
    if (animal.owner) requireAnimalAccess(actor, animal.owner.id);
    else if (actor.role !== Role.ADMIN && actor.role !== Role.FUNCIONARIO) throw new ForbiddenException(MeasurementMessage.MissingOwner);
    return animal;
  }

  private validateValues(value: { weight?: number | null; height?: number | null }) {
    if (value.weight == null && value.height == null) throw new BadRequestException(MeasurementMessage.Empty);
  }

  private time(value: string | undefined): Date {
    const date = value === undefined ? new Date() : new Date(value);
    if (value === null || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw new BadRequestException(MeasurementMessage.InvalidTime);
    return date;
  }

  async list(query: ListMeasurementsQueryDto, actor: Actor) {
    if (query.animalId) await this.animal(query.animalId, actor);
    const builder = this.measurements.createQueryBuilder("measurement")
      .innerJoin("measurement.animal", "animal", "animal.deleted_at IS NULL");
    if (actor.role === Role.CLIENTE) builder.innerJoin("animal.owner", "owner").andWhere("owner.id = :ownerId", { ownerId: actor.id });
    if (query.animalId) builder.andWhere("measurement.animalId = :animalId", { animalId: query.animalId });
    return this.persistence.execute(() => builder.orderBy("measurement.createdAt", "DESC").addOrderBy("measurement.id", "DESC").skip(query.skip).take(query.take).getMany());
  }

  async get(id: string, actor: Actor) {
    const row = await this.persistence.execute(() => this.measurements.findOneBy({ id }));
    if (!row) throw new NotFoundException(MeasurementMessage.NotFound);
    await this.animal(row.animalId, actor);
    return row;
  }

  async create(dto: CreateMeasurementDto, actor: Actor) {
    await this.animal(dto.animalId, actor);
    this.validateValues(dto);
    const row = this.measurements.create({ ...dto, measuredAt: this.time(dto.measuredAt), userId: actor.id });
    return this.persistence.execute(() => this.measurements.save(row));
  }

  async update(id: string, dto: UpdateMeasurementDto, actor: Actor) {
    const row = await this.get(id, actor);
    const next = { weight: dto.weight !== undefined ? dto.weight : row.weight, height: dto.height !== undefined ? dto.height : row.height };
    this.validateValues(next);
    if (dto.measuredAt !== undefined) row.measuredAt = this.time(dto.measuredAt);
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.weight !== undefined) row.weight = dto.weight;
    if (dto.height !== undefined) row.height = dto.height;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.notes !== undefined) row.notes = dto.notes;
    return this.persistence.execute(() => this.measurements.save(row));
  }

  async delete(id: string, actor: Actor) {
    const row = await this.get(id, actor);
    await this.persistence.execute(() => this.measurements.remove(row));
    return { message: MeasurementMessage.Deleted };
  }

  /** Known past observations precede unknown-time imports; future rows never affect current values. */
  async latest(animalId: string): Promise<{ weight: number | null; height: number | null }> {
    const latestValue = async (dimension: "weight" | "height") => {
      const row = await this.persistence.execute(() => this.measurements.createQueryBuilder("measurement")
        .where("measurement.animalId = :animalId", { animalId })
        .andWhere(`measurement.${dimension} IS NOT NULL`)
        .andWhere("(measurement.measuredAt IS NULL OR measurement.measuredAt <= :now)", { now: new Date() })
        .orderBy("CASE WHEN measurement.measuredAt IS NULL THEN 1 ELSE 0 END", "ASC")
        .addOrderBy("measurement.measuredAt", "DESC").addOrderBy("measurement.createdAt", "DESC").addOrderBy("measurement.id", "DESC").getOne());
      return row ? Number(row[dimension]) : null;
    };
    const [weight, height] = await Promise.all([latestValue("weight"), latestValue("height")]);
    return { weight, height };
  }
}
