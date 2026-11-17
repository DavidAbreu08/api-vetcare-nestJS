import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { BlockedTimeBusinessService } from "./blocked-time.business.service";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";

@Injectable()
export class BlockedTimeService {
  constructor(private readonly business: BlockedTimeBusinessService) {}
  getAll(query: ListBlockedTimesQueryDto) { return this.business.getAll(query); }
  getById(id: string) { return this.business.getById(id); }
  create(dto: CreateBlockedTimeDto, actor: Actor) { return this.business.create(dto, actor); }
  update(id: string, dto: UpdateBlockedTimeDto) { return this.business.update(id, dto); }
  delete(id: string) { return this.business.delete(id); }
}
