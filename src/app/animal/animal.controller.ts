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

@Controller("api/animal")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnimalController {
  constructor(private readonly service: AnimalService) {}

  @Get()
  getAll(@Query() query: ListAnimalsQueryDto, @CurrentUser() actor: Actor) { return this.service.getAll(query, actor); }

  @Post()
  create(@Body() dto: CreateAnimalDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  // Static compatibility routes precede the generic identifier route.
  @Post("create")
  createLegacy(@Body() dto: CreateAnimalDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }

  @Get("all")
  @Roles(SystemRole.ADMIN)
  findAll(@CurrentUser() actor: Actor) { return this.service.findAll(actor); }

  @Get("owner/:ownerId")
  findByOwner(@Param("ownerId", ParseUUIDPipe) ownerId: string, @CurrentUser() actor: Actor) {
    return this.service.findByOwner(ownerId, actor);
  }

  /**
   * ADMIN or a veterinarian (active employee with the VETERINARIAN job title, checked in the business service). The
   * body is optional: expectedSpeciesId/expectedBreedId make the approval conditional on the reviewed values (409).
   */
  @Put("confirm/:id")
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ConfirmAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.confirm(id, actor, dto);
  }

  @Patch("update/:id")
  updateLegacy(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.getById(id, actor); }

  @Put(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Delete(":id")
  @Roles(SystemRole.ADMIN)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}