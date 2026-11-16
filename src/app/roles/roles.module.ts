import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { RolesService } from "./roles.service";
import { RolesBusinessService } from "./roles.business.service";
import { RolesController } from "./roles.controller";
import { RoleMembershipService } from "./role-membership.service";

@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, UserRoleEntity])],
  controllers: [RolesController],
  providers: [RolesService, RolesBusinessService, RoleMembershipService],
  exports: [RolesService, RoleMembershipService],
})
export class RolesModule {}
