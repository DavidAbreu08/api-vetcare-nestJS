import { Injectable, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";
import { TimeUtilsService } from "./time-utils.service";
import { overlaps, minutes, dateKey, policyError } from "./reservation-policy";
import { CreateBlockedTimeDto } from "./dto/create-blocked-time.dto";

@Injectable()
export class BlockedTimeService {
  constructor(
    @InjectRepository(BlockedTimeEntity)
    private readonly blockedTimeRepository: Repository<BlockedTimeEntity>,

    private readonly timeUtils: TimeUtilsService
  ) {}

  // TODO: Enhance Time-Blocking Function to Support Blocking a Time Interval

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
    if (minutes(dto.timeEnd) <= minutes(dto.timeStart)) policyError('INVALID_INTERVAL', 'End time must be after start time');
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
      throw new ConflictException("Time range is already blocked");
    }

    return this.blockedTimeRepository.save({
      ...dto,
      date: new Date(dateKey(dto.date) + "T00:00:00Z"),
      start: startDateTime,
      end: endDateTime,
      timeStart: dto.timeStart,
      timeEnd: dto.timeEnd,
      reason: dto.reason ?? "No reason provided",
    });
  }
}
