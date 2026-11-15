import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SystemSettingsService } from "./system-settings.service";
import { UpdateSystemSettingDto } from "./dto/update-system-setting.dto";

@Controller("api/system-settings")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(SystemRole.ADMIN)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Put(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSystemSettingDto) { return this.service.update(id, dto); }

  @Patch(":id")
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSystemSettingDto) { return this.service.update(id, dto); }
}
