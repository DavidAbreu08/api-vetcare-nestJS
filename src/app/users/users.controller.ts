import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../core/decorators/current-user.decorator";
import { Actor, requireOwnerOrAdmin } from "../core/authorization";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../core/decorators/roles.decorator";
import { SystemRole } from "../core/enums/system-role.enum";
import { RolesGuard } from "../core/guards/roles/roles.guard";
import { CreateClientDto } from "./dto/create-client.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { ReplaceUserRolesDto } from "./dto/replace-user-roles.dto";

/** Account data only; employee profiles live in /api/employees. */
@Controller("api/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  async index(@Query() query: ListUsersQueryDto) {
    return await this.usersService.getAll(query);
  }

  @Get("clients")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  async getAllClients() {
    return this.usersService.findAllClients();
  }

  @Get("check-email")
  async checkEmail(@Query("email") email: string): Promise<boolean> {
    return this.usersService.checkEmailExists(email);
  }

  @Post()
  async store(@Body() body: CreateUserDto) {
    return await this.usersService.create(body);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Post("create-clients")
  async storeClients(@Body() body: CreateClientDto, @CurrentUser() actor: Actor) {
    return await this.usersService.storeClient(body, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Get(":id/roles")
  async getRoles(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return this.usersService.getRoles(id);
  }

  /** Replaces the whole role list; the last active administrator cannot lose the administrator role. */
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Put(":id/roles")
  async replaceRoles(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: ReplaceUserRolesDto, @CurrentUser() actor: Actor) {
    return this.usersService.replaceRoles(id, body.roleIds, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Get(":id")
  async show(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return await this.usersService.getById(id);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Patch(":id")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: Actor
  ) {
    requireOwnerOrAdmin(actor, id);
    return await this.usersService.update(id, body, actor);
  }

  @Put(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  async replace(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: UpdateUserDto, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return this.usersService.update(id, body, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Delete(":id")
  async destroy(@Param("id", new ParseUUIDPipe()) id: string) {
    await this.usersService.delete(id);
  }
}
