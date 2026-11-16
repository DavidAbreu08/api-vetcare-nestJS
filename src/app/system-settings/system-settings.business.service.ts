import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { isUUID } from "class-validator";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { RoleEntity } from "../roles/entities/role.entity";
import { JobTitleEntity } from "../job-titles/entities/job-title.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { clinicToday } from "../employees/employee-status";
import { UpdateSystemSettingDto } from "./dto/update-system-setting.dto";
import { SystemSettingEntity } from "./entities/system-setting.entity";
import { JOB_TITLE_ID_SETTING_SUFFIX, NON_NEGATIVE_INTEGER_SETTINGS, ROLE_ID_SETTING_SUFFIX, SystemSettingCode } from "./enums/system-setting-code.enum";
import { SystemSettingMessage } from "./system-settings.messages";

const LOCK = { mode: "pessimistic_write" } as const;
const ROLE_SETTING_CODES: string[] = Object.values(SystemSettingCode).filter(code => code.endsWith(ROLE_ID_SETTING_SUFFIX));

const normalizedRoleId = (value: string | null | undefined) =>
  typeof value === "string" && isUUID(value.trim()) ? value.trim().toLowerCase() : null;

/** Lowercase UUID of a *_JOB_TITLE_ID setting value, or null when absent or malformed. */
export const normalizedJobTitleId = normalizedRoleId;

/** Largest value accepted by SQL Server int (minutes used in date arithmetic). */
const MAX_SETTING_INTEGER = 2147483647;

/** Canonical decimal text of a non-negative integer setting, or null when invalid. */
export function normalizedNonNegativeInteger(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed <= MAX_SETTING_INTEGER ? String(parsed) : null;
}

/** Reads and validates settings; caching and role resolution live in SystemSettingsService. */
@Injectable()
export class SystemSettingsBusinessService {
  constructor(
    @InjectRepository(SystemSettingEntity) private readonly repository: Repository<SystemSettingEntity>,
    private readonly dataSource: DataSource,
    private readonly persistence: PersistenceService,
  ) {}

  loadAll() { return this.persistence.execute(() => this.repository.find()); }

  getAll(query: ListQueryDto) {
    return this.persistence.execute(() => this.repository.find({ skip: query.skip, take: query.take, order: { code: "ASC" } }));
  }

  private assertId(id: string) {
    if (typeof id !== "string" || !id.trim()) throw applicationError(ErrorMetadata.INVALID_VALUE, SystemSettingMessage.Invalid);
  }

  async getById(id: string) {
    this.assertId(id);
    const row = await this.persistence.execute(() => this.repository.findOneBy({ id }));
    if (!row) throw applicationError(ErrorMetadata.NOT_FOUND, SystemSettingMessage.NotFound);
    return row;
  }

  /**
   * Role settings must point to an active role not referenced by another *_ROLE_ID setting; the
   * administrator role must keep at least one active holder and EMPLOYEE must be held by every active
   * employee. Runs inside the update transaction: every *_ROLE_ID row (and the previous and new role
   * rows) is locked first, so concurrent setting changes and last-administrator checks serialize.
   */
  private async validateRoleReference(manager: EntityManager, row: SystemSettingEntity, value: string | null | undefined, siblings: SystemSettingEntity[]): Promise<string> {
    const roleId = normalizedRoleId(value);
    if (!roleId) throw applicationError(ErrorMetadata.INVALID_VALUE, SystemSettingMessage.InvalidRoleReference);
    if (siblings.some(other => other.id !== row.id && normalizedRoleId(other.value) === roleId)) {
      throw applicationError(ErrorMetadata.ALREADY_EXISTS, SystemSettingMessage.DuplicateRoleReference);
    }
    const previousId = normalizedRoleId(row.value);
    const lockedRoles = await manager.find(RoleEntity, {
      where: { id: In([...new Set([roleId, previousId].filter((id): id is string => !!id))]) }, order: { id: "ASC" }, lock: LOCK,
    });
    const role = lockedRoles.find(candidate => candidate.id.toLowerCase() === roleId);
    if (!role || !role.isActive) throw applicationError(ErrorMetadata.INVALID_VALUE, SystemSettingMessage.InvalidRoleReference);
    if (row.code === SystemSettingCode.ADMIN_ROLE_ID) {
      const holders = await manager.count(UserRoleEntity, { where: { roleId, user: { isActive: true } } });
      if (!holders) throw applicationError(ErrorMetadata.CONFLICT, SystemSettingMessage.AdminRoleWithoutUsers);
    }
    if (row.code === SystemSettingCode.EMPLOYEE_ROLE_ID) {
      // Re-pointing EMPLOYEE must not strip the role from any active employee profile.
      const missing = await manager.createQueryBuilder(EmployeeEntity, "employee")
        .innerJoin("employee.user", "user")
        .where("(employee.terminationDate IS NULL OR employee.terminationDate > :today)", { today: clinicToday() })
        .andWhere("NOT EXISTS (SELECT 1 FROM vc_user_roles ur WHERE ur.user_id = employee.userId AND ur.role_id = :roleId)", { roleId })
        .getCount();
      if (missing) throw applicationError(ErrorMetadata.CONFLICT, SystemSettingMessage.EmployeeRoleNotHeld);
    }
    return roleId;
  }

