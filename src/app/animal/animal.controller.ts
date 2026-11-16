import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { AnimalService } from "./animal.service";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { ConfirmAnimalDto } from "./dto/confirm-animal.dto";
import { ListAnimalsQueryDto } from "./dto/list-animals-query.dto";
import { ResponseMessage } from "../core/decorators/response-message.decorator";
import { AnimalMessage } from "./animal.messages";

@Controller("animal")
@ApiTags("Animais")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnimalController {
  constructor(private readonly service: AnimalService) {}

  @Get()
  @ApiOperation({ summary: "Listar animais", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  getAll(@Query() query: ListAnimalsQueryDto, @CurrentUser() actor: Actor) { return this.service.getAll(query, actor); }

  @Post()
  @ApiOperation({ summary: "Criar animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  create(@Body() dto: CreateAnimalDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  // Static compatibility routes precede the generic identifier route.
  @Post("create")
  @ApiOperation({ summary: "Criar animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio. Rota legada; preferir POST /api/vetcare/animal.", deprecated: true })
  createLegacy(@Body() dto: CreateAnimalDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Get("all")
  @ApiOperation({ summary: "Listar animais", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  @Roles(SystemRole.ADMIN)
  findAll(@CurrentUser() actor: Actor) { return this.service.findAll(actor); }

  @Get("owner/:ownerId")
  @ApiOperation({ summary: "Listar animais de um tutor", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  @ApiParam({ name: "ownerId", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  findByOwner(@Param("ownerId", ParseUUIDPipe) ownerId: string, @CurrentUser() actor: Actor) {
    return this.service.findByOwner(ownerId, actor);
  }

  /**
   * ADMIN or a veterinarian (active employee with the VETERINARIAN job title, checked in the business service). The
   * body is optional: expectedSpeciesId/expectedBreedId make the approval conditional on the reviewed values (409).
   */
  @Put("confirm/:id")
  @ApiOperation({ summary: "Validar os dados do animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.confirm(id, actor, dto);
  }

  @Patch("update/:id")
  @ApiOperation({ summary: "Atualizar animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio. Rota legada; preferir PATCH /api/vetcare/animal/{id}.", deprecated: true })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  updateLegacy(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consultar animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio. Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar parcialmente um animal", description: "Rota preferida para alterações parciais. Os campos omitidos mantêm-se; o serviço verifica as permissões de edição." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar animal", description: "Acesso limitado pelos tutores ativos e pelas permissões de funcionário ou administrador verificadas no domínio." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @ResponseMessage(AnimalMessage.Deleted)
  @Roles(SystemRole.ADMIN)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
