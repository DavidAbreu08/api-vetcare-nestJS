import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { catalogAttributes } from "../core/catalog";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeJobTitleEntity } from "../employees/entities/employee-job-title.entity";
import { CreateJobTitleDto, UpdateJobTitleDto } from "./dto/create-job-title.dto";
import { JobTitleEntity } from "./entities/job-title.entity";
import { JobTitleMessage } from "./job-titles.messages";
import { SystemSettingEntity } from "../system-settings/entities/system-setting.entity";
import { JOB_TITLE_ID_SETTING_SUFFIX } from "../system-settings/enums/system-setting-code.enum";

const LOCK = { mode: "pessimistic_write" } as const;

/** Job-title catalog rules: immutable codes; referenced entries are deactivated, not deleted. */
@Injectable()
export class JobTitlesBusinessService {
  constructor(
    @InjectRepository(JobTitleEntity) private readonly repository: Repository<JobTitleEntity>,
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
  ) {}

  getAll(query: ListQueryDto) {
    return this.persistence.execute(() => this.repository.find({ skip: query.skip, take: query.take, order: { name: "ASC", id: "ASC" } }));
  }

  async getById(id: string) {
    if (typeof id !== "string" || !id.trim()) throw new BadRequestException(JobTitleMessage.Invalid);
    const row = await this.persistence.execute(() => this.repository.findOneBy({ id }));
    if (!row) throw new NotFoundException(JobTitleMessage.NotFound);
    return row;
  }

  create(dto: CreateJobTitleDto) {
    const attributes = catalogAttributes(dto, () => new BadRequestException(JobTitleMessage.Invalid));
    return this.persistence.execute(() => this.repository.save(this.repository.create({ ...attributes, isActive: dto.isActive ?? true })));
  }

  /**
   * Locks the job-title row (UPDLOCK) inside the caller's transaction; 404 when missing. Setting changes lock the
   * setting row and then this row (validateJobTitleReference), so a setting pointed here commits first or sees the
   * deactivation; this side only reads the settings afterwards (no setting lock), so no cycle is formed.
   */
  private async lockJobTitle(manager: EntityManager, id: string): Promise<JobTitleEntity> {
    if (typeof id !== "string" || !id.trim()) throw new BadRequestException(JobTitleMessage.Invalid);
    const row = await manager.findOne(JobTitleEntity, { where: { id }, lock: LOCK });
    if (!row) throw new NotFoundException(JobTitleMessage.NotFound);
    return row;
  }

  /** True when a *_JOB_TITLE_ID setting references the job title, read from vc_system_settings (never the cache). */
  private async isReferencedBySetting(manager: EntityManager, jobTitleId: string): Promise<boolean> {
    const id = jobTitleId.toLowerCase();
    const settings = await manager.find(SystemSettingEntity, { select: { code: true, value: true } });
    return settings.some(setting => setting.code.endsWith(JOB_TITLE_ID_SETTING_SUFFIX) && setting.value?.trim().toLowerCase() === id);
  }

  async update(id: string, dto: UpdateJobTitleDto) {
    const attributes = catalogAttributes(dto, () => new BadRequestException(JobTitleMessage.Invalid));
    return this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const row = await this.lockJobTitle(manager, id);
      if (attributes.code !== undefined && attributes.code !== row.code) throw new ConflictException(JobTitleMessage.ImmutableCode);
      // A job title referenced by a *_JOB_TITLE_ID setting can be neither deactivated nor deleted (as roles).
      if (attributes.isActive === false && row.isActive && await this.isReferencedBySetting(manager, row.id)) {
        throw new ConflictException(JobTitleMessage.SystemJobTitle);
      }
      Object.assign(row, attributes);
      return manager.save(row);
    }));
  }

  async delete(id: string) {
    await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const row = await this.lockJobTitle(manager, id);
      if (await this.isReferencedBySetting(manager, row.id)) throw new ConflictException(JobTitleMessage.SystemJobTitle);
      if (await manager.count(EmployeeJobTitleEntity, { where: { jobTitleId: row.id } })) throw new ConflictException(JobTitleMessage.InUse);
      await manager.remove(row);
    }));
  }
}
