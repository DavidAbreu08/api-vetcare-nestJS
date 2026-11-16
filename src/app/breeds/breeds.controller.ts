import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { BreedsService } from "./breeds.service";
import { CreateBreedDto, ListBreedsQueryDto, UpdateBreedDto } from "./dto/create-breed.dto";

@Controller("breeds")
@ApiTags("Raças")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class BreedsController {
  constructor(private readonly service: BreedsService) {}
  @Get()
  @ApiOperation({ summary: "Listar raças" })
  getAll(@Query() query: ListBreedsQueryDto) { return this.service.getAll(query); }
  @Get(":id")
  @ApiOperation({ summary: "Consultar raça" })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }
  @Post()
  @ApiOperation({ summary: "Criar raça" })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateBreedDto) { return this.service.create(dto); }
  @Put(":id")
  @ApiOperation({ summary: "Atualizar raça", description: "Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBreedDto) { return this.service.update(id, dto); }
  @Patch(":id")
  @ApiOperation({ summary: "Atualizar raça" })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBreedDto) { return this.service.update(id, dto); }
  @Delete(":id")
  @ApiOperation({ summary: "Eliminar raça" })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
