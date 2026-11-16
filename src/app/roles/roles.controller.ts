import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { RolesService } from "./roles.service";
import { CreateRoleDto, UpdateRoleDto } from "./dto/create-role.dto";

@Controller("roles")
@ApiTags("Perfis de acesso")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  /** Role catalog is administrative; callers read their own roles through GET /api/vetcare/auth/me. */
  @Get()
  @ApiOperation({ summary: "Listar perfis de acesso", description: "Operação reservada a administradores." })
  @Roles(SystemRole.ADMIN)
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @ApiOperation({ summary: "Consultar perfil de acesso", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @ApiOperation({ summary: "Criar perfil de acesso", description: "Operação reservada a administradores." })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateRoleDto) { return this.service.create(dto); }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar perfil de acesso", description: "Operação reservada a administradores. Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar perfil de acesso", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar perfil de acesso", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
