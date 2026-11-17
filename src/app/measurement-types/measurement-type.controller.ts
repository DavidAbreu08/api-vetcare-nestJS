import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { MeasurementTypeService } from "./measurement-type.service";
import { CreateMeasurementTypeDto, UpdateMeasurementTypeDto } from "./dto/create-measurement-type.dto";

@Controller("measurement-types")
@ApiTags("Measurement Types")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MeasurementTypeController {
  constructor(private readonly service: MeasurementTypeService) {}

  @Get()
  @ApiOperation({ summary: "List measurement types" })
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @ApiOperation({ summary: "Get measurement type" })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @ApiOperation({ summary: "Create measurement type" })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateMeasurementTypeDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiOperation({ summary: "Update measurement type" })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMeasurementTypeDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiOperation({ summary: "Delete measurement type" })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
