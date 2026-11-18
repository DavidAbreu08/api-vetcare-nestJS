import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { ClinicServicesBusinessService } from "./clinic-services.business.service";
import { CreateClinicServiceDto, ListClinicServicesQueryDto, UpdateClinicServiceDto } from "./dto/clinic-service.dto";

/** Application entry points for the services (clinic services catalog) resource. */
@Injectable()
export class ClinicServicesService {
  constructor(private readonly business: ClinicServicesBusinessService) {}
  getAll(query: ListClinicServicesQueryDto, actor: Actor) { return this.business.getAll(query, actor); }
  getById(id: string, actor: Actor) { return this.business.getById(id, actor); }
  getEmployees(id: string, actor: Actor) { return this.business.getEmployees(id, actor); }
  create(dto: CreateClinicServiceDto) { return this.business.create(dto); }
  update(id: string, dto: UpdateClinicServiceDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
