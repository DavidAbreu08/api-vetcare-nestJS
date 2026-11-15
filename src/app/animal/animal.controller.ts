import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Actor } from "../core/authorization";
import { AnimalService } from "./animal.service";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { UsersEntity } from "../users/entities/users.entity";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { Roles } from "../core/decorators/roles.decorator";
import { Role } from "../core/enums/role.enum";

@Controller("api/animal")
export class AnimalController {
  constructor(private readonly animalService: AnimalService) {}

  @UseGuards(AuthGuard("jwt"))
  @Post("create")
  async create(@Body() dto: CreateAnimalDto, @CurrentUser() user: UsersEntity) {
    return this.animalService.create(dto, user);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Patch("update/:id")
  async update(@Param("id") id: string, @Body() dto: UpdateAnimalDto, @CurrentUser() actor: Actor) {
    return this.animalService.update(id, dto, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(Role.ADMIN)
  @Put("confirm/:id")
  async confirm(@Param("id") id: string) {
    return this.animalService.confirm(id);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(Role.ADMIN)
  @Get("all")
  async findAll() {
    return this.animalService.findAll();
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(Role.ADMIN, Role.FUNCIONARIO, Role.CLIENTE)
  @Get("owner/:ownerId")
  async findByOwner(@Param("ownerId") ownerId: string, @CurrentUser() actor: Actor) {
    return this.animalService.findByOwner(ownerId, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Delete(":id")
  @Roles(Role.ADMIN)
  async deleteAnimal(@Param("id") id: string) {
    return this.animalService.delete(id);
  }
}
