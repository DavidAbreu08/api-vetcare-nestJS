import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { BreedsService } from "./breeds.service";
import { CreateBreedDto, ListBreedsQueryDto, UpdateBreedDto } from "./dto/create-breed.dto";

@Controller("breeds")
@ApiTags("Breeds")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class BreedsController {
  constructor(private readonly service: BreedsService) {}

  @Get()
  @ApiOperation({ summary: "List breeds" })
  getAll(@Query() query: ListBreedsQueryDto) { return this.service.getAll(query); }

  @Get(":id")
  @ApiOperation({ summary: "Get breed" })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  getById(@Param("id", ParseUUIDPipe) id: string) { return this.service.getById(id); }

  @Post()
  @ApiOperation({ summary: "Create breed" })
  @Roles(SystemRole.ADMIN)
  create(@Body() dto: CreateBreedDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiOperation({ summary: "Update breed" })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  updatePartial(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBreedDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiOperation({ summary: "Delete breed" })
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @Roles(SystemRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseUUIDPipe) id: string) { return this.service.delete(id); }
}
