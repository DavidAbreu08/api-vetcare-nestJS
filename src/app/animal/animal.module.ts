import { Module } from "@nestjs/common";
import { AnimalService } from "./animal.service";
import { AnimalController } from "./animal.controller";
import { UsersEntity } from "../users/entities/users.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnimalEntity } from "./entities/animal.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AnimalEntity, UsersEntity])],
  controllers: [AnimalController],
  providers: [AnimalService],
})
export class AnimalModule {}
