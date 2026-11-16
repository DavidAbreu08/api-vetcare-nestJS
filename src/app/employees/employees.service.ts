import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from "./dto/create-employee.dto";
import { EmployeesBusinessService } from "./employees.business.service";

/** Application entry points for the employees resource. */
@Injectable()
export class EmployeesService {
  constructor(private readonly business: EmployeesBusinessService) {}
  getAll(query: ListEmployeesQueryDto) { return this.business.getAll(query); }
  getById(id: string, actor: Actor) { return this.business.getById(id, actor); }
  getMine(actor: Actor) { return this.business.getMine(actor); }
  create(dto: CreateEmployeeDto, actor: Actor) { return this.business.create(dto, actor); }
  update(id: string, dto: UpdateEmployeeDto, actor: Actor) { return this.business.update(id, dto, actor); }
  delete(id: string) { return this.business.delete(id); }
  getAvailableByDate(date: string) { return this.business.getAvailableByDate(date); }
}
