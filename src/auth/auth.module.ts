import { jwtSecret } from './jwt-secret';
import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "src/app/users/users.module";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { LocalStrategy } from "./strategies/local.strategies";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { ScheduleModule } from "@nestjs/schedule";
import { EmailModule } from "src/email/email.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ResetTokenEntity } from "src/auth/entities/reset-token.entity";
import { ResetTokenEntityRepository } from "./repository/reset-token.repository";
import { DataSource } from "typeorm";
import { ResetTokenService } from "./reset-token.service";

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    UsersModule,
    PassportModule,
    EmailModule,
    JwtModule.registerAsync({
      useFactory: () => ({ secret: jwtSecret(), signOptions: { expiresIn: "1h" } }),
    }),
    // ThrottlerModule.forRoot (global) is registered in AppModule; ThrottlerGuard is used only on routes.
    TypeOrmModule.forFeature([ResetTokenEntity]),
  ],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    ResetTokenService,
    {
      provide: ResetTokenEntityRepository,
      useFactory: (dataSource: DataSource) =>
        new ResetTokenEntityRepository(dataSource),
      inject: [DataSource],
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
