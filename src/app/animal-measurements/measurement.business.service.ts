import { applicationError } from "../core/exceptions/application-error";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { Actor, isStaff, requireAdmin, requireStaff } from "../core/authorization";
import { activeTutorExists, AnimalAccessService } from "../animal-owners/animal-access.service";
import { MeasurementTypeService } from "../measurement-types/measurement-type.service";
import { MeasurementTypeCode } from "../measurement-types/enums/measurement-type-code.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { AnimalMeasurementEntity } from "./entities/animal-measurement.entity";
import { CreateMeasurementDto, DeleteMeasurementDto, ListMeasurementsQueryDto, UpdateMeasurementDto } from "./dto/create-measurement.dto";
import { MeasurementMessage, MeasurementErrorMessages } from "./measurement.messages";
import { ClinicalVisitService } from "../clinical-visits/clinical-visit.service";
import { ClinicalVisitStatus } from "../clinical-visits/enums/clinical-visit-status.enum";
import { projectMeasurement, projectMeasurements } from "./measurement.projection";

const WRITE_LOCK = { mode: "pessimistic_write" } as const;

/** Owns observation validation, active-animal access and deterministic independent latest values. */
@Injectable()
export class MeasurementBusinessService {
  constructor(
    @InjectRepository(AnimalMeasurementEntity) private readonly measurements: Repository<AnimalMeasurementEntity>,
    @InjectRepository(AnimalEntity) private readonly animals: Repository<AnimalEntity>,
    private readonly persistence: PersistenceService,
    private readonly types: MeasurementTypeService,
    private readonly visits: ClinicalVisitService,
    private readonly access: AnimalAccessService,
  ) {}

