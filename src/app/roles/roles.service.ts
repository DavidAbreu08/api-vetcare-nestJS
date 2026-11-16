import { Injectable } from "@nestjs/common";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { CreateRoleDto, UpdateRoleDto } from "./dto/create-role.dto";
import { RolesBusinessService } from "./roles.business.service";

/** Application entry points for the roles resource. */
@Injectable()
export class RolesService {
  constructor(private readonly business: RolesBusinessService) {}
  getAll(query: ListQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  create(dto: CreateRoleDto) { return this.business.create(dto); }
  update(id: string, dto: UpdateRoleDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
