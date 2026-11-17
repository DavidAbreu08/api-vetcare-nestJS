import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Actor, requireStaff } from "../core/authorization";
import { catalogAttributes } from "../core/catalog";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { applicationError } from "../core/exceptions/application-error";
import { isReferenceViolation, PersistenceService } from "../core/persistence/persistence.service";
import { isBookableEmployee } from "../employees/employee-status";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { projectEmployee } from "../reservation/reservation.serializer";
import { serializeClinicService } from "./clinic-service.projection";
import { ClinicServiceConflictMessages, ClinicServiceMessage } from "./clinic-services.messages";
import { CreateClinicServiceDto, ListClinicServicesQueryDto, UpdateClinicServiceDto } from "./dto/clinic-service.dto";
import { ClinicServiceEntity, SERVICE_DURATION } from "./entities/clinic-service.entity";
import { EmployeeServiceEntity } from "./entities/employee-service.entity";

const LOCK = { mode: "pessimistic_write" } as const;

/**
 * Clinic services catalog: immutable codes; referenced services are deactivated (is_active = 0) and only a service that
 * was never used can be deleted. Reads: administrators see every service (optional isActive filter); everyone else
 * only active services (an inactive one is 404 for them).
 */
@Injectable()
export class ClinicServicesBusinessService {
  constructor(
    @InjectRepository(ClinicServiceEntity) private readonly repository: Repository<ClinicServiceEntity>,
    @InjectRepository(EmployeeServiceEntity) private readonly qualifications: Repository<EmployeeServiceEntity>,
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
  ) {}

  async getAll(query: ListClinicServicesQueryDto, actor: Actor) {
    const isActive = actor.isAdmin ? query.isActive : true;
    const rows = await this.persistence.execute(() => this.repository.find({
      where: isActive === undefined ? {} : { isActive }, skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" },
    }));
    return rows.map(serializeClinicService);
  }

  async getById(id: string, actor: Actor) {
    return serializeClinicService(await this.findVisible(id, actor));
  }

  /** Administrators read any service; other callers only active ones (404 otherwise, nothing about inactive entries leaks). */
  private async findVisible(id: string, actor: Actor): Promise<ClinicServiceEntity> {
    const row = await this.persistence.execute(() => this.repository.findOneBy({ id }));
    if (!row || (!actor.isAdmin && !row.isActive)) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicServiceMessage.NotFound);
    return row;
  }

  private attributes(dto: UpdateClinicServiceDto): Partial<ClinicServiceEntity> {
    const invalid = () => applicationError(ErrorMetadata.INVALID_VALUE, ClinicServiceMessage.Invalid);
    // Only the fields sent are returned (omitted fields stay untouched); there is no notes column.
    const result = catalogAttributes({ code: dto.code, name: dto.name, isActive: dto.isActive, description: dto.description }, invalid) as Partial<ClinicServiceEntity>;
    if (dto.durationMinutes !== undefined) {
      const minutes = dto.durationMinutes;
      if (!Number.isInteger(minutes) || minutes < SERVICE_DURATION.min || minutes > SERVICE_DURATION.max || minutes % SERVICE_DURATION.step !== 0) {
        throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicServiceMessage.InvalidDuration);
      }
      result.durationMinutes = minutes;
    }
    return result;
  }

  async create(dto: CreateClinicServiceDto) {
    const attributes = this.attributes(dto);
    const saved = await this.persistence.execute(() => this.repository.save(this.repository.create({ ...attributes, isActive: dto.isActive ?? true })));
    return serializeClinicService(saved);
  }

  /** Locks the service row (UPDLOCK) inside the caller's transaction; 404 when missing. Nothing else is locked. */
  private async lockService(manager: EntityManager, id: string): Promise<ClinicServiceEntity> {
    const row = await manager.findOne(ClinicServiceEntity, { where: { id }, lock: LOCK });
    if (!row) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicServiceMessage.NotFound);
    return row;
  }

  /**
   * Code is immutable (409). Changing durationMinutes only affects reservations created afterwards: existing ones keep
   * their start_at/end_at. Deactivation blocks new reservations only; it never removes qualifications or touches
   * existing reservations (they can still be assigned, confirmed and rescheduled).
   */
  async update(id: string, dto: UpdateClinicServiceDto) {
    const attributes = this.attributes(dto);
    const saved = await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const row = await this.lockService(manager, id);
      if (attributes.code !== undefined && attributes.code !== row.code) throw applicationError(ErrorMetadata.CONFLICT, ClinicServiceMessage.ImmutableCode);
      Object.assign(row, attributes);
      return manager.save(row);
    }));
    return serializeClinicService(saved);
  }

  /**
   * Only a service never referenced by a reservation (any state) or qualification is deleted; otherwise 409 IN_USE
   * (counts in the message only): deactivate it instead. The foreign keys stay the final arbiter (a reference committed
   * by a concurrent request after the counts) and get the same readable message.
   */
  async delete(id: string) {
    await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const row = await this.lockService(manager, id);
      const reservations = await manager.count(ReservationEntity, { where: { serviceId: row.id } });
      const qualifications = await manager.count(EmployeeServiceEntity, { where: { serviceId: row.id } });
      if (reservations || qualifications) {
        throw applicationError(ErrorMetadata.IN_USE, ClinicServiceConflictMessages.inUse(reservations, qualifications), undefined, { code: "SERVICE_IN_USE" });
      }
      try {
        await manager.delete(ClinicServiceEntity, { id: row.id });
      } catch (error: unknown) {
        if (isReferenceViolation(error)) throw applicationError(ErrorMetadata.IN_USE, ClinicServiceConflictMessages.referenced, error, { code: "SERVICE_IN_USE" });
        throw error;
      }
    }));
  }

  /**
   * Staff only: employees qualified for the service that are bookable today (available profile, active account, not
   * terminated). Projected like reservation employees (non-administrators: { id, name, profilePictureUrl }). It does not
   * consider schedules or occupied time (phase 5B).
   */
  async getEmployees(id: string, actor: Actor) {
    requireStaff(actor, ClinicServiceMessage.Forbidden);
    const service = await this.findVisible(id, actor);
    const rows = await this.persistence.execute(() => this.qualifications.find({
      where: { serviceId: service.id }, relations: { employee: { user: true } },
    }));
    return rows.map(row => row.employee).filter(employee => isBookableEmployee(employee))
      .sort((a, b) => (a.user?.name ?? "").localeCompare(b.user?.name ?? "") || a.id.localeCompare(b.id))
      .map(employee => projectEmployee(employee, actor));
  }
}