  /**
   * *_JOB_TITLE_ID settings are optional qualifications: null, "" or blank clears the setting (stored as NULL: not
   * configured, nobody holds it; for VETERINARIAN_JOB_TITLE_ID only administrators approve animal data). Otherwise
   * the value must be the UUID of an existing, active job title (400). Lock order setting -> job title: this
   * transaction already holds the setting row and now locks the job-title row (UPDLOCK). Job-title deactivation and
   * deletion lock that same row first and then read vc_system_settings from the database inside their transaction
   * (never the settings cache), so whichever commits first is seen by the other; neither locks in the opposite order.
   */
  private async validateJobTitleReference(manager: EntityManager, value: string | null | undefined): Promise<string | null> {
    if (value === null || (typeof value === "string" && !value.trim())) return null;
    const jobTitleId = normalizedJobTitleId(value);
    if (!jobTitleId) throw applicationError(ErrorMetadata.INVALID_VALUE, SystemSettingMessage.InvalidJobTitleReference);
    const jobTitle = await manager.findOne(JobTitleEntity, { where: { id: jobTitleId }, lock: LOCK });
    if (!jobTitle || !jobTitle.isActive) throw applicationError(ErrorMetadata.INVALID_VALUE, SystemSettingMessage.InvalidJobTitleReference);
    return jobTitleId;
  }

  /** Validation and save share one transaction; the caller invalidates its cache after it ends. */
  async update(id: string, dto: UpdateSystemSettingDto) {
    this.assertId(id);
    return this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const current = await manager.findOne(SystemSettingEntity, { where: { id } });
      if (!current) throw applicationError(ErrorMetadata.NOT_FOUND, SystemSettingMessage.NotFound);
      const isRoleSetting = current.code.endsWith(ROLE_ID_SETTING_SUFFIX);
      // One locking read for all role settings (ordered by key) keeps lock acquisition consistent.
      const locked = await manager.find(SystemSettingEntity, {
        where: { code: In(isRoleSetting ? [...new Set([...ROLE_SETTING_CODES, current.code])] : [current.code]) },
        order: { id: "ASC" }, lock: LOCK,
      });
      const row = locked.find(candidate => candidate.id.toLowerCase() === current.id.toLowerCase()) ?? current;
      if (dto.value !== undefined) {
        if (isRoleSetting) row.value = await this.validateRoleReference(manager, row, dto.value, locked);
        else if (row.code.endsWith(JOB_TITLE_ID_SETTING_SUFFIX)) row.value = await this.validateJobTitleReference(manager, dto.value);
        else if (NON_NEGATIVE_INTEGER_SETTINGS.includes(row.code)) {
          const minutes = normalizedNonNegativeInteger(dto.value);
          if (minutes === null) throw applicationError(ErrorMetadata.INVALID_VALUE, SystemSettingMessage.InvalidNonNegativeInteger);
          row.value = minutes;
        } else row.value = dto.value;
      }
      if (dto.description !== undefined) row.description = dto.description;
      if (dto.notes !== undefined) row.notes = dto.notes;
      return manager.save(row);
    }));
  }
}
