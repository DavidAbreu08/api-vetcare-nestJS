import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";
import { AssignReservationEmployeeDto, ReservationReasonDto, RescheduleReservationDto } from "./dto/reservation-actions.dto";
import { ReservationService } from "./reservation.service";

/**
 * One route per operation. Reads are scoped by the business service (administrator: all; active employee:
 * assigned to them; client: own). Scheduling decisions (assign, confirm, reschedule, no-show) are administrative;
 * clients may cancel their own reservations. Completion happens only through /api/vetcare/clinical-visits/:id/complete.
 */
@Controller("reservations")
@ApiTags("Reservas")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ReservationController {
  constructor(private readonly service: ReservationService) {}

  @Get()
  @ApiOperation({ summary: "Listar reservas", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  list(@Query() query: ListReservationsQueryDto, @CurrentUser() actor: Actor) { return this.service.list(query, actor); }

  @Get(":id")
  @ApiOperation({ summary: "Consultar reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Get(":id/history")
  @ApiOperation({ summary: "Consultar o histórico da reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  getHistory(@Param("id", ParseUUIDPipe) id: string, @Query() query: ListQueryDto, @CurrentUser() actor: Actor) {
    return this.service.getHistory(id, query, actor);
  }

  @Post()
  @ApiOperation({ summary: "Criar reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  create(@Body() dto: CreateReservationDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Patch(":id/employee")
  @ApiOperation({ summary: "Atribuir um funcionário à reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  assignEmployee(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignReservationEmployeeDto, @CurrentUser() actor: Actor) {
    return this.service.assignEmployee(id, dto, actor);
  }

  @Post(":id/confirm")
  @ApiOperation({ summary: "Confirmar a reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReservationReasonDto, @CurrentUser() actor: Actor) {
    return this.service.confirm(id, dto, actor);
  }

  @Post(":id/reschedule")
  @ApiOperation({ summary: "Reagendar a reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  reschedule(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RescheduleReservationDto, @CurrentUser() actor: Actor) {
    return this.service.reschedule(id, dto, actor);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancelar a reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  cancel(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReservationReasonDto, @CurrentUser() actor: Actor) {
    return this.service.cancel(id, dto, actor);
  }

  @Post(":id/no-show")
  @ApiOperation({ summary: "Registar falta à reserva", description: "Leituras limitadas ao cliente ou funcionário responsável; administradores consultam todas. As ações respeitam os estados da reserva e as permissões do utilizador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  markNoShow(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReservationReasonDto, @CurrentUser() actor: Actor) {
    return this.service.markNoShow(id, dto, actor);
  }
}
