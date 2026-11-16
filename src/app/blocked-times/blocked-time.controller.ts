import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Post, UseGuards, Get, Put, Delete, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { SystemRole } from "../core/enums/system-role.enum";
import { Roles } from "../core/decorators/roles.decorator";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { BlockedTimeService } from "./blocked-time.service";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";

@Controller("blocked-times")
@ApiTags("Horários bloqueados")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(SystemRole.ADMIN)
export class BlockedTimeController {
  constructor(private readonly blockedTimeService: BlockedTimeService) {}

  @Get()
  @ApiOperation({ summary: "Listar horários bloqueados", description: "Operação reservada a administradores." })
  findAll(@Query() query: ListBlockedTimesQueryDto) {
    return this.blockedTimeService.getAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consultar horário bloqueado", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.blockedTimeService.getById(id);
  }

  @Post()
  @ApiOperation({ summary: "Criar horário bloqueado", description: "Operação reservada a administradores." })
  @Roles(SystemRole.ADMIN)
  createBlockedTime(@Body() dto: CreateBlockedTimeDto) {
    return this.blockedTimeService.create(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar horário bloqueado", description: "Operação reservada a administradores. Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBlockedTimeDto) {
    return this.blockedTimeService.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar horário bloqueado", description: "Operação reservada a administradores." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.blockedTimeService.delete(id);
  }

}
