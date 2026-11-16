import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { Actor } from "../core/authorization";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { EmployeeJobTitleEntity } from "./entities/employee-job-title.entity";

/**
 * Professional qualifications of the caller, resolved through *_JOB_TITLE_ID system settings (job titles are data;
 * code only knows the setting keys). A qualification is held by an active employee (Actor.isEmployee: EMPLOYEE role
 * and an active profile) whose profile has the referenced job title in vc_employee_job_titles. A missing or empty
 * setting means the qualification is not configured: nobody holds it. The referenced job title must also be active
 * (vc_job_titles.is_active = 1, read with the assignment): the setting and job-title rules keep it active while
 * referenced, but the check fails closed if the setting cache is stale or the rules are bypassed. Administrators
 * are not qualified by this rule: callers grant them their own powers explicitly.
 */
@Injectable()
export class EmployeeQualificationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SystemSettingsService,
  ) {}

  async holdsJobTitle(actor: Actor, setting: SystemSettingCode, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    if (!actor.isEmployee || !actor.employeeId) return false;
    const jobTitleId = await this.settings.getJobTitleId(setting);
    if (!jobTitleId) return false;
    return (await manager.count(EmployeeJobTitleEntity, { where: { employeeId: actor.employeeId, jobTitleId, jobTitle: { isActive: true } } })) > 0;
  }

  /** Active employee holding the job title of VETERINARIAN_JOB_TITLE_ID. */
  isVeterinarian(actor: Actor, manager?: EntityManager): Promise<boolean> {
    return this.holdsJobTitle(actor, SystemSettingCode.VETERINARIAN_JOB_TITLE_ID, manager);
  }
}
