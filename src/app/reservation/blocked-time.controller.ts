import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Role } from "../core/enums/role.enum";
import { Roles } from "../core/decorators/roles.decorator";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { BlockedTimeService } from "./blocked-time.service";

@Controller("api/blocked-times")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class BlockedTimeController {
  constructor(private readonly blockedTimeService: BlockedTimeService) {}

  @Post()
  @Roles(Role.ADMIN)
  createBlockedTime(@Body() dto: CreateBlockedTimeDto) {
    return this.blockedTimeService.createBlockedTime(dto);
  }
}
