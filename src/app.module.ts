import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { UsersModule } from "./app/users/users.module";
import { AuthModule } from './auth/auth.module';
import * as cors from 'cors';
import { AuthenticateJWT } from "./auth/authenticateJWT.middleware";
import { EmailModule } from './email/email.module';
import { AnimalModule } from './app/animal/animal.module';


@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: process.env.TYPEORM_CONNECTION,
      host: process.env.TYPEORM_HOST,
      port: process.env.TYPEORM_PORT,
      username: process.env.TYPEORM_USERNAME,
      password: process.env.TYPEORM_PASSWORD,
      database: process.env.TYPEORM_DATABASE,
      entities: [__dirname + "/**/*.entity{.ts,.js}"],
      synchronize: false, //em dev
    } as TypeOrmModuleOptions),
    UsersModule,
    AuthModule,
    EmailModule,
    AnimalModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule{
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(
      cors({
        origin: 'http://localhost:4200', // Allow Angular
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }),
    ).forRoutes('*'); // Apply to all routes
    consumer
      .apply(AuthenticateJWT)
      .forRoutes('auth', 'api/auth/me')
  }
}
