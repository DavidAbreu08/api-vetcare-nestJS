import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UsersBusinessService } from "./users.business.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersEntity } from "./entities/users.entity";
import { EmailModule } from "src/email/email.module";
import { ResetTokenEntity } from "src/auth/entities/reset-token.entity";
import { ResetTokenEntityRepository } from "src/auth/repository/reset-token.repository";
import { DataSource } from "typeorm";

@Module({
  imports: [
    TypeOrmModule.forFeature([UsersEntity]),
    EmailModule,
    TypeOrmModule.forFeature([ResetTokenEntity]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersBusinessService,
    {
      provide: ResetTokenEntityRepository,
      useFactory: (dataSource: DataSource) =>
        new ResetTokenEntityRepository(dataSource),
      inject: [DataSource],
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
