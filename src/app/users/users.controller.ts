import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBadRequestResponse, ApiResponse } from "@nestjs/swagger";
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
import { ResponseMessage } from "../core/decorators/response-message.decorator";
import { UsersMessages } from "./users.messages";
import { CheckEmailQueryDto } from "./dto/check-email-query.dto";

/** Account data only; employee profiles live in /api/vetcare/employees. */
@Controller("users")
@ApiTags("Users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "List users" })
  @ApiBearerAuth("bearer")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  async index(@Query() query: ListUsersQueryDto) {
    return await this.usersService.getAll(query);
  }

  @Get("clients")
  @ApiOperation({ summary: "List client accounts" })
  @ApiBearerAuth("bearer")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  async getAllClients() {
    return this.usersService.findAllClients();
  }

  @Get("check-email")
  @ApiOperation({ summary: "Check whether an email is registered", description: "Public operation. A valid email is required; missing or invalid input returns 400." })
  @ApiBadRequestResponse({ description: "A valid email is required." })
  @ApiResponse({ status: HttpStatus.OK, description: "Indicates whether the email is registered.", schema: { type: "boolean" } })
  async checkEmail(@Query() query: CheckEmailQueryDto): Promise<boolean> {
    return this.usersService.checkEmailExists(query.email);
  }

  @Post()
  @ApiOperation({ summary: "Create user" })
  async store(@Body() body: CreateUserDto) {
    return await this.usersService.create(body);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Post("clients")
  @ApiOperation({ summary: "Create a client account", description: "Administrator-only operation. Creates the account and sends access instructions." })
  @ApiBearerAuth("bearer")
  @ResponseMessage(UsersMessages.CLIENT_CREATED)
  async createClient(@Body() body: CreateClientDto, @CurrentUser() actor: Actor) {
    return this.usersService.storeClient(body, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Get(":id/roles")
  @ApiOperation({ summary: "Get user roles" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  async getRoles(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return this.usersService.getRoles(id);
  }

  /** Replaces the whole role list; the last active administrator cannot lose the administrator role. */
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Put(":id/roles")
  @ApiOperation({ summary: "Replace user roles" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  async replaceRoles(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: ReplaceUserRolesDto, @CurrentUser() actor: Actor) {
    return this.usersService.replaceRoles(id, body.roleIds, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Get(":id")
  @ApiOperation({ summary: "Get user" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  async show(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return await this.usersService.getById(id);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Patch(":id")
  @ApiOperation({ summary: "Update user" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  @ResponseMessage(UsersMessages.OK)
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: Actor
  ) {
    requireOwnerOrAdmin(actor, id);
    return await this.usersService.update(id, body, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Delete(":id")
  @ApiOperation({ summary: "Delete user" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "UUID identifier", schema: { type: "string", format: "uuid" } })
  async destroy(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    await this.usersService.delete(id, actor);
  }
}
