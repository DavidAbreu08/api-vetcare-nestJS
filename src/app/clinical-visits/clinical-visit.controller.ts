import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../core/authorization";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { ClinicalVisitService } from "./clinical-visit.service";
import { CompleteClinicalVisitDto, CreateClinicalVisitDto, ListClinicalVisitsQueryDto, UpdateClinicalVisitDto, VoidClinicalVisitDto } from "./dto/clinical-visit.dto";

/** Reads are scoped per caller by the business service; there is no DELETE (visits are never removed). */
@Controller("clinical-visits")
@ApiTags("Clinical Visits")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ClinicalVisitController {
  constructor(private readonly service: ClinicalVisitService) {}

  @Get()
  @ApiOperation({ summary: "List clinical visits", description: "The service checks clinical responsibility and animal ownership. Clinical changes require an authorized employee or administrator." })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  list(@Query() query: ListClinicalVisitsQueryDto, @CurrentUser() actor: Actor) { return this.service.list(query, actor); }

  @Get(":id")
  @ApiOperation({ summary: "Get clinical visit", description: "The service checks clinical responsibility and animal ownership. Clinical changes require an authorized employee or administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT)
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: Actor) { return this.service.get(id, actor); }

  @Post()
  @ApiOperation({ summary: "Start a clinical visit", description: "The service checks clinical responsibility and animal ownership. Clinical changes require an authorized employee or administrator. 409 when the reservation already has a clinical visit (voided included)." })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  start(@Body() dto: CreateClinicalVisitDto, @CurrentUser() actor: Actor) { return this.service.start(dto, actor); }

  @Patch(":id")
  @ApiOperation({ summary: "Update clinical visit", description: "The service checks clinical responsibility and animal ownership. Clinical changes require an authorized employee or administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClinicalVisitDto, @CurrentUser() actor: Actor) {
    return this.service.update(id, dto, actor);
  }

  @Post(":id/complete")
  @ApiOperation({ summary: "Complete a clinical visit", description: "The service checks clinical responsibility and animal ownership. Clinical changes require an authorized employee or administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  complete(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CompleteClinicalVisitDto, @CurrentUser() actor: Actor) {
    return this.service.complete(id, dto, actor);
  }

  @Post(":id/void")
  @ApiOperation({ summary: "Void a clinical visit", description: "The service checks clinical responsibility and animal ownership. Clinical changes require an authorized employee or administrator." })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.ADMIN)
  voidVisit(@Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidClinicalVisitDto, @CurrentUser() actor: Actor) {
    return this.service.voidVisit(id, dto, actor);
  }
}