  /** Active (not soft-deleted) animal readable by the actor: staff or an active tutor (former tutors: 403). */
  private async animal(id: string, actor: Actor) {
    const animal = await this.persistence.execute(() => this.animals.findOne({ where: { id } }));
    if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, MeasurementMessage.AnimalNotFound);
    if (!(await this.access.canReadAnimal(actor, animal.id))) throw applicationError(ErrorMetadata.FORBIDDEN, MeasurementErrorMessages[ErrorMetadata.FORBIDDEN]);
    return animal;
  }

  private value(value: number, code: string): string {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 999999999.999999 || !/^-?\d+(?:\.\d{1,6})?$/.test(String(value))) throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementErrorMessages[ErrorMetadata.INVALID_VALUE]);
    if (value < 0 && [MeasurementTypeCode.Weight, MeasurementTypeCode.Height, MeasurementTypeCode.HeartRate, MeasurementTypeCode.RespiratoryRate].includes(code as MeasurementTypeCode)) throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementMessage.NonNegative);
    return value.toFixed(6);
  }

  private time(value: string | undefined): Date {
    const date = value === undefined ? new Date() : new Date(value);
    if (value === null || (value !== undefined && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementMessage.InvalidTime);
    return date;
  }

  /** Base read: excludes soft-deleted rows and loads only id/status of the clinical visit (never clinical data). */
  private reader() {
    return this.measurements.createQueryBuilder("measurement")
      .leftJoinAndSelect("measurement.measurementType", "measurementType")
      .leftJoin("measurement.clinicalVisit", "clinicalVisit")
      .addSelect(["clinicalVisit.id", "clinicalVisit.status"])
      .where("measurement.deletedAt IS NULL");
  }

  async list(query: ListMeasurementsQueryDto, actor: Actor) {
    if (query.animalId) await this.animal(query.animalId, actor);
    const builder = this.reader().innerJoin("measurement.animal", "animal", "animal.deleted_at IS NULL");
    // Non-staff: measurements of animals of which the caller is an active tutor (primary or secondary).
    if (!isStaff(actor)) builder.andWhere(activeTutorExists("measurement.animalId", "tutorId"), { tutorId: actor.id });
    if (query.animalId) builder.andWhere("measurement.animalId = :animalId", { animalId: query.animalId });
    if (query.measurementTypeId) builder.andWhere("measurement.measurementTypeId = :typeId", { typeId: query.measurementTypeId });
    if (query.clinicalVisitId) builder.andWhere("measurement.clinicalVisitId = :visitId", { visitId: query.clinicalVisitId });
    const rows = await this.persistence.execute(() => builder.orderBy("measurement.createdAt", "DESC").addOrderBy("measurement.id", "DESC").skip(query.skip).take(query.take).getMany());
    return projectMeasurements(rows, actor);
  }

  private async load(id: string) {
    const row = await this.persistence.execute(() => this.reader().andWhere("measurement.id = :id", { id }).getOne());
    if (!row) throw applicationError(ErrorMetadata.NOT_FOUND, MeasurementErrorMessages[ErrorMetadata.NOT_FOUND]);
    return row;
  }

  async get(id: string, actor: Actor) {
    return projectMeasurement(await this.readable(id, actor), actor);
  }

  /** Loaded row (unprojected) after the actor's access to its animal is checked. */
  private async readable(id: string, actor: Actor) {
    const row = await this.load(id);
    await this.animal(row.animalId, actor);
    return row;
  }

  /** Administrators and active employees only; clients have read-only access to their animals. */
  async create(dto: CreateMeasurementDto, actor: Actor) {
    requireStaff(actor, MeasurementMessage.StaffOnly);
    await this.animal(dto.animalId, actor);
    const type = await this.types.requireActive(dto.measurementTypeId);
    const row = this.measurements.create({ animalId: dto.animalId, measurementTypeId: dto.measurementTypeId, value: this.value(dto.value, type.code), name: dto.name, description: dto.description, notes: dto.notes, measuredAt: this.time(dto.measuredAt), recordedBy: actor.id, clinicalVisitId: dto.clinicalVisitId ?? null });
    // Clinical context: same animal, IN_PROGRESS visit, clinical access; saved while holding the visit lock.
    const saved = dto.clinicalVisitId
      ? await this.visits.withWritableVisit(dto.clinicalVisitId, dto.animalId, actor, manager => manager.save(row))
      : await this.persistence.execute(() => this.measurements.save(row));
    return projectMeasurement(await this.load(saved.id), actor);
  }

  /** Reads the row under an update lock inside the caller's transaction; soft-deleted rows are not found. */
  private async locked(manager: EntityManager, id: string) {
    const row = await manager.findOne(AnimalMeasurementEntity, { where: { id, deletedAt: IsNull() }, lock: WRITE_LOCK });
    if (!row) throw applicationError(ErrorMetadata.NOT_FOUND, MeasurementErrorMessages[ErrorMetadata.NOT_FOUND]);
    return row;
  }

  /**
   * Staff only. The type is immutable (inactive historical types stay valid); recordedBy keeps the original
   * author and updatedBy records the editor. The row is re-read under lock to avoid lost updates.
   */
  async update(id: string, dto: UpdateMeasurementDto, actor: Actor) {
    requireStaff(actor, MeasurementMessage.StaffOnly);
    const current = await this.readable(id, actor);
    const value = dto.value !== undefined ? this.value(dto.value, current.measurementType.code) : undefined;
    const measuredAt = dto.measuredAt !== undefined ? this.time(dto.measuredAt) : undefined;
    const apply = async (manager: EntityManager) => {
      const row = await this.locked(manager, id);
      if (value !== undefined) row.value = value;
      if (measuredAt !== undefined) row.measuredAt = measuredAt;
      if (dto.name !== undefined) row.name = dto.name;
      if (dto.description !== undefined) row.description = dto.description;
      if (dto.notes !== undefined) row.notes = dto.notes;
      row.updatedBy = actor.id;
      return manager.save(row);
    };
    // Measurements of a visit change only while it is IN_PROGRESS, by staff with clinical access (visit lock, then row lock).
    if (current.clinicalVisitId) await this.visits.withWritableVisit(current.clinicalVisitId, current.animalId, actor, apply);
    else await this.persistence.execute(() => this.measurements.manager.transaction(apply));
    return projectMeasurement(await this.load(id), actor);
  }

  /** Administrators only: audited soft-delete; measurements of a clinical visit are never deleted. */
  async delete(id: string, dto: DeleteMeasurementDto, actor: Actor) {
    requireAdmin(actor, MeasurementMessage.AdminOnly);
    const current = await this.readable(id, actor);
    if (current.clinicalVisitId) throw applicationError(ErrorMetadata.CONFLICT, MeasurementErrorMessages[ErrorMetadata.CONFLICT]);
    await this.persistence.execute(() => this.measurements.manager.transaction(async manager => {
      const row = await this.locked(manager, id);
      if (row.clinicalVisitId) throw applicationError(ErrorMetadata.CONFLICT, MeasurementErrorMessages[ErrorMetadata.CONFLICT]);
      row.deletedAt = new Date();
      row.deletedBy = actor.id;
      row.deleteReason = dto.reason.trim();
      await manager.save(row);
    }));
    return null;
  }

  /**
   * One ranked batch query selects each type independently, including inactive historical types. Rows are
   * unprojected: callers serializing them for an actor apply projectMeasurement (updatedBy hidden from clients).
   */
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
      .leftJoin("measurement.clinicalVisit", "clinicalVisit")
      .where("measurement.animalId IN (:...animalIds)", { animalIds })
      .andWhere("measurement.deletedAt IS NULL")
      // Measurements of VOIDED visits stay in the history (listed with clinicalVisitStatus) but never count as latest values.
      .andWhere("(clinicalVisit.id IS NULL OR clinicalVisit.status <> :voided)", { voided: ClinicalVisitStatus.VOIDED })
      // measured_at holds UTC instants: compare with the server UTC clock (no local-time parameter conversion).
      .andWhere("(measurement.measuredAt IS NULL OR measurement.measuredAt <= SYSUTCDATETIME())");
    const rows = await this.persistence.execute(() => this.measurements.createQueryBuilder("measurement")
      .innerJoin("(" + ranked.getQuery() + ")", "ranked", "ranked.id = measurement.id AND ranked.position = 1")
      .leftJoinAndSelect("measurement.measurementType", "measurementType")
      .leftJoin("measurement.clinicalVisit", "clinicalVisit")
      .addSelect(["clinicalVisit.id", "clinicalVisit.status"])
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
