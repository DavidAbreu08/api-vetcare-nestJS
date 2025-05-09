import { Module } from "@nestjs/common";
import { ReservationService } from "./reservation.service";
import { ReservationController } from "./reservation.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { UsersEntity } from "../users/entities/users.entity";
import { ReservationEntity } from "./entities/reservation.entity";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";
import { TimeUtilsService } from "./time-utils.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReservationEntity,
      BlockedTimeEntity,
      AnimalEntity,
      UsersEntity,
    ]),
  ],
  providers: [ReservationService, TimeUtilsService],
  controllers: [ReservationController],
})
export class ReservationModule {}
