import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { EmailService } from "src/email/email.service";
import { AnimalEntity } from "../animal/entities/animal.entity";
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
import { acquireClinicClosuresLock, acquireEmployeeScheduleLock } from "./employee-schedule-lock";
import { overlappingBlocks } from "../blocked-times/blocked-time.queries";
import { assertFitsSchedule, findSchedulesValidOn } from "../employee-schedules/employee-schedule-policy";
import { ReservationEntity } from "./entities/reservation.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { ReservationHistoryService, reservationSnapshot } from "../reservation-history/reservation-history.service";
import { ReservationMessages } from "./reservation.messages";
import { assertTransition, clinicParts, policyError, validateReservationWindow } from "./reservation-policy";
import { ReservationRelation } from "./enums/reservation-relations.enum";
import { serializeReservation, serializeReservations } from "./reservation.serializer";
import { activeTutorExists, AnimalAccessService } from "../animal-owners/animal-access.service";
import { ClinicServiceEntity } from "../clinic-services/entities/clinic-service.entity";
import { isQualifiedForService } from "../clinic-services/clinic-service.projection";

type NotificationStatus = "sent" | "failed" | "not_requested";
const WRITE_LOCK = { mode: "pessimistic_write" } as const;
/** Shared lock held until commit (HOLDLOCK, ROWLOCK): compatible with other bookings, serialized with service writes. */
const SHARED_LOCK = { mode: "pessimistic_read" } as const;
/** Visits that count as an attendance; a VOIDED visit no longer blocks cancellation. */
const ACTIVE_VISIT_STATUSES = [ClinicalVisitStatus.IN_PROGRESS, ClinicalVisitStatus.COMPLETED];

