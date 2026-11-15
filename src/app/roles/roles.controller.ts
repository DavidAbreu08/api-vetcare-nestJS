import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { RolesService } from "./roles.service";
import { CreateRoleDto, UpdateRoleDto } from "./dto/create-role.dto";

@Controller("api/roles")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  /** Role catalog is administrative; callers read their own roles through GET /api/auth/me. */
  @Get()
  @Roles(SystemRole.ADMIN)
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @Roles(SystemRole.ADMIN)
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateRoleDto) { return this.service.create(dto); }

  @Put(":id")
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
