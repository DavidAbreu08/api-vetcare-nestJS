import { Injectable } from "@nestjs/common";
import { EntityManager, FindOptionsWhere } from "typeorm";
import { UsersEntity } from "./entities/users.entity";
import { AccountSystemRole, NewAccount, UsersBusinessService } from "./users.business.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { Actor } from "../core/authorization";

@Injectable()
export class UsersService {
  constructor(private readonly business: UsersBusinessService) {}
  getAll(query: ListUsersQueryDto = new ListUsersQueryDto()) { return this.business.getAll(query); }
  getById(id: string) { return this.business.findOneOrFail({ id }); }
  create(data: CreateUserDto) { return this.business.create(data); }
  delete(id: string) { return this.business.delete(id); }
  findAllClients() { return this.business.findAllClients(); }
  checkEmailExists(email: string) { return this.business.checkEmailExists(email); }
  findForAuthentication(where: FindOptionsWhere<UsersEntity>) { return this.business.findForAuthentication(where); }
  findOneOrFail(where: FindOptionsWhere<UsersEntity> | FindOptionsWhere<UsersEntity>[]) { return this.business.findOneOrFail(where); }
  loadActor(id: string) { return this.business.loadActor(id); }
  getAccountProfile(id: string) { return this.business.getAccountProfile(id); }
  createAccount(manager: EntityManager, data: NewAccount, roles: AccountSystemRole[], assignedBy: string | null) { return this.business.createAccount(manager, data, roles, assignedBy); }
  storeClient(data: CreateClientDto, actor: Actor | null) { return this.business.createClient(data, actor); }
  update(id: string, data: UpdateUserDto, actor: Actor) { return this.business.update(id, data, actor); }
  updatePasswordHash(id: string, passwordHash: string) { return this.business.updatePasswordHash(id, passwordHash); }
  getRoles(id: string) { return this.business.getRoles(id); }
  replaceRoles(id: string, roleIds: string[], actor: Actor) { return this.business.replaceRoles(id, roleIds, actor); }
}
