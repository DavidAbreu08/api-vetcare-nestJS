import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from "./dto/create-employee.dto";
import { EmployeesService } from "./employees.service";
import { ReplaceEmployeeServicesDto } from "../clinic-services/dto/clinic-service.dto";
import { ReplaceEmployeeSchedulesDto } from "../employee-schedules/dto/employee-schedule.dto";

@Controller("employees")
@ApiTags("Employees")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: "List employees", description: "Management is restricted to administrators; employees may also read their own profile." })
  @Roles(SystemRole.ADMIN)
  getAll(@Query() query: ListEmployeesQueryDto) { return this.service.getAll(query); }

  /** The caller's own employee profile. */
  @Get("me")
  @ApiOperation({ summary: "Get the current employee profile", description: "Management is restricted to administrators; employees may also read their own profile." })
  getMine(@CurrentUser() actor: Actor) { return this.service.getMine(actor); }

  /** Bookable employees for a clinic date (YYYY-MM-DD). */
  @Get("available/:date")
  @ApiOperation({ summary: "List bookable employees for a date", description: "Date in YYYY-MM-DD format. Lists active profiles eligible for bookings that work on that clinic date (a period of their schedule, or the clinic hours when they have none, inside the clinic hours) and are not blocked for the whole of it (clinic closures and individual blocks). It does not consider reservations: use GET /availability for free slots." })
  @ApiParam({ name: "date", description: "Clinic date (YYYY-MM-DD)", schema: { type: "string", format: "date" } })
  @Roles(SystemRole.ADMIN)
  getAvailable(@Param("date") date: string) { return this.service.getAvailableByDate(date); }

  /** Service qualifications: administrators, or the employee itself. */
  @Get(":id/services")
  @ApiOperation({ summary: "List the services an employee is qualified for", description: "Administrators, or the employee itself. Includes qualifications for services deactivated later." })
  @ApiParam({ name: "id", description: "Employee profile UUID (vc_employees.id)", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  getServices(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getServices(id, actor); }

  /** Weekly schedule: administrators, or the employee itself. */
  @Get(":id/schedules")
  @ApiOperation({ summary: "List an employee's weekly schedule", description: "Administrators, or the employee itself. Periods in clinic local time (Europe/Lisbon), dayOfWeek 0 = Sunday. An empty list means the clinic hours apply." })
  @ApiParam({ name: "id", description: "Employee profile UUID (vc_employees.id)", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  getSchedules(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getSchedules(id, actor); }

  @Put(":id/schedules")
  @ApiOperation({ summary: "Replace an employee's weekly schedule", description: "Full replacement in one transaction holding the employee profile lock and the employee schedule lock. Invalid periods (end not after start, times from 01:00 to 01:59, validUntil before validFrom, overlapping periods of the same weekday with intersecting validity) return 400; touching periods are allowed. Confirmed reservations not yet finished that would no longer fit the schedule return 409 with their number in the message (nothing is cancelled). Dates without any valid period use the clinic hours; the clinic hours always remain the outer limit." })
  @ApiParam({ name: "id", description: "Employee profile UUID (vc_employees.id)", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  replaceSchedules(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReplaceEmployeeSchedulesDto) { return this.service.replaceSchedules(id, dto); }

  @Put(":id/services")
  @ApiOperation({ summary: "Replace the services an employee is qualified for", description: "Full replacement in one transaction holding the employee profile lock. Unknown services return 404; new qualifications require active services (409 otherwise); inactive services already held may be kept. Removing a qualification while the employee has open reservations of that service returns 409; qualifications changed concurrently return 409 (reload and retry)." })
  @ApiParam({ name: "id", description: "Employee profile UUID (vc_employees.id)", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  replaceServices(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReplaceEmployeeServicesDto) { return this.service.replaceServices(id, dto); }

  /** Administrators, or the employee itself. */
  @Get(":id")
  @ApiOperation({ summary: "Get employee", description: "Management is restricted to administrators; employees may also read their own profile." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Post()
  @ApiOperation({ summary: "Create employee", description: "Management is restricted to administrators; employees may also read their own profile." })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Patch(":id")
  @ApiOperation({ summary: "Update employee", description: "Management is restricted to administrators; employees may also read their own profile." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }

  @Delete(":id")
  @ApiOperation({ summary: "Delete employee", description: "Management is restricted to administrators; employees may also read their own profile." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
