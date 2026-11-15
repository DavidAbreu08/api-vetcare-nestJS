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
import { Role } from "../core/enums/role.enum";
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
  @Roles(Role.ADMIN)
  findAll(@Query() query: ListReservationsQueryDto) {
    return this.reservationService.getAll(query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FUNCIONARIO, Role.CLIENTE)
  createAtBase(@CurrentUser() actor: Actor, @Body() dto: CreateReservationDto) {
    return this.reservationService.create(dto, actor.id);
  }

  @Put(":id")
  @Roles(Role.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateReservationStatusDto) {
    return this.reservationService.update(id, dto);
  }

  /** Cancel an appointment while preserving its history and transition rules. */
  @Delete(":id")
  @Roles(Role.ADMIN)
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.reservationService.delete(id);
  }

  @Post("create")
  @Roles(Role.CLIENTE, Role.FUNCIONARIO, Role.ADMIN)
  async create(@CurrentUser() user, @Body() dto: CreateReservationDto) {
    return this.reservationService.createReservation(dto, user.id);
  }

  @Patch("update-status/:id")
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateReservationStatusDto
  ) {
    return this.reservationService.updateReservationStatus(id, dto);
  }

  @Get("all")
  @Roles(Role.ADMIN)
  async getAll() {
    return this.reservationService.findAllReservations();
  }

  @Get("client")
  @Roles(Role.ADMIN, Role.FUNCIONARIO, Role.CLIENTE)
  async getByClient(@CurrentUser() user) {
    return this.reservationService.findByClient(user.id);
  }

  @Get("employee")
  @Roles(Role.FUNCIONARIO)
  async getByEmployee(@CurrentUser() user) {
    return this.reservationService.findByEmployee(user.id);
  }

  @Patch(":id/confirm-pending")
  @Roles(Role.ADMIN)
  async confirmPending(
    @Param("id") id: string,
    @Body() dto: ConfirmPendingDto
  ) {
    return await this.reservationService.confirmPendingReservation(id, dto);
  }

  @Patch(":id/confirm-rescheduled")
  @Roles(Role.ADMIN, Role.FUNCIONARIO, Role.CLIENTE)
  async confirmReschedule(
    @Param("id") id: string,
    @Body() dto: ConfirmRescheduleDto,
    @CurrentUser() actor: Actor
  ) {
    return await this.reservationService.confirmRescheduledReservation(id, dto, actor);
  }

  @Get(":employeeId/:date")
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  async getReservationsByEmployeeAndDate(
    @Param("employeeId") id: string,
    @Param("date") date: Date
  ) {
    return await this.reservationService.findByEmployeeAndDate(id, date);
  }


  @Patch(":id/reject-rescheduled")
  @Roles(Role.ADMIN, Role.FUNCIONARIO, Role.CLIENTE)
  async rejectReschedule(
    @Param("id") id: string,
    @CurrentUser() actor: Actor,
    @Body("note") note?: string
  ) {
    return await this.reservationService.rejectRescheduledReservation(id, actor, note);
  }

  @Get(":id")
  @Roles(Role.ADMIN, Role.FUNCIONARIO, Role.CLIENTE)
  findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) {
    return this.reservationService.getById(id, actor);
  }


}
