import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { isUUID } from "class-validator";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { SystemRole } from "../core/enums/system-role.enum";
import { UpdateSystemSettingDto } from "./dto/update-system-setting.dto";
import { ROLE_ID_SETTING_SUFFIX, SystemSettingCode } from "./enums/system-setting-code.enum";
import { SystemSettingsBusinessService } from "./system-settings.business.service";
import { SystemSettingMessage } from "./system-settings.messages";

export type SystemRoleFlags = { isAdmin: boolean; isEmployee: boolean; isClient: boolean };

/**
 * Application entry point for settings. Keeps an in-memory snapshot (short TTL, invalidated
 * on every update through this service) and resolves system-role keys to role ids.
 */
@Injectable()
export class SystemSettingsService {
  static readonly CACHE_TTL_MS = 60_000;
  private cache: { loadedAt: number; values: Promise<Map<string, string | null>> } | null = null;

  constructor(private readonly business: SystemSettingsBusinessService) {}

  getAll(query: ListQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }

  async update(id: string, dto: UpdateSystemSettingDto) {
    try {
      return await this.business.update(id, dto);
    } finally {
      // Runs once the transaction has committed (or rolled back); other instances refresh within the TTL.
      this.invalidate();
    }
  }

  invalidate(): void { this.cache = null; }

  private values(): Promise<Map<string, string | null>> {
    const now = Date.now();
    if (!this.cache || now - this.cache.loadedAt >= SystemSettingsService.CACHE_TTL_MS) {
      const values = this.business.loadAll().then(rows => new Map(rows.map(row => [row.code, row.value] as const)));
      // A failed load must not be cached.
      values.catch(() => { if (this.cache?.values === values) this.cache = null; });
      this.cache = { loadedAt: now, values };
    }
    return this.cache.values;
  }

  async getValue(code: SystemSettingCode | string): Promise<string | null> {
    return (await this.values()).get(code) ?? null;
  }

  /** Fails closed: a missing or malformed role setting is a server misconfiguration. */
  async resolveRoleId(role: SystemRole): Promise<string> {
    const value = (await this.getValue(role))?.trim();
    if (!value || !isUUID(value)) throw new InternalServerErrorException(SystemSettingMessage.Misconfigured);
    return value.toLowerCase();
  }

  resolveRoleIds(roles: readonly SystemRole[]): Promise<string[]> {
    return Promise.all([...new Set(roles)].map(role => this.resolveRoleId(role)));
  }

  async systemRoleFlags(roleIds: readonly string[]): Promise<SystemRoleFlags> {
    const owned = new Set(roleIds.map(id => id.toLowerCase()));
    const [admin, employee, client] = await this.resolveRoleIds([SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT]);
    return { isAdmin: owned.has(admin), isEmployee: owned.has(employee), isClient: owned.has(client) };
  }

  /** True when any *_ROLE_ID setting references the role. */
  async isReferencedRole(roleId: string): Promise<boolean> {
    const id = roleId.toLowerCase();
    for (const [code, value] of await this.values()) {
      if (code.endsWith(ROLE_ID_SETTING_SUFFIX) && value?.trim().toLowerCase() === id) return true;
    }
    return false;
  }
}
