import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { catalogAttributes } from "../core/catalog";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { CreateRoleDto, UpdateRoleDto } from "./dto/create-role.dto";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { RoleMessage } from "./roles.messages";

/** Role catalog rules: immutable codes, protected system roles, no deletion while referenced. */
@Injectable()
export class RolesBusinessService {
  constructor(
    @InjectRepository(RoleEntity) private readonly repository: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    private readonly persistence: PersistenceService,
    private readonly settings: SystemSettingsService,
  ) {}

  getAll(query: ListQueryDto) {
    return this.persistence.execute(() => this.repository.find({ skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" } }));
  }

  async getById(id: string) {
    if (typeof id !== "string" || !id.trim()) throw applicationError(ErrorMetadata.INVALID_VALUE, RoleMessage.Invalid);
    const row = await this.persistence.execute(() => this.repository.findOneBy({ id }));
    if (!row) throw applicationError(ErrorMetadata.NOT_FOUND, RoleMessage.NotFound);
    return row;
  }

  create(dto: CreateRoleDto) {
    const attributes = catalogAttributes(dto, () => applicationError(ErrorMetadata.INVALID_VALUE, RoleMessage.Invalid));
    return this.persistence.execute(() => this.repository.save(this.repository.create({ ...attributes, isActive: dto.isActive ?? true })));
  }

  async update(id: string, dto: UpdateRoleDto) {
    const row = await this.getById(id);
    const attributes = catalogAttributes(dto, () => applicationError(ErrorMetadata.INVALID_VALUE, RoleMessage.Invalid));
    if (attributes.code !== undefined && attributes.code !== row.code) throw applicationError(ErrorMetadata.CONFLICT, RoleMessage.ImmutableCode);
    if (attributes.isActive === false && row.isActive && await this.settings.isReferencedRole(row.id)) {
      throw applicationError(ErrorMetadata.CONFLICT, RoleMessage.SystemRole);
    }
    Object.assign(row, attributes);
    return this.persistence.execute(() => this.repository.save(row));
  }

  async delete(id: string) {
    const row = await this.getById(id);
    if (await this.settings.isReferencedRole(row.id)) throw applicationError(ErrorMetadata.CONFLICT, RoleMessage.SystemRole);
    if (await this.persistence.execute(() => this.userRoles.count({ where: { roleId: row.id } }))) throw applicationError(ErrorMetadata.IN_USE, RoleMessage.InUse);
    // The FK still arbitrates concurrent assignments (translated to 409).
    await this.persistence.execute(() => this.repository.remove(row));
  }
}
