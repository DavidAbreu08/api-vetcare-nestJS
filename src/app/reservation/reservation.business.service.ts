import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { EmailService } from "src/email/email.service";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { AnimalRelation } from "../animal/enums/animal-relation.enum";
import { ClinicalVisitEntity } from "../clinical-visits/entities/clinical-visit.entity";
import { ClinicalVisitStatus } from "../clinical-visits/enums/clinical-visit-status.enum";
import { Actor, isStaff, sameId } from "../core/authorization";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { SystemRole } from "../core/enums/system-role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { parseInstant, toDbUtc } from "../core/persistence/utc-datetime";
import { isBookableEmployee } from "../employees/employee-status";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { RoleMembershipService } from "../roles/role-membership.service";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { UsersEntity } from "../users/entities/users.entity";
import { AssignReservationEmployeeDto, ReservationReasonDto, RescheduleReservationDto } from "./dto/reservation-actions.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";
import { acquireEmployeeScheduleLock } from "./employee-schedule-lock";
import { BlockedTimeEntity } from "../blocked-times/entities/bloked-times.entity";
import { ReservationEntity } from "./entities/reservation.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { ReservationHistoryService, reservationSnapshot } from "../reservation-history/reservation-history.service";
import { ReservationMessages } from "./reservation.messages";
import { assertTransition, clinicParts, overlaps, policyError, validateReservationWindow } from "./reservation-policy";
import { ReservationRelation } from "./enums/reservation-relations.enum";
import { serializeReservation, serializeReservations } from "./reservation.serializer";

type NotificationStatus = "sent" | "failed" | "not_requested";
const WRITE_LOCK = { mode: "pessimistic_write" } as const;
/** Visits that count as an attendance; a VOIDED visit no longer blocks cancellation. */
const ACTIVE_VISIT_STATUSES = [ClinicalVisitStatus.IN_PROGRESS, ClinicalVisitStatus.COMPLETED];

/**
 * Reservation state machine and scheduling rules. Every state change runs in one transaction together with its
 * history event; operations that can make an employee's time occupied take the employee schedule applock
 * (sp_getapplock) before checking overlaps. Notifications are sent after commit.
 *
 * Lock order (UPDLOCK rows, then the applock), never inverted by any flow:
 *   vc_reservations -> vc_animals -> vc_users (client) -> vc_employees -> employee schedule applock.
 * Creation, confirmation and reschedule lock the animal and the client account and re-check them (not deleted,
 * active), serializing with animal deletion and account deactivation/deletion, which lock those rows and then
 * read open reservations. Every flow that assigns or confirms an employee locks the employee profile, serializing
 * with termination/unavailability (PUT /api/employees/:id) and account deactivation, which lock it and then read
 * the employee's open reservations. Those readers never lock reservations, so no cycle can form.
 *
 * Access: administrators see and manage everything; an active employee sees the reservations assigned to them;
 * a client sees and may cancel their own reservations. Responses are projected per actor (serializeReservation).
 */
@Injectable()
export class ReservationBusinessService {
  private readonly logger = new Logger(ReservationBusinessService.name);

