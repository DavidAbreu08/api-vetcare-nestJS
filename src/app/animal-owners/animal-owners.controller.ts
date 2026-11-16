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
@ApiTags("Tutores")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AnimalOwnersController {
  constructor(private readonly business: AnimalOwnersBusinessService) {}

  /** Staff and active tutors; includeHistory=true (closed periods) for staff and the primary tutor. */
  @Get(":id/owners")
  @ApiOperation({ summary: "Listar tutores", description: "As permissões dependem da tutoria ativa, tutoria principal e acesso de funcionário. A transferência principal exige administrador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  list(@Param("id", ParseUUIDPipe) id: string, @Query() query: ListAnimalOwnersQueryDto, @CurrentUser() actor: Actor) {
    return this.business.list(id, query, actor);
  }

  /** Adds a secondary tutor (staff or the primary tutor). */
  @Post(":id/owners")
  @ApiOperation({ summary: "Adicionar um tutor secundário", description: "As permissões dependem da tutoria ativa, tutoria principal e acesso de funcionário. A transferência principal exige administrador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  add(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AddAnimalOwnerDto, @CurrentUser() actor: Actor) {
    return this.business.add(id, dto, actor);
  }

  /**
   * Ends a secondary tutorship (staff, the primary tutor, or the tutor leaving). transferFutureReservations may come
   * in the body or the query string (the body wins).
   */
  @Delete(":id/owners/:userId")
  @ApiOperation({ summary: "Remover uma tutoria secundária", description: "Funcionário, tutor principal ou o tutor que sai. transferFutureReservations pode ser enviado na query ou no corpo; o corpo tem prioridade. A operação pode devolver os IDs das reservas movidas." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @ApiParam({ name: "userId", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
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
  @ApiOperation({ summary: "Transferir a tutoria principal", description: "As permissões dependem da tutoria ativa, tutoria principal e acesso de funcionário. A transferência principal exige administrador." })
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  transfer(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TransferAnimalDto, @CurrentUser() actor: Actor) {
    return this.business.transfer(id, dto, actor);
  }
}
