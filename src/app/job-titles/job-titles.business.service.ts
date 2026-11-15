import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { catalogAttributes } from "../core/catalog";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeJobTitleEntity } from "../employees/entities/employee-job-title.entity";
import { CreateJobTitleDto, UpdateJobTitleDto } from "./dto/create-job-title.dto";
import { JobTitleEntity } from "./entities/job-title.entity";
import { JobTitleMessage } from "./job-titles.messages";

/** Job-title catalog rules: immutable codes; referenced entries are deactivated, not deleted. */
@Injectable()
export class JobTitlesBusinessService {
  constructor(
    @InjectRepository(JobTitleEntity) private readonly repository: Repository<JobTitleEntity>,
    @InjectRepository(EmployeeJobTitleEntity) private readonly assignments: Repository<EmployeeJobTitleEntity>,
    private readonly persistence: PersistenceService,
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

  async update(id: string, dto: UpdateJobTitleDto) {
    const row = await this.getById(id);
    const attributes = catalogAttributes(dto, () => new BadRequestException(JobTitleMessage.Invalid));
    if (attributes.code !== undefined && attributes.code !== row.code) throw new ConflictException(JobTitleMessage.ImmutableCode);
    Object.assign(row, attributes);
    return this.persistence.execute(() => this.repository.save(row));
  }

  async delete(id: string) {
    const row = await this.getById(id);
    if (await this.persistence.execute(() => this.assignments.count({ where: { jobTitleId: row.id } }))) throw new ConflictException(JobTitleMessage.InUse);
    await this.persistence.execute(() => this.repository.remove(row));
  }
}
