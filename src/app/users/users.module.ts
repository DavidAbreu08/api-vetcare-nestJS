import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UsersBusinessService } from "./users.business.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersEntity } from "./entities/users.entity";
import { EmailModule } from "src/email/email.module";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([UsersEntity, EmployeeEntity]),
    EmailModule,
    RolesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersBusinessService],
  exports: [UsersService],
})
export class UsersModule {}
