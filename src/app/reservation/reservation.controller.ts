import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Delete,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { Actor } from "../core/authorization";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { AuthGuard } from "@nestjs/passport";
import { ReservationService } from "./reservation.service";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { UpdateReservationStatusDto } from "./dto/update-reservation.dto";
import { ConfirmRescheduleDto } from "./dto/confirm-reschedule.dto";
import { ConfirmPendingDto } from "./dto/confirm-pending.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";

@Controller("api/reservation")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Get()
  @Roles(SystemRole.ADMIN)
  findAll(@Query() query: ListReservationsQueryDto, @CurrentUser() actor: Actor) {
    return this.reservationService.getAll(query, actor);
  }

  @Post()
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  createAtBase(@CurrentUser() actor: Actor, @Body() dto: CreateReservationDto) {
    return this.reservationService.create(dto, actor);
  }

  @Put(":id")
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateReservationStatusDto, @CurrentUser() actor: Actor) {
    return this.reservationService.update(id, dto, actor);
  }

  /** Cancel an appointment while preserving its history and transition rules. */
  @Delete(":id")
  @Roles(SystemRole.ADMIN)
  cancel(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) {
    return this.reservationService.delete(id, actor);
  }

  @Post("create")
  @Roles(SystemRole.CLIENT, SystemRole.EMPLOYEE, SystemRole.ADMIN)
  async create(@CurrentUser() actor: Actor, @Body() dto: CreateReservationDto) {
    return this.reservationService.createReservation(dto, actor);
  }

  @Patch("update-status/:id")
  @Roles(SystemRole.ADMIN)
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateReservationStatusDto,
    @CurrentUser() actor: Actor
  ) {
    return this.reservationService.updateReservationStatus(id, dto, actor);
  }

  @Get("all")
  @Roles(SystemRole.ADMIN)
  async getAll(@CurrentUser() actor: Actor) {
    return this.reservationService.findAllReservations(actor);
  }

  @Get("client")
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  async getByClient(@CurrentUser() actor: Actor) {
    return this.reservationService.findByClient(actor);
  }

  /** Reservations assigned to the caller; requires an employee profile, whatever the roles. */
  @Get("employee")
  @Roles(SystemRole.EMPLOYEE, SystemRole.ADMIN)
  async getByEmployee(@CurrentUser() actor: Actor) {
    return this.reservationService.findByEmployee(actor);
  }

  @Patch(":id/confirm-pending")
  @Roles(SystemRole.ADMIN)
  async confirmPending(
    @Param("id") id: string,
    @Body() dto: ConfirmPendingDto,
    @CurrentUser() actor: Actor
  ) {
    return await this.reservationService.confirmPendingReservation(id, dto, actor);
  }

  @Patch(":id/confirm-rescheduled")
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  async confirmReschedule(
    @Param("id") id: string,
    @Body() dto: ConfirmRescheduleDto,
    @CurrentUser() actor: Actor
  ) {
    return await this.reservationService.confirmRescheduledReservation(id, dto, actor);
  }

  @Get(":employeeId/:date")
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  async getReservationsByEmployeeAndDate(
    @Param("employeeId") id: string,
    @Param("date") date: Date,
    @CurrentUser() actor: Actor
  ) {
    return await this.reservationService.findByEmployeeAndDate(id, date, actor);
  }


  @Patch(":id/reject-rescheduled")
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  async rejectReschedule(
    @Param("id") id: string,
    @CurrentUser() actor: Actor,
    @Body("note") note?: string
  ) {
    return await this.reservationService.rejectRescheduledReservation(id, actor, note);
  }

  @Get(":id")
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) {
    return this.reservationService.getById(id, actor);
  }


}
