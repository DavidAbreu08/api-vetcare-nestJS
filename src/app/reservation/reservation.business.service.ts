import { ReservationMessages } from "./reservation.messages";
import { PersistenceService } from "../core/persistence/persistence.service";
import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Actor, isStaff, requireOwnerOrAdmin, sameId } from "../core/authorization";
import { InjectRepository } from "@nestjs/typeorm";
import { ReservationEntity } from "./entities/reservation.entity";
import { FindOptionsWhere, In, Repository } from "typeorm";
import { UsersEntity } from "../users/entities/users.entity";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { AnimalRelation } from "../animal/enums/animal-relation.enum";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { SystemRole } from "../core/enums/system-role.enum";
import { RoleMembershipService } from "../roles/role-membership.service";
import { EmployeesService } from "../employees/employees.service";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { UpdateReservationStatusDto } from "./dto/update-reservation.dto";
import { ConfirmRescheduleDto } from "./dto/confirm-reschedule.dto";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";
import { ConfirmPendingDto } from "./dto/confirm-pending.dto";
import { TimeUtilsService } from "./time-utils.service";
import { EmailService } from "src/email/email.service";
import { assertTransition, CLINIC_POLICY, dateKey, minutes, overlaps, policyError, validateInterval } from './reservation-policy';
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";
import { ReservationRelation } from "./reservation-relations.enum";
import { serializeReservation, serializeReservations } from "./reservation.serializer";

/**
 * Responses are projected per actor (see serializeReservation): related accounts are reduced for
 * non-administrators and never include password hashes.
 */
@Injectable()
export class ReservationBusinessService {
  async getAll(query: ListReservationsQueryDto, actor: Actor) {
    const where: FindOptionsWhere<ReservationEntity> = {};
    if (query.status) where.status = query.status;
    if (query.clientId) where.client = { id: query.clientId };
    if (query.employeeId) where.employee = { id: query.employeeId };
    if (query.animalId) where.animalId = query.animalId;
    if (query.date) where.date = new Date(dateKey(query.date) + "T00:00:00Z");
    return serializeReservations(await this.historicalAnimals(await this.reservationRepository.find({
      where, skip: query.skip, take: query.take,
      relations: [ReservationRelation.CLIENT, ReservationRelation.EMPLOYEE, ReservationRelation.ANIMAL],
      order: { date: "ASC", timeStart: "ASC", id: "ASC" },
    })), actor);
  }

