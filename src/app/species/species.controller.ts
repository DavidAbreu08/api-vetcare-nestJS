import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SpeciesService } from "./species.service";
import { CreateSpeciesDto, UpdateSpeciesDto } from "./dto/create-species.dto";

@Controller("species")
@ApiTags("Espécies")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class SpeciesController {
  constructor(private readonly service: SpeciesService) {}

  @Get()
  @ApiOperation({ summary: "Listar espécies" })
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @ApiOperation({ summary: "Consultar espécie" })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @ApiOperation({ summary: "Criar espécie" })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateSpeciesDto) { return this.service.create(dto); }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar espécie", description: "Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSpeciesDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar espécie" })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSpeciesDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar espécie" })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
