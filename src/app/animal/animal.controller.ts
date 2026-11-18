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
@ApiTags("Animals")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnimalController {
  constructor(private readonly service: AnimalService) {}

  @Get()
  @ApiOperation({ summary: "List animals", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  getAll(@Query() query: ListAnimalsQueryDto, @CurrentUser() actor: Actor) { return this.service.getAll(query, actor); }

  @Post()
  @ApiOperation({ summary: "Create animal", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  create(@Body() dto: CreateAnimalDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Get("all")
  @ApiOperation({ summary: "List animals", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  @Roles(SystemRole.ADMIN)
  findAll(@CurrentUser() actor: Actor) { return this.service.findAll(actor); }

  @Get("owner/:ownerId")
  @ApiOperation({ summary: "List animals belonging to an owner", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  @ApiParam({ name: "ownerId", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  findByOwner(@Param("ownerId", ParseUUIDPipe) ownerId: string, @CurrentUser() actor: Actor) {
    return this.service.findByOwner(ownerId, actor);
  }

  /**
   * ADMIN or a veterinarian (active employee with the VETERINARIAN job title, checked in the business service). The
   * body is optional: expectedSpeciesId/expectedBreedId make the approval conditional on the reviewed values (409).
   */
  @Put("confirm/:id")
  @ApiOperation({ summary: "Approve animal details", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.confirm(id, actor, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get animal", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Patch(":id")
  @ApiOperation({ summary: "Partially update an animal", description: "Partially updates the animal. Omitted fields remain unchanged; the service checks editing permissions." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete animal", description: "Access is restricted by active animal ownership and employee or administrator permissions checked by the domain service." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @ResponseMessage(AnimalMessage.Deleted)
  @Roles(SystemRole.ADMIN)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
