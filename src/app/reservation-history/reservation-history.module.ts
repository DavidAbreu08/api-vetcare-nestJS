import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReservationHistoryEntity } from "./entities/reservation-history.entity";
import { ReservationHistoryService } from "./reservation-history.service";

/** Internal history writer shared by reservations and clinical visits (no controller). */
@Module({
  imports: [TypeOrmModule.forFeature([ReservationHistoryEntity])],
  providers: [ReservationHistoryService],
  exports: [ReservationHistoryService],
})
export class ReservationHistoryModule {}
