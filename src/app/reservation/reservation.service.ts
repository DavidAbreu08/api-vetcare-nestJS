import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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

@Injectable()
export class ReservationService {
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

  private getSlotDuration(): number {
    // TODO: make this dynamic later (core/service/DB)
    return 15; // minutes
  }

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
      if (!owner || owner.role !== Role.CLIENTE) {
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
    if (animal.owner.id !== client.id) {
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
    if (!employee || employee.role !== Role.FUNCIONARIO) {
      throw new BadRequestException("Invalid employee ID");
    }
    return employee;
  }

  private async validateReservation(dto: CreateReservationDto): Promise<void> {
    // 1. Basic time validation
    if (this.timeUtils.compareTimes(dto.timeEnd, dto.timeStart) <= 0) {
      throw new BadRequestException("End time must be after start time");
    }

    // 2. Business hours check
    if (
      !this.timeUtils.isWithinBusinessHours(
        dto.timeStart,
        dto.timeEnd,
        dto.date
      )
    ) {
      throw new BadRequestException(
        "Outside business hours (Mon-Fri 07:00-20:00)"
      );
    }

    // 3. Blocked times check
    if (await this.isTimeBlocked(dto.date, dto.timeStart, dto.timeEnd)) {
      throw new BadRequestException("This time slot is blocked");
    }

    // 4. Employee availability check
    if (dto.employeeId) {
      if (
        await this.isEmployeeReserved(
          dto.employeeId,
          dto.date,
          dto.timeStart,
          dto.timeEnd
        )
      ) {
        throw new BadRequestException(
          "Employee is already booked during this time"
        );
      }
    }
  }

  private async validateUpdateReservation(
    dto: UpdateReservationStatusDto
  ): Promise<void> {
    // 1. Basic time validation
    if (this.timeUtils.compareTimes(dto.newTimeEnd, dto.newTimeStart) <= 0) {
      throw new BadRequestException("End time must be after start time");
    }

    // 2. Business hours check
    if (
      !this.timeUtils.isWithinBusinessHours(
        dto.newTimeStart,
        dto.newTimeEnd,
        dto.newDate
      )
    ) {
      throw new BadRequestException(
        "Outside business hours (Mon-Fri 07:00-20:00)"
      );
    }

    // 3. Blocked times check
    if (
      await this.isTimeBlocked(dto.newDate, dto.newTimeStart, dto.newTimeEnd)
    ) {
      throw new BadRequestException("This time slot is blocked");
    }

    // 4. Employee availability check
    if (dto.employeeId) {
      if (
        await this.isEmployeeReserved(
          dto.employeeId,
          dto.newDate,
          dto.newTimeStart,
          dto.newTimeEnd
        )
      ) {
        throw new BadRequestException(
          "Employee is already booked during this time"
        );
      }
    }
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

    return blockedTimes.some((blocked) => {
      const blockedTimeStart = blocked.timeStart;
      const blockedTimeEnd = blocked.timeEnd;
      return (
        this.timeUtils.compareTimes(blockedTimeStart, timeStart) >= 0 &&
        this.timeUtils.compareTimes(blockedTimeEnd, timeEnd) < 0
      );
    });
  }

  private isSlotOccupied(
    slot: string,
    reservations: { timeStart: string; timeEnd: string }[],
    bufferMinutes: number
  ): boolean {
    const slotStart = this.timeUtils.minusMinutes(slot, bufferMinutes);
    const slotEnd = this.timeUtils.plusMinutes(slot, bufferMinutes);

    return reservations.some((reservation) => {
      return (
        this.timeUtils.compareTimes(slotStart, reservation.timeEnd) < 0 &&
        this.timeUtils.compareTimes(slotEnd, reservation.timeStart) > 0
      );
    });
  }

  private async handleReschedule(
    reservation: ReservationEntity,
    dto: UpdateReservationStatusDto
  ): Promise<void> {
    const newDate = dto.newDate ? new Date(dto.newDate) : reservation.date;
    const newTimeStart = dto.newTimeStart ?? reservation.timeStart;
    const newTimeEnd = dto.newTimeEnd ?? reservation.timeEnd;

    // Validate business hours
    if (
      !this.timeUtils.isWithinBusinessHours(newTimeStart, newTimeEnd, newDate)
    ) {
      throw new BadRequestException(
        "New time must be within business hours (Mon-Fri 07:00-20:00)"
      );
    }

    // Check for blocked times
    if (await this.isTimeBlocked(newDate, newTimeStart, newTimeEnd)) {
      throw new BadRequestException(
        "This time period is blocked and unavailable"
      );
    }

    // Check employee availability (if employee is assigned)
    const employeeId = dto.employeeId ?? reservation.employee?.id;
    if (employeeId) {
      const isReserved = await this.isEmployeeReserved(
        employeeId,
        newDate,
        newTimeStart,
        newTimeEnd,
        reservation.id
      );
      if (isReserved) {
        throw new BadRequestException(
          "Employee already has a reservation during this time"
        );
      }
    }

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
    const bufferMinutes = 15; // Buffer time between appointments

    const query = this.reservationRepository
      .createQueryBuilder("r")
      .where("r.employeeId = :employeeId", { employeeId })
      .andWhere("r.date = :date", { date })
      .andWhere("r.status IN (:...statuses)", {
        statuses: ["confirmed", "pending", "rescheduled"],
      })
      .andWhere(
        `
            (r.timeStart < :bufferedEnd AND r.timeEnd > :bufferedStart)
        `,
        {
          bufferedStart: this.timeUtils.minusMinutes(timeStart, bufferMinutes),
          bufferedEnd: this.timeUtils.plusMinutes(timeEnd, bufferMinutes),
        }
      );

    if (excludeReservationId) {
      query.andWhere("r.id != :excludeId", { excludeId: excludeReservationId });
    }

    return (await query.getCount()) > 0;
  }

  async createReservation(dto: CreateReservationDto, userId: string) {
    await this.validateReservation(dto);

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

    // Create and save the reservation
    const reservation = this.reservationRepository.create({
      date: dto.date,
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
    await this.emailService.sendReservationCreatedEmail(
      user.email,
      user.name,
      typeof dto.date === "string"
        ? dto.date
        : new Date(dto.date).toISOString().split("T")[0],
      dto.timeStart,
      dto.timeEnd
    );

    return savedReservation;
  }

  async updateReservationStatus(id: string, dto: UpdateReservationStatusDto) {
    // First validate the DTO
    await this.validateUpdateReservation(dto);

    // Find the existing reservation
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ["client", "animal", "employee"],
    });
    if (!reservation) throw new NotFoundException("Reservation not found");

    // Validate and assign employee if specified
    if (dto.employeeId) {
      reservation.employee = await this.validateAndAssignEmployee(
        dto.employeeId
      );
    }

    // Guardar dados antigos para email de reagendamento
    const oldDate = reservation.date.toISOString().split("T")[0];
    const oldTimeStart = reservation.timeStart;
    const oldTimeEnd = reservation.timeEnd;

    // Handle date/time changes
    if (dto.newDate || dto.newTimeStart || dto.newTimeEnd) {
      await this.handleReschedule(reservation, dto);
    }

    // Update status and notes
    reservation.status = dto.status;
    reservation.rescheduleNote = dto.rescheduleNote ?? "";

    const updatedReservation =
      await this.reservationRepository.save(reservation);

    // Notificações por email
  if (dto.status === ReservationStatus.RESCHEDULED) {
    await this.emailService.sendReservationRescheduledEmail(
      reservation.client.email,
      reservation.client.name,
      oldDate,
      oldTimeStart,
      oldTimeEnd,
      reservation.date.toISOString().split("T")[0],
      reservation.timeStart,
      reservation.timeEnd,
      reservation.rescheduleNote
    );
  }

    return updatedReservation;
  }

  async findAllReservations() {
    return this.reservationRepository.find({
      relations: ["client", "employee", "animal"],
      order: { date: "ASC", timeStart: "ASC" },
    });
  }

  async findByClient(clientId: string) {
    return this.reservationRepository.find({
      where: { client: { id: clientId } },
      relations: ["animal", "employee"],
      order: { date: "DESC" },
    });
  }

  async findByEmployee(employeeId: string) {
    const employee = await this.usersRepository.findOne({
      where: { id: employeeId, role: Role.FUNCIONARIO },
    });

    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    return this.reservationRepository.find({
      where: { employee: { id: employeeId } },
      relations: ["client", "animal"],
      order: { date: "ASC", timeStart: "ASC" },
    });
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

      if (!employee) throw new BadRequestException("Invalid employee ID.");

      const isReserved = await this.isEmployeeReserved(
        dto.employeeId,
        reservation.date,
        reservation.timeStart,
        reservation.timeEnd,
        reservation.id
      );

      if (isReserved) {
        throw new BadRequestException(
          "Employee already has a reservation at that time."
        );
      }
      reservation.employee = employee;
      reservation.status = dto.status;
      reservation.rescheduleNote = dto.confirmationNote ?? " ";
      const updatedReservation = await this.reservationRepository.save(reservation);

      // Enviar email de confirmação
      await this.emailService.sendReservationConfirmedEmail(
        reservation.client.email,
        reservation.client.name,
        reservation.date.toISOString().split("T")[0],
        reservation.timeStart,
        reservation.timeEnd,
        reservation.rescheduleNote
      );

      return updatedReservation;
    }

    throw new BadRequestException(
      "Employee ID is required to confirm a pending reservation."
    );
  }

