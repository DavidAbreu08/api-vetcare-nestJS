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

@Injectable()
export class ReservationService {
  constructor(
      @InjectRepository(ReservationEntity)
      private readonly reservationRepository: Repository<ReservationEntity>,
  
      @InjectRepository(UsersEntity)
      private readonly usersRepository: Repository<UsersEntity>,
  
      @InjectRepository(AnimalEntity)
      private readonly animalRepository: Repository<AnimalEntity>,
  ) {}


  
  //TODO: Admin should be able to assign a reservetion for himself
  async createReservation(dto: CreateReservationDto, userId: string) {
      const user = await this.usersRepository.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
    
      let client = user;
    
      // If user is ADMIN or FUNCIONARIO and provided an ownerId, override client
      if ((user.role === Role.ADMIN || user.role === Role.FUNCIONARIO) && dto.ownerId) {
        const owner = await this.usersRepository.findOne({ where: { id: dto.ownerId } });
        if (!owner || owner.role !== Role.CLIENTE) {
          throw new BadRequestException('Invalid client provided');
        }
        client = owner;
      }
    
      const animal = await this.animalRepository.findOne({
        where: { id: dto.animalId },
        relations: ['owner'],
      });
    
      if (!animal) throw new NotFoundException('Animal not found');
    
      // Ensure the animal belongs to the client
      if (animal.owner.id !== client.id) {
        throw new BadRequestException('Animal does not belong to the specified client');
      }
    
      let assignedEmployee: UsersEntity | null = null;
      if (dto.employeeId) {
          assignedEmployee = await this.usersRepository.findOne({ where: { id: dto.employeeId } });
          if (!assignedEmployee || assignedEmployee.role !== Role.FUNCIONARIO) {
            throw new BadRequestException('Invalid employee ID');
          }
        } else if (user.role === Role.ADMIN || user.role === Role.FUNCIONARIO) {
          throw new BadRequestException('Employee ID is required for admins and employees');
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
      
    //TODO: If the employee already has a reservation for that hour at the day, the new reservation should be rejected
    //TODO: Every employee can only have one reservation at a time, meaning, each employee has a min time frame off 15min for a reservation, example: 15:00/15:15/15:30/15:45/(...), this 15min should be adapted after, so make it dynamic
    //TODO: Create another endpoint to update the reservation status from client side when the reservation is rescheduled
    //TODO: Create another endpoint for admin block hours of the day, that he considers unavailable use the BlockedTimeEntity for this and reference it in the reservation entity
    async updateReservationStatus(
      id: string,
      dto: UpdateReservationStatusDto,
    ) {
      const reservation = await this.reservationRepository.findOne({
        where: { id },
        relations: ['client', 'animal'],
      });
  
      if (!reservation) throw new NotFoundException('Reservation not found');
  
      if (dto.employeeId) {
        const employee = await this.usersRepository.findOne({
          where: { id: dto.employeeId, role: Role.FUNCIONARIO },
        });
  
        if (!employee) throw new BadRequestException('Invalid employee');
        reservation.employee = employee;
      }
  
      reservation.status = dto.status;
      reservation.rescheduleNote = dto.rescheduleNote ?? ' ';
      if (dto.newDate) {
          reservation.date = new Date(dto.newDate);
        }
        
        if (dto.newTime) {
          reservation.time = dto.newTime;
        }

      // TODO: Implement the notification system for the client about the updat, later
      //await this.notificationService.notifyClientAboutUpdate(reservation);
  
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
    
}

