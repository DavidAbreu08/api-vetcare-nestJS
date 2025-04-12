import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../core/guards/roles/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { ReservationService } from './reservation.service';
import { Roles } from '../core/decorators/roles.decorator';
import { Role } from '../core/enums/role.enum';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { UpdateReservationStatusDto } from './dto/update-reservation.dto';

@Controller('api/reservation')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReservationController {
    constructor(
        private readonly reservationService: ReservationService
    ) {}

    @Post('create')
    @Roles(Role.CLIENTE, Role.FUNCIONARIO, Role.ADMIN)
    async create(
      @CurrentUser() user,
      @Body() dto: CreateReservationDto,
    ) {
      return this.reservationService.createReservation(dto, user.id);
    }

    @Patch('update-status/:id')
    @Roles(Role.ADMIN)
    async updateStatus(
      @Param('id') id: string,
      @Body() dto: UpdateReservationStatusDto,
    ) {
      return this.reservationService.updateReservationStatus(id, dto);
    }

    @Get('all')
    @Roles(Role.ADMIN)
    async getAll() {
      return this.reservationService.findAllReservations();
    }

    @Get('client')
    @Roles(Role.CLIENTE)
    async getByClient(@CurrentUser() user) {
        return this.reservationService.findByClient(user.id);
    }
  
    @Get('employee')
    @Roles(Role.FUNCIONARIO)
    async getByEmployee(@CurrentUser() user) {
        return this.reservationService.findByEmployee(user.id);
    }

}
