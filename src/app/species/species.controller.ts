import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { Role } from "../core/enums/role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SpeciesService } from "./species.service";
import { CreateSpeciesDto, UpdateSpeciesDto } from "./dto/create-species.dto";

@Controller("api/species")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class SpeciesController {
  constructor(private readonly service: SpeciesService) {}

  @Get()
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateSpeciesDto) { return this.service.create(dto); }

  @Put(":id")
  @Roles(Role.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSpeciesDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @Roles(Role.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSpeciesDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
