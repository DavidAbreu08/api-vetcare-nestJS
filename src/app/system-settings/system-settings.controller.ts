import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SystemSettingsService } from "./system-settings.service";
import { UpdateSystemSettingDto } from "./dto/update-system-setting.dto";

@Controller("system-settings")
@ApiTags("System Settings")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(SystemRole.ADMIN)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  @ApiOperation({ summary: "List system settings", description: "Administrator-only operation." })
  getAll(@Query() query: ListQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @ApiOperation({ summary: "Get system setting", description: "Administrator-only operation." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Patch(":id")
  @ApiOperation({ summary: "Update system setting", description: "Administrator-only operation." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSystemSettingDto) { return this.service.update(id, dto); }
}