  async confirmRescheduledReservation(id: string, dto: ConfirmRescheduleDto) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ["employee", "client"],
    });

    if (!reservation) throw new NotFoundException("Reservation not found");

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

      const isReserved = await this.isEmployeeReserved(
        reservation.employee.id,
        reservation.date,
        reservation.timeStart,
        reservation.timeEnd,
        reservation.id
      );

      if (isReserved) {
        throw new BadRequestException(
          "Employee already has a reservation at this time."
        );
      }

      // Enviar email de confirmação ao cliente
      await this.emailService.sendReservationConfirmedEmail(
        reservation.client.email,
        reservation.client.name,
        reservation.date.toISOString().split("T")[0],
        reservation.timeStart,
        reservation.timeEnd,
        dto.confirmationNote ?? ""
      );

    }

    reservation.status = dto.status;
    reservation.rescheduleNote = dto.confirmationNote ?? "";

    return this.reservationRepository.save(reservation);
  }

  async findByEmployeeAndDate(
    employeeId: string,
    date: Date
  ): Promise<string[]> {
    // 1. Get all reservations for this employee on the specified date
    const reservations = await this.reservationRepository.find({
      where: {
        employee: { id: employeeId },
        date,
        status: In(["confirmed", "pending", "rescheduled"]),
      },
      select: ["timeStart", "timeEnd"],
    });

    // 2. Generate all possible time slots for business hours
    const businessHours = this.timeUtils.getBusinessHours();
    const slotDuration = 30;
    const timeSlots = this.timeUtils.generateTimeSlots(
      businessHours.start,
      businessHours.end,
      slotDuration
    );

    // 3. Filter out occupied slots
    return timeSlots.filter((slot) => {
      return !this.isSlotOccupied(slot, reservations, slotDuration);
    });
  }
}
