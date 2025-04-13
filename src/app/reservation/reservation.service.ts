import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReservationEntity } from './entities/reservation.entity';
import { Repository } from 'typeorm';
import { UsersEntity } from '../users/entities/users.entity';
import { AnimalEntity } from '../animal/entities/animal.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Role } from '../core/enums/role.enum';
import { ReservationStatus } from '../core/enums/reservation-status.enum';
import { UpdateReservationStatusDto } from './dto/update-reservation.dto';
import * as dayjs from 'dayjs';
import { ConfirmRescheduleDto } from './dto/confirm-reschedule.dto';
import { BlockedTimeEntity } from './entities/bloked-times.entity';

@Injectable()
export class ReservationService {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly reservationRepository: Repository<ReservationEntity>,

    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,

    @InjectRepository(AnimalEntity)
    private readonly animalRepository: Repository<AnimalEntity>,

    @InjectRepository(BlockedTimeEntity)
    private readonly blockedTimeRepository: Repository<BlockedTimeEntity>,
  ) {}

  private getSlotDuration(): number {
    // TODO: make this dynamic later (core/service/DB)
    return 15; // minutes
  }

  private async isTimeBlocked(date: Date, time: string): Promise<boolean> {
    const blockedTime = await this.blockedTimeRepository.findOne({
      where: { date, time },
    });
    return !!blockedTime;
  }

  private async validateAndGetClient(user: UsersEntity, ownerId?: string): Promise<UsersEntity> {
    if ((user.role === Role.ADMIN || user.role === Role.FUNCIONARIO) && ownerId) {
      const owner = await this.usersRepository.findOne({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.CLIENTE) {
        throw new BadRequestException('Invalid client provided');
      }
      return owner;
    }
    return user;
  }

  private async validateAnimalOwnership(animalId: string, client: UsersEntity): Promise<AnimalEntity> {
    const animal = await this.animalRepository.findOne({
      where: { id: animalId },
      relations: ['owner'],
    });
    if (!animal) throw new NotFoundException('Animal not found');
    if (animal.owner.id !== client.id) {
      throw new BadRequestException('Animal does not belong to the specified client');
    }
    return animal;
  }
  
  private async validateAndAssignEmployee(employeeId: string): Promise<UsersEntity> {
    const employee = await this.usersRepository.findOne({ where: { id: employeeId } });
    if (!employee || employee.role !== Role.FUNCIONARIO) {
      throw new BadRequestException('Invalid employee ID');
    }
    return employee;
  }
  
  private async isEmployeeReserved(
    employee: string | UsersEntity,
    date: Date,
    time: string,
    slotDuration: number,
    excludeReservationId?: string,
  ): Promise<boolean> {
    const employeeId = typeof employee === 'string' ? employee : employee.id;
    const targetDate = dayjs(date).format('YYYY-MM-DD');
    const targetTime = dayjs(`${targetDate}T${time}`);
    const slotStart = targetTime.subtract(slotDuration, 'minute');
    const slotEnd = targetTime.add(slotDuration, 'minute');
  
    const query = this.reservationRepository
      .createQueryBuilder('r')
      .where('r.date = :date', { date: targetDate })
      .andWhere('r.employeeId = :employeeId', { employeeId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING, ReservationStatus.RESCHEDULED],
      });
  
    if (excludeReservationId) {
      query.andWhere('r.id != :id', { id: excludeReservationId });
    }
  
    const reservations = await query.getMany();
  
    return reservations.some(r => {
      const existingTime = dayjs(`${dayjs(r.date).format('YYYY-MM-DD')}T${r.time}`);
      return existingTime.isAfter(slotStart) && existingTime.isBefore(slotEnd);
    });
  }
  

  async createReservation(dto: CreateReservationDto, userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
  
    if (dto.employeeId) {
      const isReserved = await this.isEmployeeReserved(
        dto.employeeId,
        dto.date,
        dto.time,
        this.getSlotDuration()
      );
      if (isReserved) {
        throw new BadRequestException('Employee already has a reservation at that time.');
      }
    }
  
    const client = await this.validateAndGetClient(user, dto.ownerId);
    const animal = await this.validateAnimalOwnership(dto.animalId, client);
  
    let assignedEmployee: UsersEntity | null = null;
    if (dto.employeeId) {
      assignedEmployee = await this.validateAndAssignEmployee(dto.employeeId);
    } else if (user.role === Role.ADMIN || user.role === Role.FUNCIONARIO) {
      //Remember:  here if the admin doesn’t pass employeeId, by default, user is assigned
      assignedEmployee = user;
    }
  
    if (await this.isTimeBlocked(dto.date, dto.time)) {
      throw new BadRequestException('This time is blocked and unavailable for reservations.');
    }
  
    const reservation = this.reservationRepository.create({
      date: dto.date,
      time: dto.time,
      reason: dto.reason,
      client,
      animal,
      employee: assignedEmployee ?? null,
      status:
        user.role === Role.ADMIN || user.role === Role.FUNCIONARIO
          ? ReservationStatus.CONFIRMED
          : ReservationStatus.PENDING,
    });
  
    return await this.reservationRepository.save(reservation);
  }
  
  async updateReservationStatus(
    id: string,
    dto: UpdateReservationStatusDto,
  ) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['client', 'animal'],
    });

    if (!reservation) throw new NotFoundException('Reservation not found');

    // Optional update employee
    if (dto.employeeId) {
      const employee = await this.usersRepository.findOne({
        where: { id: dto.employeeId, role: Role.FUNCIONARIO },
      });

      if (!employee) throw new BadRequestException('Invalid employee');
      reservation.employee = employee;
    }

    // Check if employee already has a reservation at that date/time
    if (dto.newDate && dto.newTime && dto.employeeId) {
      const isReserved = await this.isEmployeeReserved(
        dto.employeeId,
        dto.newDate,
        dto.newTime,
        this.getSlotDuration(),
        reservation.id // exclude the current one
      );
    
      if (isReserved) {
        throw new BadRequestException('Employee already has a reservation at that time.');
      }
    }

    if (await this.isTimeBlocked(dto.newDate, dto.newTime)) {
      throw new BadRequestException('This time is blocked and unavailable for reservations.');
    }

    reservation.status = dto.status;
    reservation.rescheduleNote = dto.rescheduleNote ?? ' ';
    if (dto.newDate) {
        reservation.date = new Date(dto.newDate);
      }
      
    if (dto.newTime) {
      reservation.time = dto.newTime;
    }
    return this.reservationRepository.save(reservation);
  }

  async findAllReservations() {
    return this.reservationRepository.find({
      relations: ['client', 'employee', 'animal'],
      order: { date: 'ASC', time: 'ASC' },
    });
  }
  
  async findByClient(clientId: string) {
    return this.reservationRepository.find({
      where: { client: { id: clientId } },
      relations: ['animal', 'employee'],
      order: { date: 'DESC' },
    });
  }

  async findByEmployee(employeeId: string) {
    const employee = await this.usersRepository.findOne({
      where: { id: employeeId, role: Role.FUNCIONARIO },
    });
  
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  
    return this.reservationRepository.find({
      where: { employee: { id: employeeId } },
      relations: ['client', 'animal'],
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async confirmRescheduledReservation(id: string, dto: ConfirmRescheduleDto) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['employee'],
    });
  
    if (!reservation) throw new NotFoundException('Reservation not found');
  
    // Only allow confirmation of rescheduled reservations
    if (reservation.status !== ReservationStatus.RESCHEDULED) {
      throw new BadRequestException('This reservation is not in a rescheduled state.');
    }
  
    if (![ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED].includes(dto.status)) {
      throw new BadRequestException('Invalid status. Must be confirmed or cancelled.');
    }
  
    if (dto.status === ReservationStatus.CONFIRMED) {
      const slotDuration = this.getSlotDuration();
      
      if (!reservation.employee) {
        throw new BadRequestException('This reservation has no assigned employee.');
      }
      
      const isReserved = await this.isEmployeeReserved(
        reservation.employee.id,
        reservation.date,
        reservation.time,
        slotDuration,
        reservation.id,
      );

      if (isReserved) {
        throw new BadRequestException('Employee already has a reservation at this time.');
      }
    }
  
    reservation.status = dto.status;
    reservation.rescheduleNote = dto.confirmationNote ?? '';
  
    return this.reservationRepository.save(reservation);
  }
  
}

