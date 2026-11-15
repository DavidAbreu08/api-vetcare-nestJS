import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Actor, requireOwnerOrAdmin } from "../core/authorization";
import { InjectRepository } from "@nestjs/typeorm";
import { ReservationEntity } from "./entities/reservation.entity";
import { In, Repository } from "typeorm";
import { UsersEntity } from "../users/entities/users.entity";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { Role } from "../core/enums/role.enum";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { UpdateReservationStatusDto } from "./dto/update-reservation.dto";
import { ConfirmRescheduleDto } from "./dto/confirm-reschedule.dto";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";
import { ConfirmPendingDto } from "./dto/confirm-pending.dto";
import { TimeUtilsService } from "./time-utils.service";
import { EmailService } from "src/email/email.service";
import { assertTransition, CLINIC_POLICY, dateKey, minutes, overlaps, policyError, validateInterval } from './reservation-policy';

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);

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
    if (employeeId) await this.validateAndAssignEmployee(employeeId);
    if (await this.isTimeBlocked(date, start, end)) policyError('TIME_BLOCKED', 'This time slot is blocked');
    if (employeeId && await this.isEmployeeReserved(employeeId, date, start, end, excludeId)) {
      throw new ConflictException({ statusCode: 409, code: 'EMPLOYEE_UNAVAILABLE', message: 'Employee is already booked during this time' });
    }
  }

  constructor(
    private readonly timeUtils: TimeUtilsService,

    private readonly emailService: EmailService,

    @InjectRepository(ReservationEntity)
    private readonly reservationRepository: Repository<ReservationEntity>,

    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,

    @InjectRepository(AnimalEntity)
    private readonly animalRepository: Repository<AnimalEntity>,

    @InjectRepository(BlockedTimeEntity)
    private readonly blockedTimeRepository: Repository<BlockedTimeEntity>
  ) {}

  private async validateAndGetClient(
    user: UsersEntity,
    ownerId?: string
  ): Promise<UsersEntity> {
    if (
      (user.role === Role.ADMIN || user.role === Role.FUNCIONARIO) &&
      ownerId
    ) {
      const owner = await this.usersRepository.findOne({
        where: { id: ownerId },
      });
      if (!owner || !owner.isActive || owner.role !== Role.CLIENTE) {
        throw new BadRequestException("Invalid client provided");
      }
      return owner;
    }
    return user;
  }

  private async validateAnimalOwnership(
    animalId: string,
    client: UsersEntity
  ): Promise<AnimalEntity> {
    const animal = await this.animalRepository.findOne({
      where: { id: animalId },
      relations: ["owner"],
    });
    if (!animal) throw new NotFoundException("Animal not found");
    if (!animal.owner || animal.owner.id !== client.id) {
      throw new BadRequestException(
        "Animal does not belong to the specified client"
      );
    }
    return animal;
  }

  private async validateAndAssignEmployee(
    employeeId: string
  ): Promise<UsersEntity> {
    const employee = await this.usersRepository.findOne({
      where: { id: employeeId },
    });
    if (!employee || !employee.isActive || ![Role.FUNCIONARIO, Role.ADMIN].includes(employee.role)) {
      throw new BadRequestException("Invalid employee ID");
    }
    return employee;
  }

  private async determineAssignedEmployee(
    employeeId: string | undefined,
    user: UsersEntity
  ): Promise<UsersEntity | null> {
    if (employeeId) {
      return this.validateAndAssignEmployee(employeeId);
    }
    if (user.role === Role.ADMIN || user.role === Role.FUNCIONARIO) {
      return user;
    }
    return null;
  }

  private determineReservationStatus(user: UsersEntity): ReservationStatus {
    return user.role === Role.ADMIN || user.role === Role.FUNCIONARIO
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
        statuses: ["confirmed", "pending", "rescheduled"],
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

  async createReservation(dto: CreateReservationDto, userId: string) {

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

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
    const client = await this.validateAndGetClient(user, dto.ownerId);
    const animal = await this.validateAnimalOwnership(dto.animalId, client);

    // Determine assigned employee
    const assignedEmployee = await this.determineAssignedEmployee(
      dto.employeeId,
      user
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
      client,
      animal,
      employee: assignedEmployee,
      status: this.determineReservationStatus(user),
    });

    const savedReservation = await this.reservationRepository.save(reservation);

    // Notificação: Reserva criada e será analisada pelo veterinário
    return this.notify(savedReservation, () => this.emailService.sendReservationCreatedEmail(
      client.email,
      client.name,
      dateKey(dto.date),
      dto.timeStart,
      dto.timeEnd
    ));
  }

  async updateReservationStatus(id: string, dto: UpdateReservationStatusDto) {
    // Find the existing reservation
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ["client", "employee"],
    });
    if (!reservation) throw new NotFoundException("Reservation not found");

    const changesTime = !!(dto.newDate || dto.newTimeStart || dto.newTimeEnd);
    const nextStatus = dto.status ?? (changesTime ? ReservationStatus.RESCHEDULED : reservation.status);
    if (nextStatus !== reservation.status || changesTime ||
        (dto.employeeId && [ReservationStatus.CANCELLED, ReservationStatus.COMPLETED].includes(reservation.status))) {
      assertTransition(reservation.status, nextStatus);
    }
    if (changesTime && nextStatus !== ReservationStatus.RESCHEDULED) {
      policyError('INVALID_TRANSITION', 'Time changes must propose a reschedule');
    }

    // Validate and assign employee if specified
    if (dto.employeeId) {
      reservation.employee = await this.validateAndAssignEmployee(
        dto.employeeId
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
      if (!reservation.employee) policyError('EMPLOYEE_REQUIRED', 'Employee ID is required to confirm a reservation');
      await this.validateAvailability(reservation.date, reservation.timeStart, reservation.timeEnd, reservation.employee.id, reservation.id);
    }

    // Update status and notes
    reservation.status = nextStatus;
    reservation.rescheduleNote = dto.rescheduleNote ?? reservation.rescheduleNote ?? "";

    const updatedReservation =
      await this.reservationRepository.save(reservation);

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

  async findAllReservations() {
    return this.historicalAnimals(await this.reservationRepository.find({
      relations: ["client", "employee", "animal"],
      order: { date: "ASC", timeStart: "ASC" },
    }));
  }

  async findByClient(clientId: string) {
    return this.historicalAnimals(await this.reservationRepository.find({
      where: { client: { id: clientId } },
      relations: ["animal", "employee"],
      order: { date: "DESC" },
    }));
  }

  async findByEmployee(employeeId: string) {
    const employee = await this.usersRepository.findOne({
      where: { id: employeeId, role: Role.FUNCIONARIO },
    });

    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    return this.historicalAnimals(await this.reservationRepository.find({
      where: { employee: { id: employeeId } },
      relations: ["client", "animal"],
      order: { date: "ASC", timeStart: "ASC" },
    }));
  }

  async confirmPendingReservation(id: string, dto: ConfirmPendingDto) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ["client"],
    });

    if (!reservation) throw new NotFoundException("Reservation not found");

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException(
        "This reservation is not in a pending state."
      );
    }

    if (![ReservationStatus.CONFIRMED].includes(dto.status)) {
      throw new BadRequestException("Invalid status. Must be confirmed.");
    }

    if (dto.employeeId) {
      const employee = await this.usersRepository.findOne({
        where: {
          id: dto.employeeId,
          role: In([Role.FUNCIONARIO, Role.ADMIN]),
        },
      });

      if (!employee || !employee.isActive) throw new BadRequestException("Invalid employee ID.");

      await this.validateAvailability(reservation.date, reservation.timeStart, reservation.timeEnd, employee.id, reservation.id);
      reservation.employee = employee;
      reservation.status = dto.status;
      reservation.rescheduleNote = dto.confirmationNote ?? " ";
      const updatedReservation =
        await this.reservationRepository.save(reservation);

      // Enviar email de confirmação
      return this.notify(updatedReservation, () => this.emailService.sendReservationConfirmedEmail(
        reservation.client.email,
        reservation.client.name,
        dateKey(reservation.date),
        reservation.timeStart,
        reservation.timeEnd,
        reservation.rescheduleNote
      ));
    }

    throw new BadRequestException(
      "Employee ID is required to confirm a pending reservation."
    );
  }

  async confirmRescheduledReservation(id: string, dto: ConfirmRescheduleDto, actor: Actor) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ["employee", "client"],
    });

    if (!reservation) throw new NotFoundException("Reservation not found");

    requireOwnerOrAdmin(actor, reservation.client.id);

    if (reservation.status !== ReservationStatus.RESCHEDULED) {
      throw new BadRequestException(
        "This reservation is not in a rescheduled state."
      );
    }

    if (
      ![ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED].includes(
        dto.status
      )
    ) {
      throw new BadRequestException(
        "Invalid status. Must be confirmed or cancelled."
      );
    }

    if (dto.status === ReservationStatus.CONFIRMED) {
      if (!reservation.employee) {
        throw new BadRequestException(
          "This reservation has no assigned employee."
        );
      }

      await this.validateAvailability(reservation.date, reservation.timeStart, reservation.timeEnd, reservation.employee.id, reservation.id);
    }

    reservation.status = dto.status;
    reservation.rescheduleNote = dto.confirmationNote ?? "";

    const saved = await this.reservationRepository.save(reservation);
    if (dto.status === ReservationStatus.CONFIRMED) {
      return this.notify(saved, () => this.emailService.sendReservationConfirmedEmail(
        reservation.client.email, reservation.client.name, dateKey(reservation.date),
        reservation.timeStart, reservation.timeEnd, reservation.rescheduleNote));
    }
    return this.notify(saved, () => this.emailService.sendReservationCancelledEmail(
      reservation.client.email, reservation.client.name, dateKey(reservation.date), reservation.rescheduleNote));
  }

  async findByEmployeeAndDate(
    employeeId: string,
    date: Date
  ): Promise<ReservationEntity[]> {
    return this.historicalAnimals(await this.reservationRepository.find({
      where: {
        employee: { id: employeeId },
        date,
        status: In(["confirmed"]),
      },
      relations: ["client", "animal"],
      order: { timeStart: "ASC" },
    }));
  }

  async rejectRescheduledReservation(id: string, actor: Actor, note?: string) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ["client", "employee"],
    });

    if (!reservation) throw new NotFoundException("Reservation not found");

    requireOwnerOrAdmin(actor, reservation.client.id);

    if (reservation.status !== ReservationStatus.RESCHEDULED) {
      throw new BadRequestException(
        "This reservation is not in a rescheduled state."
      );
    }

    reservation.status = ReservationStatus.CANCELLED;
    reservation.rescheduleNote = note ?? "";

    const updatedReservation =
      await this.reservationRepository.save(reservation);

    // Enviar email de rejeição/cancelamento ao cliente
    return this.notify(updatedReservation, () => this.emailService.sendReservationCancelledEmail(
      reservation.client.email,
      reservation.client.name,
      dateKey(reservation.date),
      note
    ));
  }
}
