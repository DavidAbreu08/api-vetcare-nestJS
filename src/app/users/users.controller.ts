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
@ApiTags("Utilizadores")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Listar utilizadores" })
  @ApiBearerAuth("bearer")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  async index(@Query() query: ListUsersQueryDto) {
    return await this.usersService.getAll(query);
  }

  @Get("clients")
  @ApiOperation({ summary: "Listar contas de clientes" })
  @ApiBearerAuth("bearer")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.EMPLOYEE)
  async getAllClients() {
    return this.usersService.findAllClients();
  }

  @Get("check-email")
  @ApiOperation({ summary: "Verificar se um email está registado", description: "Operação pública. Email obrigatório e válido; entrada ausente ou inválida devolve 400." })
  @ApiBadRequestResponse({ description: "Email obrigatório e válido." })
  @ApiResponse({ status: HttpStatus.OK, description: "Indica se o email está registado.", schema: { type: "boolean" } })
  async checkEmail(@Query() query: CheckEmailQueryDto): Promise<boolean> {
    return this.usersService.checkEmailExists(query.email);
  }

  @Post()
  @ApiOperation({ summary: "Criar utilizador" })
  async store(@Body() body: CreateUserDto) {
    return await this.usersService.create(body);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Post("clients")
  @ApiOperation({ summary: "Criar uma conta de cliente", description: "Operação reservada a administradores. Cria a conta e envia as instruções de acesso." })
  @ApiBearerAuth("bearer")
  @ResponseMessage(UsersMessages.CLIENT_CREATED)
  async createClient(@Body() body: CreateClientDto, @CurrentUser() actor: Actor) {
    return this.usersService.storeClient(body, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Post("create-clients")
  @ApiOperation({ summary: "Criar uma conta de cliente", description: "Rota legada reservada a administradores; preferir POST /api/vetcare/users/clients.", deprecated: true })
  @ApiBearerAuth("bearer")
  @ResponseMessage(UsersMessages.CLIENT_CREATED)
  async storeClients(@Body() body: CreateClientDto, @CurrentUser() actor: Actor) {
    return await this.usersService.storeClient(body, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Get(":id/roles")
  @ApiOperation({ summary: "Consultar os perfis de acesso do utilizador" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  async getRoles(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return this.usersService.getRoles(id);
  }

  /** Replaces the whole role list; the last active administrator cannot lose the administrator role. */
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Put(":id/roles")
  @ApiOperation({ summary: "Substituir os perfis de acesso do utilizador" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  async replaceRoles(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: ReplaceUserRolesDto, @CurrentUser() actor: Actor) {
    return this.usersService.replaceRoles(id, body.roleIds, actor);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Get(":id")
  @ApiOperation({ summary: "Consultar utilizador" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  async show(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return await this.usersService.getById(id);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Patch(":id")
  @ApiOperation({ summary: "Atualizar utilizador" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @ResponseMessage(UsersMessages.OK)
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: Actor
  ) {
    requireOwnerOrAdmin(actor, id);
    return await this.usersService.update(id, body, actor);
  }

  @Put(":id")
  @ApiOperation({ summary: "Atualizar utilizador", description: "Compatibilidade: este PUT aceita atualização parcial, tal como PATCH; os campos omitidos mantêm-se." })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  @ResponseMessage(UsersMessages.OK)
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  async replace(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: UpdateUserDto, @CurrentUser() actor: Actor) {
    requireOwnerOrAdmin(actor, id);
    return this.usersService.update(id, body, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(SystemRole.ADMIN)
  @Delete(":id")
  @ApiOperation({ summary: "Eliminar utilizador" })
  @ApiBearerAuth("bearer")
  @ApiParam({ name: "id", description: "Identificador UUID", schema: { type: "string", format: "uuid" } })
  async destroy(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() actor: Actor) {
    await this.usersService.delete(id, actor);
  }
}
