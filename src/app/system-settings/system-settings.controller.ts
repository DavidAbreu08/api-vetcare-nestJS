import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SystemSettingsService } from "./system-settings.service";
import { UpdateSystemSettingDto } from "./dto/update-system-setting.dto";

@Controller("system-settings")
@ApiTags("Configurações")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(SystemRole.ADMIN)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  @ApiOperation({ summary: "Listar configurações", description: "Operação reservada a administradores." })
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @ApiOperation({ summary: "Consultar configuração", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar configuração", description: "Operação reservada a administradores. Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSystemSettingDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar configuração", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSystemSettingDto) { return this.service.update(id, dto); }
}
