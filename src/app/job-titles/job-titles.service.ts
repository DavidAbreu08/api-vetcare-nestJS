import { Injectable } from "@nestjs/common";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { CreateJobTitleDto, UpdateJobTitleDto } from "./dto/create-job-title.dto";
import { JobTitlesBusinessService } from "./job-titles.business.service";

/** Application entry points for the job-titles resource. */
@Injectable()
export class JobTitlesService {
  constructor(private readonly business: JobTitlesBusinessService) {}
  getAll(query: ListQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  create(dto: CreateJobTitleDto) { return this.business.create(dto); }
  update(id: string, dto: UpdateJobTitleDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
