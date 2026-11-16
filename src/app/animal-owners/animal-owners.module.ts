import { Module } from "@nestjs/common";
import { ReservationHistoryModule } from "../reservation-history/reservation-history.module";
import { RolesModule } from "../roles/roles.module";
import { AnimalAccessModule } from "./animal-access.module";
import { AnimalOwnersBusinessService } from "./animal-owners.business.service";
import { AnimalOwnersController } from "./animal-owners.controller";

/**
 * Tutorship management routes (/api/animal/:id/owners, /api/animal/:id/transfer). Depends only on leaf modules
 * (access, roles, reservation history), so AnimalModule can import it without a cycle.
 */
@Module({
  imports: [AnimalAccessModule, RolesModule, ReservationHistoryModule],
  controllers: [AnimalOwnersController],
  providers: [AnimalOwnersBusinessService],
  exports: [AnimalOwnersBusinessService, AnimalAccessModule] })
export class AnimalOwnersModule {}
