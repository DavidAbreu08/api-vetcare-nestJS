import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBlockedTimeDto } from './dto/create-blocked-time.dto';
import { BlockedTimeEntity } from './entities/bloked-times.entity';
import * as moment from 'moment';

@Injectable()
export class BlockedTimeService {
  constructor(
    @InjectRepository(BlockedTimeEntity)
    private readonly blockedTimeRepository: Repository<BlockedTimeEntity>,
  ) {}
  
  // TODO: Enhance Time-Blocking Function to Support Blocking a Time Interval
  async createBlockedTime(dto: CreateBlockedTimeDto) {
    const normalizedDate = moment(dto.date).startOf('day').toDate();
    const normalizedTime = moment(dto.time, ['HH:mm', 'HH:mm:ss']).format('HH:mm');

    const existingBlock = await this.blockedTimeRepository.findOne({
      where: { date: normalizedDate, time: normalizedTime },
    });

    if (existingBlock) {
      throw new BadRequestException('This time slot is already blocked.');
    }

    const blockedTime = this.blockedTimeRepository.create({
      ...dto,
      date: normalizedDate,
      time: normalizedTime,
    });

    return this.blockedTimeRepository.save(blockedTime);
  }
}
