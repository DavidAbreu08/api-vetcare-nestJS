import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { MeasurementService } from "./measurement.service";
import { CreateMeasurementDto, DeleteMeasurementDto, ListMeasurementsQueryDto, UpdateMeasurementDto } from "./dto/create-measurement.dto";
import { ResponseMessage } from "../core/decorators/response-message.decorator";
import { MeasurementMessage } from "./measurement.messages";

/** Reads are scoped per caller (clients see their animals); writes are staff-only and deletion is an audited admin soft-delete. */
@Controller("animal-measurements")
@ApiTags("Medições")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MeasurementController {
  constructor(private readonly service: MeasurementService) {}

  @Get()
  @ApiOperation({ summary: "Listar medições", description: "Clientes consultam apenas medições dos seus animais. Criar e alterar exige funcionário ativo ou administrador; eliminar exige administrador e motivo de auditoria." })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  list(@Query() query: ListMeasurementsQueryDto, @CurrentUser() actor: Actor) { return this.service.list(query, actor); }

  @Get(":id")
  @ApiOperation({ summary: "Consultar medição", description: "Clientes consultam apenas medições dos seus animais. Criar e alterar exige funcionário ativo ou administrador; eliminar exige administrador e motivo de auditoria." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.get(id, actor); }

  @Post()
  @ApiOperation({ summary: "Criar medição", description: "Clientes consultam apenas medições dos seus animais. Criar e alterar exige funcionário ativo ou administrador; eliminar exige administrador e motivo de auditoria." })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  create(@Body() dto: CreateMeasurementDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar medição", description: "Clientes consultam apenas medições dos seus animais. Criar e alterar exige funcionário ativo ou administrador; eliminar exige administrador e motivo de auditoria." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMeasurementDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar medição", description: "Clientes consultam apenas medições dos seus animais. Criar e alterar exige funcionário ativo ou administrador; eliminar exige administrador e motivo de auditoria." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @ResponseMessage(MeasurementMessage.Deleted)
  @Roles(SystemRole.ADMIN)
  delete(@Param("id", ParseUUIDPipe) id: string, @Body() dto: DeleteMeasurementDto, @CurrentUser() actor: Actor) { return this.service.delete(id, dto, actor); }
}
