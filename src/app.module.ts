import "./database/environment";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { databaseOptions, databaseEnvFile } from "./database/database.config";
import { UsersModule } from "./app/users/users.module";
import { AuthModule } from "./auth/auth.module";
import { EmailModule } from "./email/email.module";
import { AnimalModule } from "./app/animal/animal.module";
import { ReservationModule } from "./app/reservation/reservation.module";
import { BlockedTimeModule } from "./app/reservation/blocked-time.module";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: databaseEnvFile(), isGlobal: true }),
    TypeOrmModule.forRoot(databaseOptions()),
    UsersModule,
    AuthModule,
    EmailModule,
    AnimalModule,
    ReservationModule,
    BlockedTimeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
