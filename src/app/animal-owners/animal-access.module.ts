import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnimalAccessService } from "./animal-access.service";
import { AnimalOwnerEntity } from "./entities/animal-owner.entity";

/** Read side of tutorship, shared by animals, measurements, clinical visits, reservations and accounts (no controller). */
@Module({
  imports: [TypeOrmModule.forFeature([AnimalOwnerEntity])],
  providers: [AnimalAccessService],
  exports: [AnimalAccessService] })
export class AnimalAccessModule {}
