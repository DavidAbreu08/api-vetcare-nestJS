import { Injectable } from "@nestjs/common";
import { FindOptionsWhere } from "typeorm";
import { UsersEntity } from "./entities/users.entity";
import { UsersBusinessService } from "./users.business.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateClientDto } from "./dto/create-client.dto";
import { CreateEmployeesDto } from "./dto/create-employees.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";

@Injectable()
export class UsersService {
  constructor(private readonly business: UsersBusinessService) {}
  getAll(query: ListUsersQueryDto = new ListUsersQueryDto()) { return this.business.getAll(query); }
  getById(id: string) { return this.business.findOneOrFail({ id }); }
  create(data: CreateUserDto) { return this.business.create(data); }
  delete(id: string) { return this.business.delete(id); }
  findAll(query: ListUsersQueryDto = new ListUsersQueryDto()) { return this.business.getAll(query); }
  findAllClients() { return this.business.findAllClients(); }
  findEmployees() { return this.business.findEmployees(); }
  getAvailableEmployeesByDate(date: Date) { return this.business.getAvailableEmployeesByDate(date); }
  checkEmailExists(email: string) { return this.business.checkEmailExists(email); }
  findForAuthentication(where: FindOptionsWhere<UsersEntity>) { return this.business.findForAuthentication(where); }
  findOneOrFail(where: FindOptionsWhere<UsersEntity> | FindOptionsWhere<UsersEntity>[]) { return this.business.findOneOrFail(where); }
  store(data: CreateUserDto) { return this.business.create(data); }
  storeClient(data: CreateClientDto) { return this.business.createClient(data); }
  storeEmployees(data: CreateEmployeesDto) { return this.business.createEmployee(data); }
  update(id: string, data: UpdateUserDto) { return this.business.update(id, data); }
  updateEmployee(id: string, data: UpdateFuncionarioDto) { return this.business.updateEmployee(id, data); }
  destroy(id: string) { return this.business.delete(id); }
  save(user: UsersEntity) { return this.business.save(user); }
}