/**
 * Reservation state machine and scheduling rules. Every state change runs in one transaction together with its
 * history event; operations that can make an employee's time occupied take the employee schedule applock
 * (sp_getapplock) before checking overlaps. Notifications are sent after commit.
 *
 * Lock order (UPDLOCK rows, then the applocks), never inverted by any flow:
 *   vc_reservations -> vc_animals -> vc_users (client) -> vc_services (shared, creation only) -> vc_employees
 *   -> [vc_employee_services read] -> clinic closures applock (Shared) -> employee schedule applock (Exclusive)
 *   -> [vc_employee_schedules, vc_blocked_times and overlapping vc_reservations reads] -> writes.
 * Block writes take the closures applock Exclusive (global block) or the profile and then the employee applock
 * (individual block); PUT /employees/:id/schedules takes the profile and then the employee applock. Applocks are always
 * the last locks of a chain and the closures applock always precedes an employee applock, so no cycle can form.
 * PUT /employees/:id/services follows the same order: the services it adds (shared, by id) -> vc_employees -> writes;
 * PATCH/DELETE /services/:id lock only the service row, so no cycle forms with either flow.
 * Creation, confirmation and reschedule lock the animal and the client account and re-check them (not deleted,
 * active), serializing with animal deletion and account deactivation/deletion, which lock those rows and then
 * read open reservations. Every flow that assigns or confirms an employee locks the employee profile, serializing
 * with termination/unavailability (PUT /api/vetcare/employees/:id) and account deactivation, which lock it and then read
 * the employee's open reservations. Those readers never lock reservations, so no cycle can form.
 *
 * Access: administrators see and manage everything; an active employee sees the reservations assigned to them;
 * the reservation's client (the responsible tutor, client_id) sees it and may cancel it; every active tutor (primary
 * or secondary) of the animal sees the animal's reservations (read only). A client_id keeps seeing that reservation
 * after leaving the animal (they remain its responsible client). Responses are projected per actor (serializeReservation).
 * Authorship (created_by = the actor of POST, immutable) grants no access: staff who book for a client only see the
 * reservation afterwards when it is assigned to them (or they are administrators).
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
    private readonly access: AnimalAccessService,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  // ---------------------------------------------------------------- reads

  /**
   * Paginated, filtered and always limited to the caller's scope. The createdBy filter narrows that scope only: a
   * non-administrator learns creator ids only when it is their own (see serializeReservation), so filtering by
   * another account returns an empty page instead of revealing who created the reservations they can see.
   */
  async list(query: ListReservationsQueryDto, actor: Actor) {
    if (query.createdBy && !actor.isAdmin && !sameId(query.createdBy, actor.id)) return [];
    const builder = this.reservationRepository.createQueryBuilder("reservation")
      .withDeleted()
      .leftJoinAndSelect("reservation.client", "client")
      .leftJoinAndSelect("reservation.employee", "employee")
      .leftJoinAndSelect("employee.user", "employeeUser")
      .leftJoinAndSelect("reservation.animal", "animal")
      .leftJoinAndSelect("reservation.service", "service");
    if (!actor.isAdmin) {
      const scopes = ["reservation.clientId = :actorId", activeTutorExists("reservation.animalId", "actorId")];
      if (actor.isEmployee && actor.employeeId) scopes.push("reservation.employeeId = :actorEmployeeId");
      builder.andWhere(`(${scopes.join(" OR ")})`, { actorId: actor.id, actorEmployeeId: actor.employeeId });
    }
    if (query.status) builder.andWhere("reservation.status = :status", { status: query.status });
    if (query.clientId) builder.andWhere("reservation.clientId = :clientId", { clientId: query.clientId });
    if (query.employeeId) builder.andWhere("reservation.employeeId = :employeeId", { employeeId: query.employeeId });
    if (query.createdBy) builder.andWhere("reservation.createdBy = :createdBy", { createdBy: query.createdBy });
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
    await this.requireReadAccess(actor, reservation);
    return serializeReservation(reservation, actor);
  }

  /** History is readable by whoever can read the reservation; third-party user ids are hidden from non-admins. */
  async getHistory(id: string, query: ListQueryDto, actor: Actor) {
    const reservation = await this.persistence.execute(() => this.reservationRepository.findOne({ where: { id } }));
    if (!reservation) throw applicationError(ErrorMetadata.NOT_FOUND, ReservationMessages.RESERVATION_NOT_FOUND);
    await this.requireReadAccess(actor, reservation);
    return this.history.list(reservation.id, query, actor);
  }

  /** Administrator; the client of the reservation; the active employee it is assigned to; an active tutor of the animal. */
  async canRead(actor: Actor, reservation: Pick<ReservationEntity, "clientId" | "employeeId" | "animalId">): Promise<boolean> {
    return actor.isAdmin || sameId(reservation.clientId, actor.id)
      || (actor.isEmployee && !!actor.employeeId && sameId(reservation.employeeId, actor.employeeId))
      || this.access.isActiveTutor(reservation.animalId, actor.id);
  }

  private async requireReadAccess(actor: Actor, reservation: Pick<ReservationEntity, "clientId" | "employeeId" | "animalId">) {
    if (!(await this.canRead(actor, reservation))) throw applicationError(ErrorMetadata.FORBIDDEN, "Access denied");
  }

  private async load(id: string): Promise<ReservationEntity> {
    const reservation = await this.persistence.execute(() => this.reservationRepository.findOne({
      where: { id }, withDeleted: true,
      relations: { [ReservationRelation.CLIENT]: true, [ReservationRelation.EMPLOYEE]: { user: true }, [ReservationRelation.ANIMAL]: true, [ReservationRelation.SERVICE]: true } }));
    if (!reservation) throw applicationError(ErrorMetadata.NOT_FOUND, ReservationMessages.RESERVATION_NOT_FOUND);
    return reservation;
  }

  // ---------------------------------------------------------------- writes

  /**
   * Always PENDING. Staff on the professional path may book for another client; only an administrator may
   * pre-assign an employee (CREATED + EMPLOYEE_ASSIGNED), matching PATCH /:id/employee. A personal booking (the
   * caller is the client) follows the client path.
   * The service (serviceId, required) must exist and be active; endAt = startAt + its durationMinutes, computed by the
   * server: an administrator may send a different endAt (override), anyone else only the computed value (400 otherwise).
   * The interval is then frozen in start_at/end_at (later duration changes never alter the reservation).
   */
  async create(dto: CreateReservationDto, actor: Actor) {
    const startAt = this.instant(dto.startAt);
    const requestedEnd = dto.endAt === undefined || dto.endAt === null ? undefined : this.instant(dto.endAt);
    const user = await this.persistence.execute(() => this.usersRepository.findOne({ where: { id: actor.id } }));
    if (!user) throw applicationError(ErrorMetadata.NOT_FOUND, ReservationMessages.USER_NOT_FOUND);
    const client = await this.validateAndGetClient(actor, user, dto.ownerId);
    const animal = await this.validateAnimalOwnership(dto.animalId, client);
    if (dto.employeeId && !actor.isAdmin) throw applicationError(ErrorMetadata.FORBIDDEN, ReservationMessages.EMPLOYEE_ASSIGNMENT_FORBIDDEN);

    const saved = await this.transaction(async manager => {
      await this.requireBookingParties(manager, animal.id, client.id, { requireOwnership: true });
      const service = await this.requireBookableService(manager, dto.serviceId, actor);
      const endAt = this.serviceEnd(startAt, service, requestedEnd, actor);
      validateReservationWindow(startAt, endAt);
      const employee = dto.employeeId ? await this.requireBookableEmployee(manager, dto.employeeId, startAt, service.id) : null;
      if (employee) await this.occupyEmployeeTime(manager, employee.id, startAt, endAt);
      else await this.assertNotBlocked(manager, startAt, endAt, null);
      const reservation = await manager.save(manager.create(ReservationEntity, {
        // Author = the authenticated actor (never from the body); differs from clientId when staff book for a client.
        animalId: animal.id, clientId: client.id, createdBy: actor.id, serviceId: service.id, employeeId: employee?.id ?? null, startAt, endAt,
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

    const start = clinicParts(saved.startAt);
    return this.respond(saved.id, actor, () => this.emailService.sendReservationCreatedEmail(
      client.email, client.name, start.date, start.time, clinicParts(saved.endAt).time));
  }

  /**
   * PENDING only; the employee must be bookable on the reservation date, qualified, and free under the applocks: within
   * their schedule, not blocked (clinic closure or individual block) and without an overlapping CONFIRMED reservation.
   */
  async assignEmployee(id: string, dto: AssignReservationEmployeeDto, actor: Actor) {
    await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      if (reservation.status !== ReservationStatus.PENDING) {
        throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.ASSIGN_REQUIRES_PENDING, undefined, { code: "INVALID_TRANSITION" });
      }
      if (sameId(reservation.employeeId, dto.employeeId)) throw applicationError(ErrorMetadata.ALREADY_EXISTS, ReservationMessages.EMPLOYEE_ALREADY_ASSIGNED);
      const employee = await this.requireBookableEmployee(manager, dto.employeeId, reservation.startAt, reservation.serviceId);
      await this.occupyEmployeeTime(manager, employee.id, reservation.startAt, reservation.endAt, reservation.id);
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

  /** PENDING -> CONFIRMED: a bookable employee, a future slot inside their schedule, no block and no overlap under the applocks. */
  async confirm(id: string, dto: ReservationReasonDto, actor: Actor) {
    const confirmed = await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      assertTransition(reservation.status, ReservationStatus.CONFIRMED);
      if (!reservation.employeeId) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.EMPLOYEE_REQUIRED, undefined, { code: "EMPLOYEE_REQUIRED" });
      validateReservationWindow(reservation.startAt, reservation.endAt);
      await this.requireBookingParties(manager, reservation.animalId, reservation.clientId);
      const employee = await this.requireBookableEmployee(manager, reservation.employeeId, reservation.startAt, reservation.serviceId);
      await this.occupyEmployeeTime(manager, employee.id, reservation.startAt, reservation.endAt, reservation.id);
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
   * Without endAt the reservation keeps its own (frozen) duration, end_at - start_at, not the current catalog duration;
   * the service is not re-read, so an inactive service does not block it. The assigned employee must still be qualified.
   */
  async reschedule(id: string, dto: RescheduleReservationDto, actor: Actor) {
    const startAt = this.instant(dto.startAt);
    const requestedEnd = dto.endAt === undefined || dto.endAt === null ? undefined : this.instant(dto.endAt);
    if (requestedEnd) validateReservationWindow(startAt, requestedEnd);
    let endAt = requestedEnd as Date;
    const previous = await this.transaction(async manager => {
      const reservation = await this.lockReservation(manager, id);
      if (![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(reservation.status)) {
        throw applicationError(ErrorMetadata.CONFLICT, `Cannot reschedule a ${reservation.status} reservation`, undefined, { code: "INVALID_TRANSITION" });
      }
      if (await this.hasActiveVisit(manager, reservation.id)) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.VISIT_STARTED);
      endAt = requestedEnd ?? new Date(startAt.getTime() + (reservation.endAt.getTime() - reservation.startAt.getTime()));
      validateReservationWindow(startAt, endAt);
      if (reservation.startAt.getTime() === startAt.getTime() && reservation.endAt.getTime() === endAt.getTime()) {
        policyError("RESCHEDULE_UNCHANGED", ReservationMessages.RESCHEDULE_UNCHANGED);
      }
      await this.requireBookingParties(manager, reservation.animalId, reservation.clientId);
      if (reservation.employeeId) {
        const employee = await this.requireBookableEmployee(manager, reservation.employeeId, startAt, reservation.serviceId);
        await this.occupyEmployeeTime(manager, employee.id, startAt, endAt, reservation.id);
      } else {
        await this.assertNotBlocked(manager, startAt, endAt, null);
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
      if (!actor.isAdmin && !sameId(reservation.clientId, actor.id)) throw applicationError(ErrorMetadata.FORBIDDEN, "Access denied");
      assertTransition(reservation.status, ReservationStatus.CANCELLED);
      if (!actor.isAdmin && Date.now() >= reservation.startAt.getTime()) {
        throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.CANCEL_AFTER_START, undefined, { code: "CANCEL_AFTER_START" });
      }
      if (await this.hasActiveVisit(manager, reservation.id)) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.VISIT_STARTED);
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
        throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.NO_SHOW_TOO_EARLY, undefined, { code: "NO_SHOW_TOO_EARLY" });
      }
      if (await this.hasActiveVisit(manager, reservation.id)) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.VISIT_STARTED);
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

  /**
   * Service of a new reservation, read with a shared lock (HOLDLOCK) until commit after the animal and client locks:
   * a concurrent deactivation or deletion (which takes UPDLOCK on the service row) either commits first and is seen
   * here, or waits for this reservation. 404 when missing; when inactive, 409 SERVICE_INACTIVE for administrators and
   * 404 for everyone else (inactive services are not revealed, as in GET /services/:id). Only creation reads it:
   * assign/confirm/reschedule of existing reservations are never blocked by an inactive service.
   */
  private async requireBookableService(manager: EntityManager, serviceId: string, actor: Actor): Promise<ClinicServiceEntity> {
    const service = await manager.findOne(ClinicServiceEntity, { where: { id: serviceId }, lock: SHARED_LOCK });
    if (!service || (!service.isActive && !actor.isAdmin)) throw applicationError(ErrorMetadata.NOT_FOUND, ReservationMessages.SERVICE_NOT_FOUND);
    if (!service.isActive) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.SERVICE_INACTIVE, undefined, { code: "SERVICE_INACTIVE" });
    return service;
  }

  /**
   * endAt of a new reservation: startAt + durationMinutes. A requested endAt equal to the computed one is accepted from
   * anyone; a different one only from an administrator (override), 400 END_AT_MISMATCH otherwise.
   */
  private serviceEnd(startAt: Date, service: ClinicServiceEntity, requestedEnd: Date | undefined, actor: Actor): Date {
    const computed = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    if (!requestedEnd || requestedEnd.getTime() === computed.getTime()) return computed;
    if (!actor.isAdmin) policyError("END_AT_MISMATCH", ReservationMessages.endAtMismatch(service.durationMinutes, computed.toISOString()));
    return requestedEnd;
  }

  /** Reads and locks the reservation row (UPDLOCK) for the rest of the transaction; relations are not locked. */
  private async lockReservation(manager: EntityManager, id: string): Promise<ReservationEntity> {
    const reservation = await manager.findOne(ReservationEntity, { where: { id }, lock: WRITE_LOCK });
    if (!reservation) throw applicationError(ErrorMetadata.NOT_FOUND, ReservationMessages.RESERVATION_NOT_FOUND);
    return reservation;
  }

  /**
   * Bookable profile (available, active account, not terminated by the reservation's clinic date). The profile row
   * is locked (UPDLOCK) until commit, serializing with termination/unavailability and account deactivation; the
   * account is read in a separate statement after the lock is granted, so it reflects any change committed by the
   * transaction that held the lock.
   * With a service (reservations without service_id, created before the catalog, are not checked), the profile must
   * hold the qualification (vc_employee_services), read after the profile lock and before the applock: PUT
   * /employees/:id/services changes qualifications under the same profile lock (400 EMPLOYEE_NOT_QUALIFIED otherwise).
   */
  private async requireBookableEmployee(manager: EntityManager, employeeId: string, startAt: Date, serviceId: string | null = null) {
    const employee = await manager.findOne(EmployeeEntity, { where: { id: employeeId }, lock: WRITE_LOCK });
    const user = employee ? await manager.findOne(UsersEntity, { where: { id: employee.userId } }) : null;
    const candidate = employee && user ? Object.assign(employee, { user }) : null;
    if (!isBookableEmployee(candidate, clinicParts(startAt).date)) throw applicationError(ErrorMetadata.INVALID_VALUE, ReservationMessages.INVALID_EMPLOYEE);
    if (serviceId && !(await isQualifiedForService(manager, candidate.id, serviceId))) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, ReservationMessages.EMPLOYEE_NOT_QUALIFIED, undefined, { code: "EMPLOYEE_NOT_QUALIFIED" });
    }
    return candidate;
  }

  /**
   * Locks (UPDLOCK) and re-checks, inside the transaction, the animal (exists, not soft-deleted) and the client
   * account (active, not soft-deleted): 409 ANIMAL_UNAVAILABLE / CLIENT_INACTIVE otherwise. Soft-deleted rows are
   * excluded by findOne. On creation (requireOwnership) the client must also still be an active tutor of the animal.
   */
  private async requireBookingParties(manager: EntityManager, animalId: string, clientId: string, options: { requireOwnership?: boolean } = {}) {
    const animal = await manager.findOne(AnimalEntity, { where: { id: animalId }, lock: WRITE_LOCK });
    if (!animal) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.ANIMAL_UNAVAILABLE, undefined, { code: "ANIMAL_UNAVAILABLE" });
    const client = await manager.findOne(UsersEntity, { where: { id: clientId }, lock: WRITE_LOCK });
    if (!client?.isActive) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.CLIENT_INACTIVE, undefined, { code: "CLIENT_INACTIVE" });
    if (options.requireOwnership) {
      // Creation: the tutorship pre-check ran before the transaction. With the animal row locked (every tutorship
      // change locks it first), re-read vc_animal_owners; a plain read after the existing locks keeps the lock order.
      if (!(await this.access.isActiveTutor(animalId, clientId, manager))) throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.ANIMAL_OWNER_MISMATCH, undefined, { code: "ANIMAL_OWNER_MISMATCH" });
    }
  }

  /**
   * 409 TIME_BLOCKED when a block intersects the interval: start_at < end AND end_at > start AND (employee_id IS NULL OR
   * employee_id = employeeId); without an employee only clinic-wide closures count. Flows that occupy an employee's time
   * call it under the closures (Shared) and employee applocks (occupyEmployeeTime), so a concurrent block write either
   * committed before (and is seen) or waits for this transaction. Without an employee (a PENDING reservation that occupies
   * nothing) it is an early, unlocked check; confirmation checks again under the locks.
   */
  private async assertNotBlocked(manager: EntityManager, startAt: Date, endAt: Date, employeeId: string | null) {
    if ((await overlappingBlocks(manager, startAt, endAt, employeeId ? [employeeId] : []).getCount()) > 0) {
      throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.TIME_BLOCKED, undefined, { code: "TIME_BLOCKED" });
    }
  }

  /**
   * Makes [startAt, endAt) occupied time of the employee (create with employee, assign, confirm, reschedule). Locks, in the
   * fixed order: clinic closures applock (Shared; a global block holds it Exclusive) -> employee schedule applock
   * (Exclusive). Then, under both: the interval must fit one period of the employee's schedule valid on that date (or
   * CLINIC_POLICY when the employee has no schedule valid on it; 409 OUTSIDE_EMPLOYEE_SCHEDULE), must not intersect a
   * block (409 TIME_BLOCKED) and must not overlap another CONFIRMED reservation of the employee, widened by
   * RESERVATION_BUFFER_MINUTES on both sides:
   * existing.start_at < end + buffer AND existing.end_at > start - buffer (i.e. existing.end_at + buffer > start).
   * PENDING, CANCELLED, NO_SHOW and COMPLETED reservations do not occupy time.
   */
  private async occupyEmployeeTime(manager: EntityManager, employeeId: string, startAt: Date, endAt: Date, excludeId?: string) {
    await acquireClinicClosuresLock(manager, "Shared");
    await acquireEmployeeScheduleLock(manager, employeeId);
    assertFitsSchedule(await findSchedulesValidOn(manager, [employeeId], clinicParts(startAt).date), startAt, endAt);
    await this.assertNotBlocked(manager, startAt, endAt, employeeId);
    const buffer = (await this.settings.getNonNegativeInteger(SystemSettingCode.RESERVATION_BUFFER_MINUTES)) * 60_000;
    const query = manager.createQueryBuilder(ReservationEntity, "r")
      .where("r.employeeId = :employeeId", { employeeId })
      .andWhere("r.status = :confirmed", { confirmed: ReservationStatus.CONFIRMED })
      .andWhere("r.startAt < :latestStart", { latestStart: toDbUtc(new Date(endAt.getTime() + buffer)) })
      .andWhere("r.endAt > :earliestEnd", { earliestEnd: toDbUtc(new Date(startAt.getTime() - buffer)) });
    if (excludeId) query.andWhere("r.id <> :excludeId", { excludeId });
    if ((await query.getCount()) > 0) {
      throw applicationError(ErrorMetadata.CONFLICT, ReservationMessages.EMPLOYEE_UNAVAILABLE, undefined, { code: "EMPLOYEE_UNAVAILABLE" });
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
        throw applicationError(ErrorMetadata.INVALID_VALUE, ReservationMessages.INVALID_CLIENT);
      }
      return owner;
    }
    if (!actor.isClient) throw applicationError(ErrorMetadata.INVALID_VALUE, ReservationMessages.INVALID_CLIENT);
    return user;
  }

  /** Pre-check (400): the client (the responsible tutor) must be an active tutor, primary or secondary, of the animal. */
  private async validateAnimalOwnership(animalId: string, client: UsersEntity): Promise<AnimalEntity> {
    const animal = await this.persistence.execute(() => this.animalRepository.findOne({ where: { id: animalId } }));
    if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, ReservationMessages.ANIMAL_NOT_FOUND);
    if (!(await this.access.isActiveTutor(animal.id, client.id))) throw applicationError(ErrorMetadata.INVALID_VALUE, ReservationMessages.ANIMAL_OWNER_MISMATCH);
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
