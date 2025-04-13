import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockedTimeEntity } from './entities/bloked-times.entity';
import { BlockedTimeController } from './blocked-time.controller';
import { BlockedTimeService } from './blocked-time.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlockedTimeEntity])
  ],
  providers: [BlockedTimeService],
  controllers: [BlockedTimeController]
})
export class BlockedTimeModule {}
