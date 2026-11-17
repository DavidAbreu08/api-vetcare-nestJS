import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiOkResponse, ApiCreatedResponse } from "@nestjs/swagger";
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
import { ReservationResponseDto } from "./dto/reservation-response.dto";
import { AssignReservationEmployeeDto, ReservationReasonDto, RescheduleReservationDto } from "./dto/reservation-actions.dto";
import { ReservationService } from "./reservation.service";

/**
 * One route per operation. Reads are scoped by the business service (administrator: all; active employee:
 * assigned to them; client: own). Scheduling decisions (assign, confirm, reschedule, no-show) are administrative;
 * clients may cancel their own reservations. Completion happens only through /api/vetcare/clinical-visits/:id/complete.
 */
@Controller("reservations")
@ApiTags("Reservations")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ReservationController {
  constructor(private readonly service: ReservationService) {}

  @Get()
  @ApiOperation({ summary: "List reservations", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions. The createdBy filter only narrows that scope (non-administrators: their own id only); creating a reservation for a client grants no read access." })
  @ApiOkResponse({ description: "Reservations visible to the caller, projected per caller.", type: ReservationResponseDto, isArray: true })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  list(@Query() query: ListReservationsQueryDto, @CurrentUser() actor: Actor) { return this.service.list(query, actor); }

  @Get(":id")
  @ApiOperation({ summary: "Get reservation", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiOkResponse({ description: "Reservation projected for the caller (createdBy/createdBySelf included).", type: ReservationResponseDto })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Get(":id/history")
  @ApiOperation({ summary: "Get reservation history", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  getHistory(@Param("id", ParseUUIDPipe) id: string, @Query() query: ListQueryDto, @CurrentUser() actor: Actor) {
    return this.service.getHistory(id, query, actor);
  }

  @Post()
  @ApiOperation({ summary: "Create reservation", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions. The author (createdBy) is always the caller and cannot be sent in the body (400)." })
  @ApiCreatedResponse({ description: "Reservation created (PENDING), projected for the caller.", type: ReservationResponseDto })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  create(@Body() dto: CreateReservationDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Patch(":id/employee")
  @ApiOperation({ summary: "Assign an employee to a reservation", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiOkResponse({ description: "Reservation projected for the caller (createdBy/createdBySelf included).", type: ReservationResponseDto })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  assignEmployee(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignReservationEmployeeDto, @CurrentUser() actor: Actor) {
    return this.service.assignEmployee(id, dto, actor);
  }

  @Post(":id/confirm")
  @ApiOperation({ summary: "Confirm a reservation", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiOkResponse({ description: "Reservation projected for the caller (createdBy/createdBySelf included).", type: ReservationResponseDto })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReservationReasonDto, @CurrentUser() actor: Actor) {
    return this.service.confirm(id, dto, actor);
  }

  @Post(":id/reschedule")
  @ApiOperation({ summary: "Reschedule a reservation", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiOkResponse({ description: "Reservation projected for the caller (createdBy/createdBySelf included).", type: ReservationResponseDto })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  reschedule(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RescheduleReservationDto, @CurrentUser() actor: Actor) {
    return this.service.reschedule(id, dto, actor);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a reservation", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiOkResponse({ description: "Reservation projected for the caller (createdBy/createdBySelf included).", type: ReservationResponseDto })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  cancel(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReservationReasonDto, @CurrentUser() actor: Actor) {
    return this.service.cancel(id, dto, actor);
  }

  @Post(":id/no-show")
  @ApiOperation({ summary: "Mark a reservation as no-show", description: "Reads are scoped to the client or assigned employee; administrators can read all reservations. Actions enforce reservation state and user permissions." })
  @ApiOkResponse({ description: "Reservation projected for the caller (createdBy/createdBySelf included).", type: ReservationResponseDto })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  markNoShow(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReservationReasonDto, @CurrentUser() actor: Actor) {
    return this.service.markNoShow(id, dto, actor);
  }
}
