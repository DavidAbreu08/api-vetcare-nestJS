import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Actor, sameId } from "../core/authorization";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { applicationError } from "../core/exceptions/application-error";
import { withLockTimeout } from "../core/persistence/lock-timeout";
import { PersistenceService } from "../core/persistence/persistence.service";
import { utcInstantParam, uuidParam } from "../core/persistence/sql-params";
import { parseInstant } from "../core/persistence/utc-datetime";
import { isActiveEmployee } from "../employees/employee-status";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { acquireClinicClosuresLock, acquireEmployeeScheduleLock } from "../reservation/employee-schedule-lock";
import { findConfirmedReservationsBetween, openReservationsConflict } from "../reservation/open-reservations";
import { policyError } from "../reservation/reservation-policy";
import { UsersEntity } from "../users/entities/users.entity";
import { BlockedTimeMessages } from "./blocked-time.messages";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";

const WRITE_LOCK = { mode: "pessimistic_write" } as const;
const METADATA_FIELDS = ["reason", "name", "description", "notes"] as const;

export type BlockedTimeView = {
  id: string; employeeId: string | null; startAt: Date; endAt: Date; reason: string | null; name: string | null;
  description: string | null; notes: string | null; createdBy: string | null; createdAt: Date;
};

export function serializeBlockedTime(row: BlockedTimeEntity): BlockedTimeView {
  return {
    id: row.id, employeeId: row.employeeId ?? null, startAt: row.startAt, endAt: row.endAt, reason: row.reason ?? null, name: row.name ?? null,
    description: row.description ?? null, notes: row.notes ?? null, createdBy: row.createdBy ?? null, createdAt: row.createdAt,
  };
}

/**
 * Blocked times (vc_blocked_times): clinic-wide closures (employee_id NULL) and individual unavailability of one
 * employee profile, as UTC intervals that may span several days. Blocks may overlap each other. Creating or changing a
 * block that intersects CONFIRMED reservations (of the employee, or of anyone for a closure) is refused with 409 (count
 * in the message); nothing is cancelled automatically. PENDING reservations are not checked here: they are checked again
 * when confirmed.
 *
 * Locks (see docs/API_ORGANIZATION.md "Lock order"): a closure takes the clinic closures applock Exclusive; an
 * individual block locks the employee profile (UPDLOCK) and then takes the employee schedule applock (it skips the
 * closures applock); this keeps the reservation-flow order (profile -> closures Shared -> employee applock), only
 * without the middle step. The confirmed-reservation check and the write run under those applocks, so they serialize
 * with every confirmation, assignment, reschedule and creation with an employee, which read the blocks under the same
 * applocks. On update the block row itself is locked only after the applocks; DELETE locks only the row (it frees time
 * and needs no applock).
 */
