import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MeasurementTypeEntity } from "./entities/measurement-type.entity";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { CreateMeasurementTypeDto, UpdateMeasurementTypeDto } from "./dto/create-measurement-type.dto";
import { MeasurementTypeMessage } from "./measurement-type.messages";
/** Validates catalog attributes; database constraints arbitrate concurrent duplicate writes. */
@Injectable()
export class MeasurementTypeBusinessService {
 constructor(@InjectRepository(MeasurementTypeEntity) private readonly repository: Repository<MeasurementTypeEntity>, private readonly persistence: PersistenceService) {}
 getAll(query: ListQueryDto) { return this.persistence.execute(() => this.repository.find({ skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" } })); }
 async getById(id: string) { if (typeof id !== "string" || !id.trim()) throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementTypeMessage.Invalid); const row = await this.persistence.execute(() => this.repository.findOneBy({ id })); if (!row) throw applicationError(ErrorMetadata.NOT_FOUND, MeasurementTypeMessage.NotFound); return row; }
 async requireActive(id: string) { const row = await this.getById(id); if (!row.isActive) throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementTypeMessage.Inactive); return row; }
 private attributes(dto: UpdateMeasurementTypeDto) {
   const result: Partial<MeasurementTypeEntity> = {};
   for (const key of ["code", "name", "unit"] as const) if (dto[key] !== undefined) {
     const raw = dto[key];
     const value = typeof raw === "string" && key === "code" ? raw.trim().toUpperCase() : raw;
     if (typeof value !== "string" || !value.trim() || (key === "code" && !/^[A-Z][A-Z0-9_]*$/.test(value.trim()))) throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementTypeMessage.Invalid);
     result[key] = value.trim();
   }
   if (dto.isActive !== undefined) { if (typeof dto.isActive !== "boolean") throw applicationError(ErrorMetadata.INVALID_VALUE, MeasurementTypeMessage.Invalid); result.isActive = dto.isActive; }
   if (dto.description !== undefined) result.description = dto.description;
   if (dto.notes !== undefined) result.notes = dto.notes;
   return result;
 }
 create(dto: CreateMeasurementTypeDto) { return this.persistence.execute(() => this.repository.save(this.repository.create({ ...this.attributes(dto), isActive: dto.isActive ?? true }))); }
 async update(id: string, dto: UpdateMeasurementTypeDto) { const row = await this.getById(id); const attributes = this.attributes(dto);
 if ((attributes.code !== undefined && attributes.code !== row.code) || (attributes.unit !== undefined && attributes.unit !== row.unit)) {
   throw applicationError(ErrorMetadata.CONFLICT, MeasurementTypeMessage.ImmutableSemantics);
 }
 Object.assign(row, attributes); return this.persistence.execute(() => this.repository.save(row)); }
 async delete(id: string) { const row = await this.getById(id); await this.persistence.execute(() => this.repository.remove(row)); }
}
