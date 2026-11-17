import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { AvailabilityService } from "./availability.service";
import { AvailabilityQueryDto, AvailabilityResponseDto } from "./dto/availability.dto";

@Controller("availability")
@ApiTags("Availability")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"))
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: "List free appointment slots for a service on a date",
    description: "Any authenticated user. For each employee qualified for the service and bookable on the date: slots of the service duration, every slotMinutes from the start of each working period (the employee schedule, or the clinic hours when they have none, always inside the clinic hours), excluding clinic closures, the employee's blocks and their confirmed reservations widened by the reservation buffer; pending reservations do not occupy time and past starts are omitted. Instants are UTC; localStart is clinic local time. Indicative only: confirmation re-checks under locks. Reservations and blocks are never exposed.",
  })
  @ApiOkResponse({ description: "Free slots per employee.", type: AvailabilityResponseDto })
  get(@Query() query: AvailabilityQueryDto, @CurrentUser() actor: Actor) { return this.service.getAvailability(query, actor); }
}