@Injectable()
export class BlockedTimeBusinessService {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
    @InjectRepository(BlockedTimeEntity) private readonly blockedTimeRepository: Repository<BlockedTimeEntity>,
  ) {}

  /** Runs under withLockTimeout (lock waits capped at CRITICAL_LOCK_TIMEOUT_MS; 1222 -> 409). */
  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(manager => withLockTimeout(manager, work)));
  }

  /** Blocks intersecting [from, to), optionally the individual blocks of one employee; ordered by start. */
  async getAll(query: ListBlockedTimesQueryDto) {
    const builder = this.blockedTimeRepository.createQueryBuilder("block");
    if (query.from !== undefined) builder.andWhere("block.endAt > :from", { from: utcInstantParam(this.instant(query.from)) });
    if (query.to !== undefined) builder.andWhere("block.startAt < :to", { to: utcInstantParam(this.instant(query.to)) });
    if (query.employeeId) builder.andWhere("block.employeeId = :employeeId", { employeeId: uuidParam(query.employeeId) });
    const rows = await this.persistence.execute(() => builder
      .orderBy("block.startAt", "ASC").addOrderBy("block.id", "ASC").skip(query.skip).take(query.take).getMany());
    return rows.map(serializeBlockedTime);
  }

  async getById(id: string) {
    return serializeBlockedTime(await this.find(id));
  }

  private async find(id: string, manager: EntityManager = this.blockedTimeRepository.manager) {
    const blocked = await this.persistence.execute(() => manager.findOne(BlockedTimeEntity, { where: { id } }));
    if (!blocked) throw applicationError(ErrorMetadata.NOT_FOUND, BlockedTimeMessages.NOT_FOUND);
    return blocked;
  }

  /** created_by = the authenticated actor (never from the body). */
  async create(dto: CreateBlockedTimeDto, actor: Actor) {
    const { startAt, endAt } = this.interval(dto.startAt, dto.endAt);
    const employeeId = dto.employeeId ?? null;
    const saved = await this.transaction(async manager => {
      await this.lockScope(manager, employeeId);
      await this.assertNoConfirmedReservations(manager, startAt, endAt, employeeId);
      const row = manager.create(BlockedTimeEntity, {
        employeeId, startAt, endAt, createdBy: actor.id,
        reason: dto.reason ?? null, name: dto.name ?? null, description: dto.description ?? null, notes: dto.notes ?? null,
      });
      return manager.save(row);
    });
    return this.getById(saved.id);
  }

  /**
   * Omitted fields stay unchanged; `employeeId: null` turns the block into a closure. The target scope (closure or employee)
   * is derived from an unlocked read and locked first; the block row is then locked and, when the scope came from the
   * stored row and changed meanwhile, 409 "reload and retry" (never locking a scope while holding the row).
   */
  async update(id: string, dto: UpdateBlockedTimeDto) {
    if (dto.startAt === null || dto.endAt === null) policyError("INVALID_INTERVAL", BlockedTimeMessages.NULL_INTERVAL);
    const snapshot = await this.find(id);
    const employeeId = dto.employeeId !== undefined ? dto.employeeId ?? null : snapshot.employeeId;
    this.interval(dto.startAt ?? snapshot.startAt.toISOString(), dto.endAt ?? snapshot.endAt.toISOString());
    await this.transaction(async manager => {
      await this.lockScope(manager, employeeId);
      const blocked = await manager.findOne(BlockedTimeEntity, { where: { id }, lock: WRITE_LOCK });
      if (!blocked) throw applicationError(ErrorMetadata.NOT_FOUND, BlockedTimeMessages.NOT_FOUND);
      const sameScope = (!blocked.employeeId && !employeeId) || sameId(blocked.employeeId, employeeId);
      if (dto.employeeId === undefined && !sameScope) {
        throw applicationError(ErrorMetadata.CONFLICT, BlockedTimeMessages.CHANGED, undefined, { code: "BLOCKED_TIME_CHANGED" });
      }
      const { startAt, endAt } = this.interval(dto.startAt ?? blocked.startAt.toISOString(), dto.endAt ?? blocked.endAt.toISOString());
      await this.assertNoConfirmedReservations(manager, startAt, endAt, employeeId);
      const changes: Partial<BlockedTimeEntity> = { startAt, endAt, employeeId };
      for (const field of METADATA_FIELDS) if (dto[field] !== undefined) changes[field] = dto[field] ?? null;
      await manager.update(BlockedTimeEntity, { id: blocked.id }, changes);
    });
    return this.getById(id);
  }

  async delete(id: string) {
    await this.transaction(async manager => {
      const blocked = await manager.findOne(BlockedTimeEntity, { where: { id }, lock: WRITE_LOCK });
      if (!blocked) throw applicationError(ErrorMetadata.NOT_FOUND, BlockedTimeMessages.NOT_FOUND);
      await manager.delete(BlockedTimeEntity, { id: blocked.id });
    });
  }

  // ---------------------------------------------------------------- helpers

  private instant(value: string): Date {
    const parsed = parseInstant(value);
    if (!parsed) policyError("INVALID_DATE", BlockedTimeMessages.INVALID_INSTANT);
    return parsed;
  }

  private interval(start: string, end: string): { startAt: Date; endAt: Date } {
    const startAt = this.instant(start);
    const endAt = this.instant(end);
    if (endAt.getTime() <= startAt.getTime()) policyError("INVALID_INTERVAL", BlockedTimeMessages.INVALID_INTERVAL);
    return { startAt, endAt };
  }

  /**
   * Closure: clinic closures applock Exclusive. Individual block: the employee profile (UPDLOCK; 404 when missing, 409
   * when not active: terminated or inactive account), then the employee schedule applock.
   */
  private async lockScope(manager: EntityManager, employeeId: string | null) {
    if (!employeeId) {
      await acquireClinicClosuresLock(manager, "Exclusive");
      return;
    }
    const employee = await manager.findOne(EmployeeEntity, { where: { id: employeeId }, lock: WRITE_LOCK });
    if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, BlockedTimeMessages.EMPLOYEE_NOT_FOUND);
    const user = await manager.findOne(UsersEntity, { where: { id: employee.userId } });
    if (!isActiveEmployee(user ? Object.assign(employee, { user }) : null)) {
      throw applicationError(ErrorMetadata.CONFLICT, BlockedTimeMessages.EMPLOYEE_INACTIVE, undefined, { code: "EMPLOYEE_INACTIVE" });
    }
    await acquireEmployeeScheduleLock(manager, employee.id);
  }

  /** 409 IN_USE (count in the message) when CONFIRMED reservations intersect the block (of the employee, or of anyone). */
  private async assertNoConfirmedReservations(manager: EntityManager, startAt: Date, endAt: Date, employeeId: string | null) {
    const confirmed = await findConfirmedReservationsBetween(manager, startAt, endAt, employeeId ? [employeeId] : undefined);
    if (confirmed.length) {
      throw openReservationsConflict("BLOCK_OVERLAPS_CONFIRMED", count => BlockedTimeMessages.confirmedReservations(count, !employeeId), confirmed);
    }
  }
}
