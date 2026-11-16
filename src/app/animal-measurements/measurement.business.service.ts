import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { Actor, isStaff, requireAnimalAccess } from "../core/authorization";
import { MeasurementTypeService } from "../measurement-types/measurement-type.service";
import { MeasurementTypeCode } from "../measurement-types/enums/measurement-type-code.enum";
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
    private readonly types: MeasurementTypeService,
  ) {}

  private async animal(id: string, actor: Actor) {
    const animal = await this.persistence.execute(() => this.animals.findOne({ where: { id }, relations: [MeasurementRelation.Owner] }));
    if (!animal) throw new NotFoundException(MeasurementMessage.AnimalNotFound);
    if (animal.owner) requireAnimalAccess(actor, animal.owner.id);
    else if (!isStaff(actor)) throw new ForbiddenException(MeasurementMessage.MissingOwner);
    return animal;
  }

  private value(value: number, code: string): string {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 999999999.999999 || !/^-?\d+(?:\.\d{1,6})?$/.test(String(value))) throw new BadRequestException(MeasurementMessage.InvalidValue);
    if (value < 0 && [MeasurementTypeCode.Weight, MeasurementTypeCode.Height, MeasurementTypeCode.HeartRate, MeasurementTypeCode.RespiratoryRate].includes(code as MeasurementTypeCode)) throw new BadRequestException(MeasurementMessage.NonNegative);
    return value.toFixed(6);
  }

  private time(value: string | undefined): Date {
    const date = value === undefined ? new Date() : new Date(value);
    if (value === null || (value !== undefined && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw new BadRequestException(MeasurementMessage.InvalidTime);
    return date;
  }

  async list(query: ListMeasurementsQueryDto, actor: Actor) {
    if (query.animalId) await this.animal(query.animalId, actor);
    const builder = this.measurements.createQueryBuilder("measurement")
      .leftJoinAndSelect("measurement.measurementType", "measurementType")
      .innerJoin("measurement.animal", "animal", "animal.deleted_at IS NULL");
    if (!isStaff(actor)) builder.innerJoin("animal.owner", "owner").andWhere("owner.id = :ownerId", { ownerId: actor.id });
    if (query.animalId) builder.andWhere("measurement.animalId = :animalId", { animalId: query.animalId });
    if (query.measurementTypeId) builder.andWhere("measurement.measurementTypeId = :typeId", { typeId: query.measurementTypeId });
    return this.persistence.execute(() => builder.orderBy("measurement.createdAt", "DESC").addOrderBy("measurement.id", "DESC").skip(query.skip).take(query.take).getMany());
  }

  async get(id: string, actor: Actor) {
    const row = await this.persistence.execute(() => this.measurements.findOne({ where: { id }, relations: [MeasurementRelation.Type] }));
    if (!row) throw new NotFoundException(MeasurementMessage.NotFound);
    await this.animal(row.animalId, actor);
    return row;
  }

  async create(dto: CreateMeasurementDto, actor: Actor) {
    await this.animal(dto.animalId, actor);
    const type = await this.types.requireActive(dto.measurementTypeId);
    const row = this.measurements.create({ animalId: dto.animalId, measurementTypeId: dto.measurementTypeId, value: this.value(dto.value, type.code), name: dto.name, description: dto.description, notes: dto.notes, measuredAt: this.time(dto.measuredAt), recordedBy: actor.id });
    return this.persistence.execute(() => this.measurements.save(row));
  }

  async update(id: string, dto: UpdateMeasurementDto, actor: Actor) {
    const row = await this.get(id, actor);
    if (dto.measurementTypeId !== undefined || dto.value !== undefined) {
      const type = await this.types.requireActive(dto.measurementTypeId !== undefined ? dto.measurementTypeId : row.measurementTypeId);
      const numeric = dto.value !== undefined ? dto.value : Number(row.value);
      row.value = this.value(numeric, type.code);
      row.measurementTypeId = type.id;
      row.measurementType = type;
    }
    if (dto.measuredAt !== undefined) row.measuredAt = this.time(dto.measuredAt);
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.notes !== undefined) row.notes = dto.notes;
    return this.persistence.execute(() => this.measurements.save(row));
  }

  async delete(id: string, actor: Actor) {
    const row = await this.get(id, actor);
    await this.persistence.execute(() => this.measurements.remove(row));
    return { message: MeasurementMessage.Deleted };
  }

  /** One ranked batch query selects each type independently, including inactive historical types. */
  async latestMany(animalIds: string[]): Promise<Map<string, LatestMeasurements>> {
    const result = new Map<string, LatestMeasurements>(animalIds.map(id => [id, { weight: null, height: null, latestMeasurements: [] }]));
    if (!animalIds.length) return result;
    if (animalIds.length > 1000) {
      for (let offset = 0; offset < animalIds.length; offset += 1000) {
        for (const [id, latest] of await this.latestMany(animalIds.slice(offset, offset + 1000))) result.set(id, latest);
      }
      return result;
    }
    const ranked = this.measurements.createQueryBuilder("measurement")
      .select("measurement.id", "id")
      .addSelect("ROW_NUMBER() OVER (PARTITION BY measurement.animalId, measurement.measurementTypeId ORDER BY CASE WHEN measurement.measuredAt IS NULL THEN 1 ELSE 0 END ASC, measurement.measuredAt DESC, measurement.createdAt DESC, measurement.id DESC)", "position")
      .where("measurement.animalId IN (:...animalIds)", { animalIds })
      .andWhere("(measurement.measuredAt IS NULL OR measurement.measuredAt <= :now)", { now: new Date() });
    const rows = await this.persistence.execute(() => this.measurements.createQueryBuilder("measurement")
      .innerJoin("(" + ranked.getQuery() + ")", "ranked", "ranked.id = measurement.id AND ranked.position = 1")
      .leftJoinAndSelect("measurement.measurementType", "measurementType")
      .setParameters(ranked.getParameters()).getMany());
    for (const row of rows) {
      const item = result.get(row.animalId);
      if (!item) continue;
      item.latestMeasurements.push(row);
      if (row.measurementType.code === MeasurementTypeCode.Weight) item.weight = Number(row.value);
      if (row.measurementType.code === MeasurementTypeCode.Height) item.height = Number(row.value);
    }
    return result;
  }
  async latest(animalId: string): Promise<LatestMeasurements> { return (await this.latestMany([animalId])).get(animalId)!; }
}
export interface LatestMeasurements { weight: number | null; height: number | null; latestMeasurements: AnimalMeasurementEntity[]; }
