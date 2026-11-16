import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { BlockedTimeMessages } from "./blocked-time.messages";
import { PersistenceService } from "../core/persistence/persistence.service";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";
import { TimeUtilsService } from "./time-utils.service";
import { overlaps, minutes, dateKey, policyError } from "../reservation/reservation-policy";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";
import { UpdateBlockedTimeDto } from "./dto/update-blocked-time.dto";
import { ListBlockedTimesQueryDto } from "./dto/list-blocked-times-query.dto";

@Injectable()
export class BlockedTimeBusinessService {
  getAll(query: ListBlockedTimesQueryDto) {
    return this.blockedTimeRepository.find({
      where: query.date ? { date: new Date(dateKey(query.date) + "T00:00:00Z") } : {},
      skip: query.skip, take: query.take,
      order: { date: "ASC", timeStart: "ASC", id: "ASC" },
    });
  }

  async getById(id: string) {
    const blocked = await this.blockedTimeRepository.findOne({ where: { id } });
    if (!blocked) throw applicationError(ErrorMetadata.NOT_FOUND, BlockedTimeMessages.NOT_FOUND);
    return blocked;
  }

  async update(id: string, dto: UpdateBlockedTimeDto) {
    const blocked = await this.getById(id);
    const date = dto.date ?? blocked.date;
    const timeStart = dto.timeStart ?? blocked.timeStart;
    const timeEnd = dto.timeEnd ?? blocked.timeEnd;
    dateKey(date);
    if (minutes(timeEnd) <= minutes(timeStart)) policyError('INVALID_INTERVAL', BlockedTimeMessages.INVALID_INTERVAL);
    const existing = await this.blockedTimeRepository.find({ where: { date: new Date(dateKey(date) + "T00:00:00Z") } });
    if (existing.some(other => other.id !== id && overlaps(timeStart, timeEnd, other.timeStart, other.timeEnd))) {
      throw applicationError(ErrorMetadata.ALREADY_EXISTS, BlockedTimeMessages.TIME_ALREADY_BLOCKED);
    }
    for (const field of ["name", "description", "notes"] as const) {
      if (dto[field] !== undefined) blocked[field] = dto[field];
    }
    Object.assign(blocked, {
      date: new Date(dateKey(date) + "T00:00:00Z"), timeStart, timeEnd,
      start: this.timeUtils.combineDateAndTime(date, timeStart),
      end: this.timeUtils.combineDateAndTime(date, timeEnd),
      reason: dto.reason ?? blocked.reason,
    });
    return this.persistence.execute(() => this.blockedTimeRepository.save(blocked));
  }

  async delete(id: string) {
    const blocked = await this.getById(id);
    await this.persistence.execute(() => this.blockedTimeRepository.remove(blocked));
  }

  constructor(
    private readonly persistence: PersistenceService,
    @InjectRepository(BlockedTimeEntity)
    private readonly blockedTimeRepository: Repository<BlockedTimeEntity>,

    private readonly timeUtils: TimeUtilsService
  ) {}

  async isTimeRangeBlocked(
    date: Date,
    timeStart: string,
    timeEnd: string
  ): Promise<boolean> {
    const blockedTimes = await this.blockedTimeRepository.find({
      where: { date },
    });

    return blockedTimes.some(blocked => overlaps(timeStart, timeEnd, blocked.timeStart, blocked.timeEnd));
  }

  async getBlockedTimesForDate(date: Date): Promise<BlockedTimeEntity[]> {
    return this.blockedTimeRepository.find({ where: { date } });
  }

  async createBlockedTime(
    dto: CreateBlockedTimeDto
  ): Promise<BlockedTimeEntity> {
    dateKey(dto.date);
    if (minutes(dto.timeEnd) <= minutes(dto.timeStart)) policyError('INVALID_INTERVAL', BlockedTimeMessages.INVALID_INTERVAL);
    // Create datetime objects for database storage
    const startDateTime = this.timeUtils.combineDateAndTime(
      dto.date,
      dto.timeStart
    );
    const endDateTime = this.timeUtils.combineDateAndTime(
      dto.date,
      dto.timeEnd
    );

    const hasReservation = await this.isTimeRangeBlocked(
      dto.date,
      dto.timeStart,
      dto.timeEnd
    );

    if (hasReservation) {
      throw applicationError(ErrorMetadata.ALREADY_EXISTS, BlockedTimeMessages.TIME_ALREADY_BLOCKED);
    }

    return this.persistence.execute(() => this.blockedTimeRepository.save({
      ...dto,
      date: new Date(dateKey(dto.date) + "T00:00:00Z"),
      start: startDateTime,
      end: endDateTime,
      timeStart: dto.timeStart,
      timeEnd: dto.timeEnd,
      reason: dto.reason ?? BlockedTimeMessages.DEFAULT_REASON,
    }));
  }
}
