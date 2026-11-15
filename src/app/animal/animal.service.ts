import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { AnimalBusinessService } from "./animal.business.service";
import { CreateAnimalDto } from "./dto/create-animal.dto";
import { UpdateAnimalDto } from "./dto/update-animal.dto";
import { ListAnimalsQueryDto } from "./dto/list-animals-query.dto";

/**
 * Animal application entry points.
 * Each call delegates authorization, catalog consistency and lifecycle rules to AnimalBusinessService.
 * SQL details and error numbers belong to the shared persistence layer.
 */
@Injectable()
export class AnimalService {
  constructor(private readonly business: AnimalBusinessService) {}

  /** Lists active animals using validated pagination and caller-scoped filters. */
  getAll(query: ListAnimalsQueryDto, actor: Actor) { return this.business.getAll(query, actor); }
  /** Returns one active animal after verifying the caller's access. */
  getById(id: string, actor: Actor) { return this.business.getById(id, actor); }
  /** Creates an animal; verification status is decided by the business rules. */
  create(dto: CreateAnimalDto, actor: Actor) { return this.business.create(dto, actor); }
  /** Updates provided fields and validates retained or replaced taxonomy relations. */
  update(id: string, dto: UpdateAnimalDto, actor: Actor) { return this.business.update(id, dto, actor); }
  /** Keeps historical reservation references by soft-deleting the animal. */
  delete(id: string) { return this.business.delete(id); }
  /** Administrative verification action retained for existing clients. */
  confirm(id: string) { return this.business.confirm(id); }
  /** Compatibility route; the canonical collection endpoint provides pagination. */
  findAll() { return this.business.findAll(); }
  /** Compatibility route scoped to an existing owner. */
  findByOwner(ownerId: string, actor: Actor) { return this.business.findByOwner(ownerId, actor); }
}