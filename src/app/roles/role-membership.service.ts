import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SystemRole } from "../core/enums/system-role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";

/** Read-only queries about the roles held by a user; only active roles count. */
@Injectable()
export class RoleMembershipService {
  constructor(
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    private readonly persistence: PersistenceService,
    private readonly settings: SystemSettingsService,
  ) {}

  async activeRolesOf(userId: string): Promise<RoleEntity[]> {
    const rows = await this.persistence.execute(() => this.userRoles.find({
      where: { userId, role: { isActive: true } },
      relations: { role: true },
      order: { role: { name: "ASC" } },
    }));
    return rows.map(row => row.role);
  }

  async hasSystemRole(userId: string, role: SystemRole): Promise<boolean> {
    const roleId = await this.settings.resolveRoleId(role);
    const count = await this.persistence.execute(() => this.userRoles.count({ where: { userId, roleId, role: { isActive: true } } }));
    return count > 0;
  }
}