  async getById(id: string, actor: Actor) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: [ReservationRelation.CLIENT, ReservationRelation.EMPLOYEE, ReservationRelation.ANIMAL],
    });
    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);
    requireOwnerOrAdmin(actor, reservation.client?.id ?? "");
    await this.historicalAnimals([reservation]);
    return serializeReservation(reservation, actor);
  }

  /** Preserve appointment history: DELETE cancels through the existing transition rules. */
  cancel(id: string, actor: Actor) {
    return this.updateReservationStatus(id, { status: ReservationStatus.CANCELLED }, actor);
  }

  private readonly logger = new Logger(ReservationBusinessService.name);

  private async notify(reservation: ReservationEntity, send: () => Promise<unknown>) {
    try {
      await send();
      return Object.assign(reservation, { notificationStatus: 'sent' as const });
    } catch {
      this.logger.warn(`Reservation ${reservation.id} persisted; email delivery failed`);
      return Object.assign(reservation, { notificationStatus: 'failed' as const });
    }
  }

  private async validateAvailability(date: Date, start: string, end: string, employeeId?: string, excludeId?: string) {
    validateInterval(date, start, end);
    if (employeeId) await this.validateAndAssignEmployee(employeeId, date);
    if (await this.isTimeBlocked(date, start, end)) policyError('TIME_BLOCKED', ReservationMessages.TIME_BLOCKED);
    if (employeeId && await this.isEmployeeReserved(employeeId, date, start, end, excludeId)) {
      throw new ConflictException({ statusCode: 409, code: 'EMPLOYEE_UNAVAILABLE', message: ReservationMessages.EMPLOYEE_UNAVAILABLE });
    }
  }

  constructor(
    private readonly persistence: PersistenceService,
    private readonly timeUtils: TimeUtilsService,

    private readonly emailService: EmailService,

    @InjectRepository(ReservationEntity)
    private readonly reservationRepository: Repository<ReservationEntity>,

    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,

    @InjectRepository(AnimalEntity)
    private readonly animalRepository: Repository<AnimalEntity>,

    @InjectRepository(BlockedTimeEntity)
    private readonly blockedTimeRepository: Repository<BlockedTimeEntity>,

    private readonly membership: RoleMembershipService,

    private readonly employees: EmployeesService,
  ) {}

  /**
   * Staff may book for another active client account (role from CLIENT_ROLE_ID); everyone else, and staff
   * booking for themselves, book as the client and need the CLIENT role.
   */
  private async validateAndGetClient(
    actor: Actor,
    user: UsersEntity,
    ownerId?: string
  ): Promise<UsersEntity> {
    if (isStaff(actor) && ownerId && !sameId(ownerId, actor.id)) {
      const owner = await this.usersRepository.findOne({
        where: { id: ownerId },
      });
      if (!owner || !owner.isActive || !(await this.membership.hasSystemRole(owner.id, SystemRole.CLIENT))) {
        throw new BadRequestException(ReservationMessages.INVALID_CLIENT);
      }
      return owner;
    }
    if (!actor.isClient) throw new BadRequestException(ReservationMessages.INVALID_CLIENT);
    return user;
  }

  private async validateAnimalOwnership(
    animalId: string,
    client: UsersEntity
  ): Promise<AnimalEntity> {
    const animal = await this.animalRepository.findOne({
      where: { id: animalId },
      relations: [AnimalRelation.Owner],
    });
    if (!animal) throw new NotFoundException(ReservationMessages.ANIMAL_NOT_FOUND);
    if (!animal.owner || !sameId(animal.owner.id, client.id)) {
      throw new BadRequestException(
        ReservationMessages.ANIMAL_OWNER_MISMATCH
      );
    }
    return animal;
  }

  /**
   * The assigned user needs a bookable employee profile (available for bookings, active account,
   * termination date absent or after today and the reservation date), independently of roles.
   */
  private async validateAndAssignEmployee(
    employeeId: string,
    date?: Date | string
  ): Promise<UsersEntity> {
    const employee = await this.employees.findBookableUser(employeeId, date);
    if (!employee) {
      throw new BadRequestException(ReservationMessages.INVALID_EMPLOYEE);
    }
    return employee;
  }

  /**
   * Explicit employee, otherwise staff booking for a client are self-assigned only when their own profile
   * is bookable. A personal booking (the actor is the client) never self-assigns.
   */
  private async determineAssignedEmployee(
    employeeId: string | undefined,
    actor: Actor,
    date: Date | string,
    personal: boolean
  ): Promise<UsersEntity | null> {
    if (employeeId) {
      return this.validateAndAssignEmployee(employeeId, date);
    }
    if (!personal && isStaff(actor) && actor.employeeId) {
      return this.employees.findBookableUser(actor.id, date);
    }
    return null;
  }

  /**
   * Staff bookings for a client are confirmed directly when an employee is assigned; personal bookings
   * (staff booking for their own animals as clients) and client bookings await confirmation.
   */
  private determineReservationStatus(actor: Actor, employee: UsersEntity | null, personal: boolean): ReservationStatus {
    return !personal && isStaff(actor) && employee
      ? ReservationStatus.CONFIRMED
      : ReservationStatus.PENDING;
  }

  private async isTimeBlocked(
    date: Date,
    timeStart: string,
    timeEnd: string
  ): Promise<boolean> {
    const blockedTimes = await this.blockedTimeRepository.find({
      where: { date },
    });

    return blockedTimes.some(blocked => overlaps(timeStart, timeEnd, blocked.timeStart, blocked.timeEnd));
  }

  private async handleReschedule(
    reservation: ReservationEntity,
    dto: UpdateReservationStatusDto
  ): Promise<void> {
    const newDate = new Date(dateKey(dto.newDate ?? reservation.date) + "T00:00:00Z");
    const newTimeStart = dto.newTimeStart ?? reservation.timeStart;
    const newTimeEnd = dto.newTimeEnd ?? reservation.timeEnd;

    await this.validateAvailability(newDate, newTimeStart, newTimeEnd,
      dto.employeeId ?? reservation.employee?.id, reservation.id);

    // Update the reservation times
    reservation.date = newDate;
    reservation.timeStart = newTimeStart;
    reservation.timeEnd = newTimeEnd;
    reservation.start = this.timeUtils.combineDateAndTime(
      newDate,
      newTimeStart
    );
    reservation.end = this.timeUtils.combineDateAndTime(newDate, newTimeEnd);
  }

  private async isEmployeeReserved(
    employeeId: string,
    date: Date,
    timeStart: string,
    timeEnd: string,
    excludeReservationId?: string
  ): Promise<boolean> {
    const bufferMinutes = CLINIC_POLICY.bufferMinutes;

    const query = this.reservationRepository
      .createQueryBuilder("r")
      .where("r.employee_id = :employeeId", { employeeId })
      .andWhere("r.date = :date", { date })
      .andWhere("r.status IN (:...statuses)", {
        statuses: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING, ReservationStatus.RESCHEDULED],
      })
      .andWhere(
        `
            (r.timeStart < :bufferedEnd AND r.timeEnd > :bufferedStart)
        `,
        {
          bufferedStart: `${String(Math.floor(Math.max(0, minutes(timeStart) - bufferMinutes) / 60)).padStart(2, '0')}:${String(Math.max(0, minutes(timeStart) - bufferMinutes) % 60).padStart(2, '0')}`,
          bufferedEnd: `${String(Math.floor(Math.min(1439, minutes(timeEnd) + bufferMinutes) / 60)).padStart(2, '0')}:${String(Math.min(1439, minutes(timeEnd) + bufferMinutes) % 60).padStart(2, '0')}`,
        }
      );

    if (excludeReservationId) {
      query.andWhere("r.id != :excludeId", { excludeId: excludeReservationId });
    }

    return (await query.getCount()) > 0;
  }

  async createReservation(dto: CreateReservationDto, actor: Actor) {

    const user = await this.usersRepository.findOne({ where: { id: actor.id } });
    if (!user) throw new NotFoundException(ReservationMessages.USER_NOT_FOUND);

    // Create datetime objects for database storage
    const startDateTime = this.timeUtils.combineDateAndTime(
      dto.date,
      dto.timeStart
    );
    const endDateTime = this.timeUtils.combineDateAndTime(
      dto.date,
      dto.timeEnd
    );

    // Get client and validate animal ownership
    const client = await this.validateAndGetClient(actor, user, dto.ownerId);
    const animal = await this.validateAnimalOwnership(dto.animalId, client);
    const personal = sameId(client.id, actor.id);

    // Determine assigned employee
    const assignedEmployee = await this.determineAssignedEmployee(
      dto.employeeId,
      actor,
      dto.date,
      personal
    );

    await this.validateAvailability(dto.date, dto.timeStart, dto.timeEnd, assignedEmployee?.id);

    // Create and save the reservation
    const reservation = this.reservationRepository.create({
      date: new Date(dateKey(dto.date) + "T00:00:00Z"),
      timeStart: dto.timeStart,
      timeEnd: dto.timeEnd,
      start: startDateTime,
      end: endDateTime,
      reason: dto.reason,
      name: dto.name, description: dto.description, notes: dto.notes,
      client,
      animal,
      employee: assignedEmployee,
      status: this.determineReservationStatus(actor, assignedEmployee, personal),
    });

    const savedReservation = await this.persistence.execute(() => this.reservationRepository.save(reservation));

    // Notificação: Reserva criada e será analisada pelo veterinário
    return serializeReservation(await this.notify(savedReservation, () => this.emailService.sendReservationCreatedEmail(
      client.email,
      client.name,
      dateKey(dto.date),
      dto.timeStart,
      dto.timeEnd
    )), actor);
  }

  async updateReservationStatus(id: string, dto: UpdateReservationStatusDto, actor: Actor) {
    return serializeReservation(await this.applyStatusUpdate(id, dto), actor);
  }

  private async applyStatusUpdate(id: string, dto: UpdateReservationStatusDto) {
    // Find the existing reservation
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: [ReservationRelation.CLIENT, ReservationRelation.EMPLOYEE],
    });
    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);

    const changesTime = !!(dto.newDate || dto.newTimeStart || dto.newTimeEnd);
    const nextStatus = dto.status ?? (changesTime ? ReservationStatus.RESCHEDULED : reservation.status);
    if (nextStatus !== reservation.status || changesTime ||
        (dto.employeeId && [ReservationStatus.CANCELLED, ReservationStatus.COMPLETED].includes(reservation.status))) {
      assertTransition(reservation.status, nextStatus);
    }
    if (changesTime && nextStatus !== ReservationStatus.RESCHEDULED) {
      policyError('INVALID_TRANSITION', ReservationMessages.RESCHEDULE_REQUIRED);
    }

    // Validate and assign employee if specified
    if (dto.employeeId) {
      reservation.employee = await this.validateAndAssignEmployee(
        dto.employeeId,
        dto.newDate ?? reservation.date
      );
    }

    // Guardar dados antigos para email de reagendamento
    const oldDate = dateKey(reservation.date);
    const oldTimeStart = reservation.timeStart;
    const oldTimeEnd = reservation.timeEnd;

    // Handle date/time changes
    if (changesTime) {
      await this.handleReschedule(reservation, dto);
    } else if ((nextStatus === ReservationStatus.CONFIRMED && nextStatus !== reservation.status) || (dto.employeeId && [ReservationStatus.CONFIRMED, ReservationStatus.RESCHEDULED].includes(nextStatus))) {
      if (!reservation.employee) policyError('EMPLOYEE_REQUIRED', ReservationMessages.EMPLOYEE_REQUIRED);
      await this.validateAvailability(reservation.date, reservation.timeStart, reservation.timeEnd, reservation.employee.id, reservation.id);
    }

    // Update status and notes
    if (dto.name !== undefined) reservation.name = dto.name;
    if (dto.description !== undefined) reservation.description = dto.description;
    if (dto.notes !== undefined) reservation.notes = dto.notes;
    reservation.status = nextStatus;
    reservation.rescheduleNote = dto.rescheduleNote ?? reservation.rescheduleNote ?? "";

    const updatedReservation =
      await this.persistence.execute(() => this.reservationRepository.save(reservation));

    // Notificações por email
    if (nextStatus === ReservationStatus.RESCHEDULED) {
      return this.notify(updatedReservation, () => this.emailService.sendReservationRescheduledEmail(
        reservation.client.email,
        reservation.client.name,
        oldDate,
        oldTimeStart,
        oldTimeEnd,
        dateKey(reservation.date),
        reservation.timeStart,
        reservation.timeEnd,
        reservation.rescheduleNote
      ));
    }

    if (dto.status === ReservationStatus.CANCELLED) {
      return this.notify(updatedReservation, () => this.emailService.sendReservationCancelledEmail(
        reservation.client.email, reservation.client.name, dateKey(reservation.date), reservation.rescheduleNote));
    }
    if (dto.status === ReservationStatus.CONFIRMED) {
      return this.notify(updatedReservation, () => this.emailService.sendReservationConfirmedEmail(
        reservation.client.email, reservation.client.name, dateKey(reservation.date),
        reservation.timeStart, reservation.timeEnd, reservation.rescheduleNote));
    }
    return Object.assign(updatedReservation, { notificationStatus: 'not_requested' as const });
  }

  private async historicalAnimals(reservations: ReservationEntity[]) {
    for (const reservation of reservations) {
      if (!reservation.animal && reservation.animalId) {
        reservation.animal = (await this.animalRepository.findOne({ where: { id: reservation.animalId }, withDeleted: true }))!;
      }
    }
    return reservations;
  }

  async findAllReservations(actor: Actor) {
    return serializeReservations(await this.historicalAnimals(await this.reservationRepository.find({
      relations: [ReservationRelation.CLIENT, ReservationRelation.EMPLOYEE, ReservationRelation.ANIMAL],
      order: { date: "ASC", timeStart: "ASC" },
    })), actor);
  }

  /** The caller's own reservations as client. */
  async findByClient(actor: Actor) {
    return serializeReservations(await this.historicalAnimals(await this.reservationRepository.find({
      where: { client: { id: actor.id } },
      relations: [ReservationRelation.ANIMAL, ReservationRelation.EMPLOYEE],
      order: { date: "DESC" },
    })), actor);
  }

  /** Reservations assigned to the caller. */
  async findByEmployee(actor: Actor) {
    if (!(await this.employees.hasProfile(actor.id))) {
      throw new NotFoundException(ReservationMessages.EMPLOYEE_NOT_FOUND);
    }

    return serializeReservations(await this.historicalAnimals(await this.reservationRepository.find({
      where: { employee: { id: actor.id } },
      relations: [ReservationRelation.CLIENT, ReservationRelation.ANIMAL],
      order: { date: "ASC", timeStart: "ASC" },
    })), actor);
  }

  async confirmPendingReservation(id: string, dto: ConfirmPendingDto, actor: Actor) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: [ReservationRelation.CLIENT],
    });

    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException(
        ReservationMessages.RESERVATION_NOT_PENDING
      );
    }

    if (![ReservationStatus.CONFIRMED].includes(dto.status)) {
      throw new BadRequestException(ReservationMessages.INVALID_CONFIRMATION_STATUS);
    }

    if (dto.employeeId) {
      const employee = await this.validateAndAssignEmployee(dto.employeeId, reservation.date);

      await this.validateAvailability(reservation.date, reservation.timeStart, reservation.timeEnd, employee.id, reservation.id);
      reservation.employee = employee;
      reservation.status = dto.status;
      reservation.rescheduleNote = dto.confirmationNote ?? " ";
      const updatedReservation =
        await this.persistence.execute(() => this.reservationRepository.save(reservation));

      // Enviar email de confirmação
      return serializeReservation(await this.notify(updatedReservation, () => this.emailService.sendReservationConfirmedEmail(
        reservation.client.email,
        reservation.client.name,
        dateKey(reservation.date),
        reservation.timeStart,
        reservation.timeEnd,
        reservation.rescheduleNote
      )), actor);
    }

    throw new BadRequestException(
      ReservationMessages.PENDING_EMPLOYEE_REQUIRED
    );
  }

  async confirmRescheduledReservation(id: string, dto: ConfirmRescheduleDto, actor: Actor) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: [ReservationRelation.EMPLOYEE, ReservationRelation.CLIENT],
    });

    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);

    requireOwnerOrAdmin(actor, reservation.client.id);

    if (reservation.status !== ReservationStatus.RESCHEDULED) {
      throw new BadRequestException(
        ReservationMessages.RESERVATION_NOT_RESCHEDULED
      );
    }

    if (
      ![ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED].includes(
        dto.status
      )
    ) {
      throw new BadRequestException(
        ReservationMessages.INVALID_RESCHEDULE_STATUS
      );
    }

    if (dto.status === ReservationStatus.CONFIRMED) {
      if (!reservation.employee) {
        throw new BadRequestException(
          ReservationMessages.EMPLOYEE_NOT_ASSIGNED
        );
      }

      await this.validateAvailability(reservation.date, reservation.timeStart, reservation.timeEnd, reservation.employee.id, reservation.id);
    }

    reservation.status = dto.status;
    reservation.rescheduleNote = dto.confirmationNote ?? "";

    const saved = await this.persistence.execute(() => this.reservationRepository.save(reservation));
    if (dto.status === ReservationStatus.CONFIRMED) {
      return serializeReservation(await this.notify(saved, () => this.emailService.sendReservationConfirmedEmail(
        reservation.client.email, reservation.client.name, dateKey(reservation.date),
        reservation.timeStart, reservation.timeEnd, reservation.rescheduleNote)), actor);
    }
    return serializeReservation(await this.notify(saved, () => this.emailService.sendReservationCancelledEmail(
      reservation.client.email, reservation.client.name, dateKey(reservation.date), reservation.rescheduleNote)), actor);
  }

  async findByEmployeeAndDate(
    employeeId: string,
    date: Date,
    actor: Actor
  ) {
    return serializeReservations(await this.historicalAnimals(await this.reservationRepository.find({
      where: {
        employee: { id: employeeId },
        date,
        status: In([ReservationStatus.CONFIRMED]),
      },
      relations: [ReservationRelation.CLIENT, ReservationRelation.ANIMAL],
      order: { timeStart: "ASC" },
    })), actor);
  }

  async rejectRescheduledReservation(id: string, actor: Actor, note?: string) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: [ReservationRelation.CLIENT, ReservationRelation.EMPLOYEE],
    });

    if (!reservation) throw new NotFoundException(ReservationMessages.RESERVATION_NOT_FOUND);

    requireOwnerOrAdmin(actor, reservation.client.id);

    if (reservation.status !== ReservationStatus.RESCHEDULED) {
      throw new BadRequestException(
        ReservationMessages.RESERVATION_NOT_RESCHEDULED
      );
    }

    reservation.status = ReservationStatus.CANCELLED;
    reservation.rescheduleNote = note ?? "";

    const updatedReservation =
      await this.persistence.execute(() => this.reservationRepository.save(reservation));

    // Enviar email de rejeição/cancelamento ao cliente
    return serializeReservation(await this.notify(updatedReservation, () => this.emailService.sendReservationCancelledEmail(
      reservation.client.email,
      reservation.client.name,
      dateKey(reservation.date),
      note
    )), actor);
  }
}
