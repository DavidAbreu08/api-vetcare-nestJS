import { Module } from "@nestjs/common";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";

/** GET /availability. Stateless; depends only on the global DataSource, PersistenceService and SystemSettingsService. */
@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
