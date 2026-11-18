import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Post, UseGuards, Get, Patch, Delete, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { SystemRole } from "../core/enums/system-role.enum";
import { Roles } from "../core/decorators/roles.decorator";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Actor } from "../core/authorization";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { BlockedTimeService } from "./blocked-time.service";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";

const WRITE_RULES = "Administrator-only operation. Without employeeId the block is a clinic-wide closure; with it, the unavailability of that employee (unknown: 404, inactive profile: 409). The interval may span several days and may overlap other blocks. Intersecting CONFIRMED reservations (of the employee, or of anyone for a closure) return 409 with their number in the message; nothing is cancelled.";

@Controller("blocked-times")
@ApiTags("Blocked Times")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(SystemRole.ADMIN)
export class BlockedTimeController {
  constructor(private readonly blockedTimeService: BlockedTimeService) {}

  @Get()
  @ApiOperation({ summary: "List blocked times", description: "Administrator-only operation. Optional from/to (blocks intersecting the range) and employeeId (individual blocks of that employee) filters; ordered by startAt." })
  findAll(@Query() query: ListBlockedTimesQueryDto) {
    return this.blockedTimeService.getAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get blocked time", description: "Administrator-only operation." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.blockedTimeService.getById(id);
  }

  @Post()
  @ApiOperation({ summary: "Create blocked time", description: `${WRITE_RULES} createdBy is the caller.` })
  createBlockedTime(@Body() dto: CreateBlockedTimeDto, @CurrentUser() actor: Actor) {
    return this.blockedTimeService.create(dto, actor);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update blocked time", description: `${WRITE_RULES} Omitted fields remain unchanged; employeeId null turns the block into a closure.` })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBlockedTimeDto) {
    return this.blockedTimeService.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete blocked time", description: "Administrator-only operation." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.blockedTimeService.delete(id);
  }
}
