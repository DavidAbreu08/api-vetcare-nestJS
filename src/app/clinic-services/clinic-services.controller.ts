import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { ClinicServicesService } from "./clinic-services.service";
import { CreateClinicServiceDto, ListClinicServicesQueryDto, UpdateClinicServiceDto } from "./dto/clinic-service.dto";

/** Catalog of bookable clinic services (vc_services). Reads for every authenticated user; management for administrators. */
@Controller("services")
@ApiTags("Services")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ClinicServicesController {
  constructor(private readonly service: ClinicServicesService) {}

  @Get()
  @ApiOperation({ summary: "List services", description: "Administrators see every service (optional isActive filter); other callers only active services." })
  getAll(@Query() query: ListClinicServicesQueryDto, @CurrentUser() actor: Actor) { return this.service.getAll(query, actor); }

  @Get(":id/employees")
  @ApiOperation({ summary: "List employees qualified for a service", description: "Staff only. Qualified employees that are bookable today (available profile, active account, not terminated); it does not consider schedules or occupied time." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  getEmployees(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getEmployees(id, actor); }

  @Get(":id")
  @ApiOperation({ summary: "Get service", description: "Inactive services are only visible to administrators (404 otherwise)." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Post()
  @ApiOperation({ summary: "Create service" })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateClinicServiceDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiOperation({ summary: "Update service", description: "Code is immutable (409). A new duration applies to new reservations only; deactivation blocks new reservations only." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClinicServiceDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiOperation({ summary: "Delete service", description: "Only a service never referenced by a reservation or an employee qualification (409 otherwise: deactivate it)." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
