import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { AnimalOwnersBusinessService } from "./animal-owners.business.service";
import { AddAnimalOwnerDto, ListAnimalOwnersQueryDto, RemoveAnimalOwnerDto, TransferAnimalDto } from "./dto/animal-owners.dto";
import { ResponseMessage } from "../core/decorators/response-message.decorator";
import { AnimalOwnersMessage } from "./animal-owners.messages";

/** Tutors of an animal (vc_animal_owners). Authorization per route is decided by AnimalOwnersBusinessService. */
@Controller("animal")
@ApiTags("Animal Owners")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnimalOwnersController {
  constructor(private readonly business: AnimalOwnersBusinessService) {}

  /** Staff and active tutors; includeHistory=true (closed periods) for staff and the primary tutor. */
  @Get(":id/owners")
  @ApiOperation({ summary: "List animal owners", description: "Permissions depend on active ownership, primary ownership, and staff access. Transferring primary ownership requires an administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  list(@Param("id", ParseUUIDPipe) id: string, @Query() query: ListAnimalOwnersQueryDto, @CurrentUser() actor: Actor) {
    return this.business.list(id, query, actor);
  }

  /** Adds a secondary tutor (staff or the primary tutor). */
  @Post(":id/owners")
  @ApiOperation({ summary: "Add a secondary animal owner", description: "Permissions depend on active ownership, primary ownership, and staff access. Transferring primary ownership requires an administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  add(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AddAnimalOwnerDto, @CurrentUser() actor: Actor) {
    return this.business.add(id, dto, actor);
  }

  /**
   * Ends a secondary tutorship (staff, the primary tutor, or the tutor leaving). transferFutureReservations may come
   * in the body or the query string (the body wins).
   */
  @Delete(":id/owners/:userId")
  @ApiOperation({ summary: "Remove a secondary animal owner", description: "Staff, the primary owner, or the departing owner may perform this operation. Send transferFutureReservations in the query or body; the body takes precedence. The result may include IDs of moved reservations." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @ApiParam({ name: "userId", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @ApiBody({ type: RemoveAnimalOwnerDto, required: false })
  @ResponseMessage(AnimalOwnersMessage.Removed)
  remove(
    @Param("id", ParseUUIDPipe) id: string, @Param("userId", ParseUUIDPipe) userId: string,
    @Query() query: RemoveAnimalOwnerDto, @Body() body: RemoveAnimalOwnerDto, @CurrentUser() actor: Actor,
  ) {
    return this.business.remove(id, userId, { transferFutureReservations: body?.transferFutureReservations ?? query.transferFutureReservations }, actor);
  }

  /** Administrators only: hands the primary tutorship to another active client account. */
  @Post(":id/transfer")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Transfer primary animal ownership", description: "Permissions depend on active ownership, primary ownership, and staff access. Transferring primary ownership requires an administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  transfer(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TransferAnimalDto, @CurrentUser() actor: Actor) {
    return this.business.transfer(id, dto, actor);
  }
}
