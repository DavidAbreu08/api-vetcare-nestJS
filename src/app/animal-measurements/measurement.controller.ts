import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { MeasurementService } from "./measurement.service";
import { CreateMeasurementDto, ListMeasurementsQueryDto, UpdateMeasurementDto } from "./dto/create-measurement.dto";
@Controller("api/animal-measurements")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MeasurementController {
  constructor(private readonly service: MeasurementService) {}
  @Get() list(@Query() query: ListMeasurementsQueryDto, @CurrentUser() actor: Actor) { return this.service.list(query, actor); }
  @Get(":id") get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.get(id, actor); }
  @Post() create(@Body() dto: CreateMeasurementDto, @CurrentUser() actor: Actor) { return this.service.create(dto, actor); }
  @Patch(":id") update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMeasurementDto, @CurrentUser() actor: Actor) { return this.service.update(id, dto, actor); }
  @Delete(":id") delete(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.delete(id, actor); }
}
