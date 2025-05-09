import { Injectable, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";
import { TimeUtilsService } from "./time-utils.service";
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

    return blockedTimes.some((blocked) => {
      const blockedTimeStart = blocked.timeStart;
      const blockedTimeEnd = blocked.timeEnd;
      return (
        this.timeUtils.compareTimes(blockedTimeStart, timeStart) >= 0 &&
        this.timeUtils.compareTimes(blockedTimeEnd, timeEnd) < 0
      );
    });
  }

  async getBlockedTimesForDate(date: Date): Promise<BlockedTimeEntity[]> {
    return this.blockedTimeRepository.find({ where: { date } });
  }

  async createBlockedTime(
    dto: CreateBlockedTimeDto
  ): Promise<BlockedTimeEntity> {
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
      start: startDateTime,
      end: endDateTime,
      timeStart: dto.timeStart,
      timeEnd: dto.timeEnd,
      reason: dto.reason ?? "No reason provided",
    });
  }
}
