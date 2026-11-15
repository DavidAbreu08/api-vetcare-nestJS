import { Body, Controller, Post, UseGuards, Get, Put, Delete, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Role } from "../core/enums/role.enum";
import { Roles } from "../core/decorators/roles.decorator";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { BlockedTimeService } from "./blocked-time.service";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";

@Controller("api/blocked-times")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(Role.ADMIN)
export class BlockedTimeController {
  constructor(private readonly blockedTimeService: BlockedTimeService) {}

  @Get()
  findAll(@Query() query: ListBlockedTimesQueryDto) {
    return this.blockedTimeService.getAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.blockedTimeService.getById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  createBlockedTime(@Body() dto: CreateBlockedTimeDto) {
    return this.blockedTimeService.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBlockedTimeDto) {
    return this.blockedTimeService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.blockedTimeService.delete(id);
  }

}
