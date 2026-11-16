import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SystemSettingEntity } from "./entities/system-setting.entity";
import { SystemSettingsBusinessService } from "./system-settings.business.service";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";

/** Global so RolesGuard and business services resolve system roles in every module. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemSettingEntity])],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService, SystemSettingsBusinessService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
