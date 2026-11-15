import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { Role } from "../core/enums/role.enum";
import { TaxonomyService } from "./taxonomy.service";
import { CreateSpeciesDto, UpdateSpeciesDto, CreateBreedDto, UpdateBreedDto } from "./dto/taxonomy.dto";

@Controller("api/species")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class SpeciesController {
  constructor(private readonly taxonomy: TaxonomyService) {}
  @Get() list() { return this.taxonomy.listSpecies(); }
  @Post() @Roles(Role.ADMIN) create(@Body() dto: CreateSpeciesDto) { return this.taxonomy.createSpecies(dto.name); }
  @Patch(":id") @Roles(Role.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSpeciesDto) { return this.taxonomy.updateSpecies(id, dto.name); }
}

@Controller("api/breeds")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class BreedsController {
  constructor(private readonly taxonomy: TaxonomyService) {}
  @Get() list(@Query("speciesId", new ParseUUIDPipe({ optional: true })) speciesId?: string) { return this.taxonomy.listBreeds(speciesId); }
  @Post() @Roles(Role.ADMIN) create(@Body() dto: CreateBreedDto) { return this.taxonomy.createBreed(dto.speciesId, dto.name); }
  @Patch(":id") @Roles(Role.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBreedDto) { return this.taxonomy.updateBreed(id, dto.name); }
}
