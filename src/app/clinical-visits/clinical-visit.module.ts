import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryModule } from "../reservation-history/reservation-history.module";
import { ClinicalVisitBusinessService } from "./clinical-visit.business.service";
import { ClinicalVisitController } from "./clinical-visit.controller";
import { ClinicalVisitService } from "./clinical-visit.service";
import { ClinicalVisitEntity } from "./entities/clinical-visit.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ClinicalVisitEntity, ReservationEntity]), ReservationHistoryModule],
  controllers: [ClinicalVisitController],
  providers: [ClinicalVisitService, ClinicalVisitBusinessService],
  exports: [ClinicalVisitService],
})
export class ClinicalVisitModule {}
