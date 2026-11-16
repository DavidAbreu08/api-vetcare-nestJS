import { Module } from "@nestjs/common";
import { AnimalAccessModule } from "../animal-owners/animal-access.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from "src/email/email.module";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { RolesModule } from "../roles/roles.module";
import { UsersEntity } from "../users/entities/users.entity";
import { ClinicController } from "./clinic.controller";
import { BlockedTimeEntity } from "../blocked-times/entities/bloked-times.entity";
import { ReservationEntity } from "./entities/reservation.entity";
import { ReservationHistoryModule } from "../reservation-history/reservation-history.module";
import { ReservationBusinessService } from "./reservation.business.service";
import { ReservationController } from "./reservation.controller";
import { ReservationService } from "./reservation.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ReservationEntity, BlockedTimeEntity, AnimalEntity, UsersEntity]),
    EmailModule,
    RolesModule,
    ReservationHistoryModule,
    AnimalAccessModule,
  ],
  providers: [ReservationService, ReservationBusinessService],
  controllers: [ReservationController, ClinicController],
  exports: [ReservationService],
})
export class ReservationModule {}