  constructor(
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly settings: SystemSettingsService,
    private readonly membership: RoleMembershipService,
    private readonly history: ReservationHistoryService,
    @InjectRepository(ReservationEntity) private readonly reservationRepository: Repository<ReservationEntity>,
    @InjectRepository(UsersEntity) private readonly usersRepository: Repository<UsersEntity>,
    @InjectRepository(AnimalEntity) private readonly animalRepository: Repository<AnimalEntity>,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  // ---------------------------------------------------------------- reads

  /** Paginated, filtered and always limited to the caller's scope. */
  async list(query: ListReservationsQueryDto, actor: Actor) {
    const builder = this.reservationRepository.createQueryBuilder("reservation")
      .withDeleted()
      .leftJoinAndSelect("reservation.client", "client")
      .leftJoinAndSelect("reservation.employee", "employee")
      .leftJoinAndSelect("employee.user", "employeeUser")
      .leftJoinAndSelect("reservation.animal", "animal");
    if (!actor.isAdmin) {
      const scopes = ["reservation.clientId = :actorId"];
      if (actor.isEmployee && actor.employeeId) scopes.push("reservation.employeeId = :actorEmployeeId");
      builder.andWhere(`(${scopes.join(" OR ")})`, { actorId: actor.id, actorEmployeeId: actor.employeeId });
    }
    if (query.status) builder.andWhere("reservation.status = :status", { status: query.status });
    if (query.clientId) builder.andWhere("reservation.clientId = :clientId", { clientId: query.clientId });
    if (query.employeeId) builder.andWhere("reservation.employeeId = :employeeId", { employeeId: query.employeeId });
    if (query.animalId) builder.andWhere("reservation.animalId = :animalId", { animalId: query.animalId });
    if (query.from !== undefined) builder.andWhere("reservation.startAt >= :from", { from: toDbUtc(this.instant(query.from)) });
    if (query.to !== undefined) builder.andWhere("reservation.startAt < :to", { to: toDbUtc(this.instant(query.to)) });
    const rows = await this.persistence.execute(() => builder
      .orderBy("reservation.startAt", "ASC").addOrderBy("reservation.id", "ASC")
      .skip(query.skip).take(query.take).getMany());
    return serializeReservations(rows, actor);
  }

  async getById(id: string, actor: Actor) {
    const reservation = await this.load(id);
    this.requireReadAccess(actor, reservation);
    return serializeReservation(reservation, actor);
  }

  /** History is readable by whoever can read the reservation; third-party user ids are hidden from non-admins. */
  async getHistory(id: string, query: ListQueryDto, actor: Actor) {
    const reservation = await this.persistence.execute(() => this.reservationRepository.findOne({ where: { id } }));
    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);
    this.requireReadAccess(actor, reservation);
    return this.history.list(reservation.id, query, actor);
  }

  /** Administrator; the client of the reservation; the active employee it is assigned to. */
  canRead(actor: Actor, reservation: Pick<ReservationEntity, "clientId" | "employeeId">): boolean {
    return actor.isAdmin || sameId(reservation.clientId, actor.id)
      || (actor.isEmployee && !!actor.employeeId && sameId(reservation.employeeId, actor.employeeId));
  }

  private requireReadAccess(actor: Actor, reservation: Pick<ReservationEntity, "clientId" | "employeeId">) {
    if (!this.canRead(actor, reservation)) throw new ForbiddenException("Access denied");
  }

