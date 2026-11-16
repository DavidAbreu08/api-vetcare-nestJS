import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { MeasurementTypeService } from "./measurement-type.service";
import { CreateMeasurementTypeDto, UpdateMeasurementTypeDto } from "./dto/create-measurement-type.dto";

@Controller("api/measurement-types")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MeasurementTypeController {
  constructor(private readonly service: MeasurementTypeService) {}

  @Get()
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateMeasurementTypeDto) { return this.service.create(dto); }

  @Put(":id")
  @Roles(SystemRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMeasurementTypeDto) { return this.service.update(id, dto); }

  @Patch(":id")
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMeasurementTypeDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
