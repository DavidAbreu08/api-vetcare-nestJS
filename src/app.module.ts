import "./database/environment";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule } from "@nestjs/throttler";
import { databaseOptions, databaseEnvFile } from "./database/database.config";
import { UsersModule } from "./app/users/users.module";
import { AuthModule } from "./auth/auth.module";
import { EmailModule } from "./email/email.module";
import { AnimalModule } from "./app/animal/animal.module";
import { ReservationModule } from "./app/reservation/reservation.module";
import { BlockedTimeModule } from "./app/blocked-times/blocked-time.module";
import { PersistenceModule } from "./app/core/persistence/persistence.module";
import { HttpResponseModule } from "./app/core/http-response.module";
import { SystemSettingsModule } from "./app/system-settings/system-settings.module";
import { RolesModule } from "./app/roles/roles.module";
import { JobTitlesModule } from "./app/job-titles/job-titles.module";
import { EmployeesModule } from "./app/employees/employees.module";
import { ClinicalVisitModule } from "./app/clinical-visits/clinical-visit.module";
import { ClinicServicesModule } from "./app/clinic-services/clinic-services.module";
import { AvailabilityModule } from "./app/availability/availability.module";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: databaseEnvFile(), isGlobal: true }),
    TypeOrmModule.forRoot(databaseOptions()),
    // In-memory store. No APP_GUARD: ThrottlerGuard + @Throttle only on the password recovery routes.
    ThrottlerModule.forRoot([{ name: "default", ttl: 15 * 60 * 1000, limit: 5 }]),
    PersistenceModule,
    HttpResponseModule,
    SystemSettingsModule,
    RolesModule,
    JobTitlesModule,
    EmployeesModule,
    UsersModule,
    AuthModule,
    EmailModule,
    AnimalModule,
    ReservationModule,
    BlockedTimeModule,
    ClinicalVisitModule,
    ClinicServicesModule,
    AvailabilityModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