  private async load(id: string): Promise<ReservationEntity> {
    const reservation = await this.persistence.execute(() => this.reservationRepository.findOne({
      where: { id }, withDeleted: true,
      relations: { [ReservationRelation.CLIENT]: true, [ReservationRelation.EMPLOYEE]: { user: true }, [ReservationRelation.ANIMAL]: true },
    }));
    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);
    return reservation;
  }

  // ---------------------------------------------------------------- writes

  /**
   * Always PENDING. Staff on the professional path may book for another client; only an administrator may
   * pre-assign an employee (CREATED + EMPLOYEE_ASSIGNED), matching PATCH /:id/employee. A personal booking (the
   * caller is the client) follows the client path.
   */
  async create(dto: CreateReservationDto, actor: Actor) {
    const { startAt, endAt } = this.window(dto.startAt, dto.endAt);
    validateReservationWindow(startAt, endAt);
    const user = await this.persistence.execute(() => this.usersRepository.findOne({ where: { id: actor.id } }));
    if (!user) throw new NotFoundException(ReservationMessages.USER_NOT_FOUND);
    const client = await this.validateAndGetClient(actor, user, dto.ownerId);
    const animal = await this.validateAnimalOwnership(dto.animalId, client);
    if (dto.employeeId && !actor.isAdmin) throw new ForbiddenException(ReservationMessages.EMPLOYEE_ASSIGNMENT_FORBIDDEN);

    const saved = await this.transaction(async manager => {
      await this.requireBookingParties(manager, animal.id, client.id, { requireOwnership: true });
      await this.assertNotBlocked(manager, startAt, endAt);
      const employee = dto.employeeId ? await this.requireBookableEmployee(manager, dto.employeeId, startAt) : null;
      if (employee) await this.reserveEmployeeSlot(manager, employee.id, startAt, endAt);
      const reservation = await manager.save(manager.create(ReservationEntity, {
        animalId: animal.id, clientId: client.id, employeeId: employee?.id ?? null, startAt, endAt,
        status: ReservationStatus.PENDING, reason: dto.reason ?? null, description: dto.description ?? null, notes: dto.notes ?? null,
        confirmedAt: null, cancelledAt: null,
      }));
      await this.history.record(manager, {
        reservationId: reservation.id, action: ReservationHistoryAction.CREATED, changedBy: actor.id,
        newData: reservationSnapshot({ ...reservation, employeeId: null }),
      });
      if (employee) {
        await this.history.record(manager, {
          reservationId: reservation.id, action: ReservationHistoryAction.EMPLOYEE_ASSIGNED, changedBy: actor.id,
          oldData: { employeeId: null }, newData: { employeeId: employee.id },
        });
      }
      return reservation;
    });

    const start = clinicParts(startAt);
    return this.respond(saved.id, actor, () => this.emailService.sendReservationCreatedEmail(
      client.email, client.name, start.date, start.time, clinicParts(endAt).time));
  }

  /** PENDING only; the employee must be bookable on the reservation date and free (applock + overlap check). */
  async assignEmployee(id: string, dto: AssignReservationEmployeeDto, actor: Actor) {
    await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      if (reservation.status !== ReservationStatus.PENDING) {
        throw new ConflictException({ statusCode: 409, code: "INVALID_TRANSITION", message: ReservationMessages.ASSIGN_REQUIRES_PENDING });
      }
      if (sameId(reservation.employeeId, dto.employeeId)) throw new ConflictException(ReservationMessages.EMPLOYEE_ALREADY_ASSIGNED);
      const employee = await this.requireBookableEmployee(manager, dto.employeeId, reservation.startAt);
      await this.reserveEmployeeSlot(manager, employee.id, reservation.startAt, reservation.endAt, reservation.id);
      const previous = reservation.employeeId;
      await manager.update(ReservationEntity, { id: reservation.id }, { employeeId: employee.id });
      await this.history.record(manager, {
        reservationId: reservation.id, changedBy: actor.id, reason: dto.reason ?? null,
        action: previous ? ReservationHistoryAction.EMPLOYEE_CHANGED : ReservationHistoryAction.EMPLOYEE_ASSIGNED,
        oldData: { employeeId: previous }, newData: { employeeId: employee.id },
      });
    });
    return this.respond(id, actor);
  }

  /** PENDING -> CONFIRMED: requires a bookable employee, a future slot, no block and no overlap under the applock. */
  async confirm(id: string, dto: ReservationReasonDto, actor: Actor) {
    const confirmed = await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      assertTransition(reservation.status, ReservationStatus.CONFIRMED);
      if (!reservation.employeeId) throw new ConflictException({ statusCode: 409, code: "EMPLOYEE_REQUIRED", message: ReservationMessages.EMPLOYEE_REQUIRED });
      validateReservationWindow(reservation.startAt, reservation.endAt);
      await this.requireBookingParties(manager, reservation.animalId, reservation.clientId);
      const employee = await this.requireBookableEmployee(manager, reservation.employeeId, reservation.startAt);
      await this.assertNotBlocked(manager, reservation.startAt, reservation.endAt);
      await this.reserveEmployeeSlot(manager, employee.id, reservation.startAt, reservation.endAt, reservation.id);
      const before = reservationSnapshot(reservation);
      const confirmedAt = new Date();
      await manager.update(ReservationEntity, { id: reservation.id }, { status: ReservationStatus.CONFIRMED, confirmedAt });
      await this.history.record(manager, {
        reservationId: reservation.id, action: ReservationHistoryAction.CONFIRMED, changedBy: actor.id, reason: dto.reason ?? null,
        oldData: before, newData: reservationSnapshot({ ...reservation, status: ReservationStatus.CONFIRMED, confirmedAt }),
      });
      return reservation;
    });
    const start = clinicParts(confirmed.startAt);
    return this.respond(id, actor, client => this.emailService.sendReservationConfirmedEmail(
      client.email, client.name, start.date, start.time, clinicParts(confirmed.endAt).time, dto.reason ?? undefined));
  }

  /**
   * New interval for a PENDING or CONFIRMED reservation without a clinical visit. A CONFIRMED reservation returns to
   * PENDING (confirmed_at cleared) and must be confirmed again; one RESCHEDULED event keeps old and new values.
   */
  async reschedule(id: string, dto: RescheduleReservationDto, actor: Actor) {
    const { startAt, endAt } = this.window(dto.startAt, dto.endAt);
    validateReservationWindow(startAt, endAt);
    const previous = await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      if (![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(reservation.status)) {
        throw new ConflictException({ statusCode: 409, code: "INVALID_TRANSITION", message: `Cannot reschedule a ${reservation.status} reservation` });
      }
      if (await this.hasActiveVisit(manager, reservation.id)) throw new ConflictException(ReservationMessages.VISIT_STARTED);
      if (reservation.startAt.getTime() === startAt.getTime() && reservation.endAt.getTime() === endAt.getTime()) {
        policyError("RESCHEDULE_UNCHANGED", ReservationMessages.RESCHEDULE_UNCHANGED);
      }
      await this.requireBookingParties(manager, reservation.animalId, reservation.clientId);
      await this.assertNotBlocked(manager, startAt, endAt);
      if (reservation.employeeId) {
        const employee = await this.requireBookableEmployee(manager, reservation.employeeId, startAt);
        await this.reserveEmployeeSlot(manager, employee.id, startAt, endAt, reservation.id);
      }
      const before = reservationSnapshot(reservation);
      const changes = { startAt, endAt, status: ReservationStatus.PENDING, confirmedAt: null };
      await manager.update(ReservationEntity, { id: reservation.id }, changes);
      await this.history.record(manager, {
        reservationId: reservation.id, action: ReservationHistoryAction.RESCHEDULED, changedBy: actor.id, reason: dto.reason ?? null,
        oldData: before, newData: reservationSnapshot({ ...reservation, ...changes }),
      });
      return reservation;
    });
    const [oldStart, oldEnd, newStart, newEnd] = [previous.startAt, previous.endAt, startAt, endAt].map(clinicParts);
    return this.respond(id, actor, client => this.emailService.sendReservationRescheduledEmail(
      client.email, client.name, oldStart.date, oldStart.time, oldEnd.time, newStart.date, newStart.time, newEnd.time, dto.reason ?? undefined));
  }

  /**
   * PENDING/CONFIRMED -> CANCELLED by an administrator (any time) or the reservation's client (only before startAt);
   * frees the employee's time without the applock (it only removes occupation).
   */
  async cancel(id: string, dto: ReservationReasonDto, actor: Actor) {
    const cancelled = await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      if (!actor.isAdmin && !sameId(reservation.clientId, actor.id)) throw new ForbiddenException("Access denied");
      assertTransition(reservation.status, ReservationStatus.CANCELLED);
      if (!actor.isAdmin && Date.now() >= reservation.startAt.getTime()) {
        throw new ConflictException({ statusCode: 409, code: "CANCEL_AFTER_START", message: ReservationMessages.CANCEL_AFTER_START });
      }
      if (await this.hasActiveVisit(manager, reservation.id)) throw new ConflictException(ReservationMessages.VISIT_STARTED);
      const before = reservationSnapshot(reservation);
      const cancelledAt = new Date();
      await manager.update(ReservationEntity, { id: reservation.id }, { status: ReservationStatus.CANCELLED, cancelledAt });
      await this.history.record(manager, {
        reservationId: reservation.id, action: ReservationHistoryAction.CANCELLED, changedBy: actor.id, reason: dto.reason ?? null,
        oldData: before, newData: reservationSnapshot({ ...reservation, status: ReservationStatus.CANCELLED, cancelledAt }),
      });
      return reservation;
    });
    return this.respond(id, actor, client => this.emailService.sendReservationCancelledEmail(
      client.email, client.name, clinicParts(cancelled.startAt).date, dto.reason ?? undefined));
  }

  /** CONFIRMED -> NO_SHOW once start + RESERVATION_NO_SHOW_TOLERANCE_MINUTES has passed and no active visit exists. */
  async markNoShow(id: string, dto: ReservationReasonDto, actor: Actor) {
    await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      assertTransition(reservation.status, ReservationStatus.NO_SHOW);
      const tolerance = await this.settings.getNonNegativeInteger(SystemSettingCode.RESERVATION_NO_SHOW_TOLERANCE_MINUTES);
      if (Date.now() < reservation.startAt.getTime() + tolerance * 60_000) {
        throw new ConflictException({ statusCode: 409, code: "NO_SHOW_TOO_EARLY", message: ReservationMessages.NO_SHOW_TOO_EARLY });
      }
      if (await this.hasActiveVisit(manager, reservation.id)) throw new ConflictException(ReservationMessages.VISIT_STARTED);
      const before = reservationSnapshot(reservation);
      await manager.update(ReservationEntity, { id: reservation.id }, { status: ReservationStatus.NO_SHOW });
      await this.history.record(manager, {
        reservationId: reservation.id, action: ReservationHistoryAction.NO_SHOW, changedBy: actor.id, reason: dto.reason ?? null,
        oldData: before, newData: reservationSnapshot({ ...reservation, status: ReservationStatus.NO_SHOW }),
      });
    });
    return this.respond(id, actor);
  }

  // ---------------------------------------------------------------- scheduling helpers

  private instant(value: string): Date {
    const parsed = parseInstant(value);
    if (!parsed) policyError("INVALID_DATE", ReservationMessages.INVALID_INSTANT);
    return parsed;
  }

  private window(startAt: string, endAt: string) {
    return { startAt: this.instant(startAt), endAt: this.instant(endAt) };
  }

  /** Reads and locks the reservation row (UPDLOCK) for the rest of the transaction; relations are not locked. */
  private async lockReservation(manager: EntityManager, id: string): Promise<ReservationEntity> {
    const reservation = await manager.findOne(ReservationEntity, { where: { id }, lock: WRITE_LOCK });
    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);
    return reservation;
  }

  /**
   * Bookable profile (available, active account, not terminated by the reservation's clinic date). The profile row
   * is locked (UPDLOCK) until commit, serializing with termination/unavailability and account deactivation; the
   * account is read in a separate statement after the lock is granted, so it reflects any change committed by the
   * transaction that held the lock.
   */
  private async requireBookableEmployee(manager: EntityManager, employeeId: string, startAt: Date) {
    const employee = await manager.findOne(EmployeeEntity, { where: { id: employeeId }, lock: WRITE_LOCK });
    const user = employee ? await manager.findOne(UsersEntity, { where: { id: employee.userId } }) : null;
    const candidate = employee && user ? Object.assign(employee, { user }) : null;
    if (!isBookableEmployee(candidate, clinicParts(startAt).date)) throw new BadRequestException(ReservationMessages.INVALID_EMPLOYEE);
    return candidate;
  }

  /**
   * Locks (UPDLOCK) and re-checks, inside the transaction, the animal (exists, not soft-deleted) and the client
   * account (active, not soft-deleted): 409 ANIMAL_UNAVAILABLE / CLIENT_INACTIVE otherwise. Soft-deleted rows are
   * excluded by findOne.
   */
  private async requireBookingParties(manager: EntityManager, animalId: string, clientId: string, options: { requireOwnership?: boolean } = {}) {
    const animal = await manager.findOne(AnimalEntity, { where: { id: animalId }, lock: WRITE_LOCK });
    if (!animal) throw new ConflictException({ statusCode: 409, code: "ANIMAL_UNAVAILABLE", message: ReservationMessages.ANIMAL_UNAVAILABLE });
    const client = await manager.findOne(UsersEntity, { where: { id: clientId }, lock: WRITE_LOCK });
    if (!client?.isActive) throw new ConflictException({ statusCode: 409, code: "CLIENT_INACTIVE", message: ReservationMessages.CLIENT_INACTIVE });
    if (options.requireOwnership) {
      // Creation: the ownership pre-check ran before the transaction. With the animal row locked (owner changes
      // lock it too), re-read owner_id; a plain read after the existing locks keeps the lock order unchanged.
      const owned = await manager.findOne(AnimalEntity, { select: { id: true }, where: { id: animalId, owner: { id: clientId } } });
      if (!owned) throw new ConflictException({ statusCode: 409, code: "ANIMAL_OWNER_MISMATCH", message: ReservationMessages.ANIMAL_OWNER_MISMATCH });
    }
  }

  /** Global clinic blocks (vc_blocked_times, clinic-local date and HH:mm) overlapping the interval. */
  private async assertNotBlocked(manager: EntityManager, startAt: Date, endAt: Date) {
    const start = clinicParts(startAt);
    const end = clinicParts(endAt);
    const blocks = await manager.find(BlockedTimeEntity, { where: { date: new Date(`${start.date}T00:00:00Z`) } });
    if (blocks.some(block => overlaps(start.time, end.time, block.timeStart, block.timeEnd))) {
      policyError("TIME_BLOCKED", ReservationMessages.TIME_BLOCKED);
    }
  }

  /**
   * Under the employee's schedule applock, rejects an overlap with another CONFIRMED reservation of the same
   * employee, widened by RESERVATION_BUFFER_MINUTES on both sides:
   * existing.start_at < end + buffer AND existing.end_at > start - buffer (i.e. existing.end_at + buffer > start).
   * PENDING, CANCELLED, NO_SHOW and COMPLETED reservations do not occupy time.
   */
  private async reserveEmployeeSlot(manager: EntityManager, employeeId: string, startAt: Date, endAt: Date, excludeId?: string) {
    await acquireEmployeeScheduleLock(manager, employeeId);
    const buffer = (await this.settings.getNonNegativeInteger(SystemSettingCode.RESERVATION_BUFFER_MINUTES)) * 60_000;
    const query = manager.createQueryBuilder(ReservationEntity, "r")
      .where("r.employeeId = :employeeId", { employeeId })
      .andWhere("r.status = :confirmed", { confirmed: ReservationStatus.CONFIRMED })
      .andWhere("r.startAt < :latestStart", { latestStart: toDbUtc(new Date(endAt.getTime() + buffer)) })
      .andWhere("r.endAt > :earliestEnd", { earliestEnd: toDbUtc(new Date(startAt.getTime() - buffer)) });
    if (excludeId) query.andWhere("r.id <> :excludeId", { excludeId });
    if ((await query.getCount()) > 0) {
      throw new ConflictException({ statusCode: 409, code: "EMPLOYEE_UNAVAILABLE", message: ReservationMessages.EMPLOYEE_UNAVAILABLE });
    }
  }

  /** IN_PROGRESS or COMPLETED visit; a VOIDED visit does not hold the reservation (cancel, reschedule, no-show). */
  private async hasActiveVisit(manager: EntityManager, reservationId: string) {
    return (await manager.count(ClinicalVisitEntity, { where: { reservationId, status: In(ACTIVE_VISIT_STATUSES) } })) > 0;
  }

  // ---------------------------------------------------------------- clients and animals

  /**
   * Staff may book for another active client account (role from CLIENT_ROLE_ID); everyone else, and staff
   * booking for themselves, book as the client and need the CLIENT role.
   */
  private async validateAndGetClient(actor: Actor, user: UsersEntity, ownerId?: string): Promise<UsersEntity> {
    if (isStaff(actor) && ownerId && !sameId(ownerId, actor.id)) {
      const owner = await this.persistence.execute(() => this.usersRepository.findOne({ where: { id: ownerId } }));
      if (!owner || !owner.isActive || !(await this.membership.hasSystemRole(owner.id, SystemRole.CLIENT))) {
        throw new BadRequestException(ReservationMessages.INVALID_CLIENT);
      }
      return owner;
    }
    if (!actor.isClient) throw new BadRequestException(ReservationMessages.INVALID_CLIENT);
    return user;
  }

  private async validateAnimalOwnership(animalId: string, client: UsersEntity): Promise<AnimalEntity> {
    const animal = await this.persistence.execute(() => this.animalRepository.findOne({ where: { id: animalId }, relations: [AnimalRelation.Owner] }));
    if (!animal) throw new NotFoundException(ReservationMessages.ANIMAL_NOT_FOUND);
    if (!animal.owner || !sameId(animal.owner.id, client.id)) throw new BadRequestException(ReservationMessages.ANIMAL_OWNER_MISMATCH);
    return animal;
  }

  // ---------------------------------------------------------------- responses

  /** Reloads the committed reservation, sends the optional notification (failures never undo the change). */
  private async respond(id: string, actor: Actor, send?: (client: UsersEntity) => Promise<unknown>) {
    const reservation = await this.load(id);
    let notificationStatus: NotificationStatus = "not_requested";
    if (send) {
      try {
        await send(reservation.client);
        notificationStatus = "sent";
      } catch {
        this.logger.warn(`Reservation ${reservation.id} persisted; email delivery failed`);
        notificationStatus = "failed";
      }
    }
    return serializeReservation(Object.assign(reservation, { notificationStatus }), actor);
  }
}
