import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { JobTitlesService } from "./job-titles.service";
import { CreateJobTitleDto, UpdateJobTitleDto } from "./dto/create-job-title.dto";

@Controller("api/job-titles")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class JobTitlesController {
  constructor(private readonly service: JobTitlesService) {}

  @Get()
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateJobTitleDto) { return this.service.create(dto); }

  @Put(":id")
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateJobTitleDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateJobTitleDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
