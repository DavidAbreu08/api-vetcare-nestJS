import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from "./dto/create-employee.dto";
import { EmployeesService } from "./employees.service";

@Controller("api/employees")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @Roles(SystemRole.ADMIN)
  getAll(@Query() query: ListEmployeesQueryDto) { return this.service.getAll(query); }

  /** The caller's own employee profile. */
  @Get("me")
  getMine(@CurrentUser() actor: Actor) { return this.service.getMine(actor); }

  /** Bookable employees for a clinic date (YYYY-MM-DD). */
  @Get("available/:date")
  @Roles(SystemRole.ADMIN)
  getAvailable(@Param("date") date: string) { return this.service.getAvailableByDate(date); }

  /** Administrators, or the employee itself. */
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Post()
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Put(":id")
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }

  @Patch(":id")
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }

  @Delete(":id")
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
