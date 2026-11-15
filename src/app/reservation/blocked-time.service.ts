import { Injectable } from "@nestjs/common";
import { BlockedTimeBusinessService } from "./blocked-time.business.service";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";

@Injectable()
export class BlockedTimeService {
  constructor(private readonly business: BlockedTimeBusinessService) {}
  getAll(query: ListBlockedTimesQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  create(dto: CreateBlockedTimeDto) { return this.business.createBlockedTime(dto); }
  findAll(query: ListBlockedTimesQueryDto) { return this.business.getAll(query); }
  findOne(id: string) { return this.business.getById(id); }
  update(id: string, dto: UpdateBlockedTimeDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
  isTimeRangeBlocked(date: Date, start: string, end: string) { return this.business.isTimeRangeBlocked(date, start, end); }
  getBlockedTimesForDate(date: Date) { return this.business.getBlockedTimesForDate(date); }
  createBlockedTime(dto: CreateBlockedTimeDto) { return this.business.createBlockedTime(dto); }
}
