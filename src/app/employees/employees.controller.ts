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

@Controller("employees")
@ApiTags("Funcionários")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: "Listar funcionários", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário." })
  @Roles(SystemRole.ADMIN)
  getAll(@Query() query: ListEmployeesQueryDto) { return this.service.getAll(query); }

  /** The caller's own employee profile. */
  @Get("me")
  @ApiOperation({ summary: "Consultar o próprio perfil de funcionário", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário." })
  getMine(@CurrentUser() actor: Actor) { return this.service.getMine(actor); }

  /** Bookable employees for a clinic date (YYYY-MM-DD). */
  @Get("available/:date")
  @ApiOperation({ summary: "Listar funcionários elegíveis para uma data", description: "Data no formato YYYY-MM-DD. Lista perfis ativos e elegíveis para marcações; não garante um intervalo horário sem reservas." })
  @ApiParam({ name: "date", description: "Data da clínica (YYYY-MM-DD)", schema: { type: "string", format: "date" } })
  @Roles(SystemRole.ADMIN)
  getAvailable(@Param("date") date: string) { return this.service.getAvailableByDate(date); }

  /** Administrators, or the employee itself. */
  @Get(":id")
  @ApiOperation({ summary: "Consultar funcionário", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Post()
  @ApiOperation({ summary: "Criar funcionário", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário." })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar funcionário", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário. Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar funcionário", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar funcionário", description: "Gestão reservada a administradores; a consulta individual também permite o próprio funcionário." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
