import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { PersistenceModule } from "src/app/core/persistence/persistence.module";
import { SystemSettingsModule } from "src/app/system-settings/system-settings.module";
import { SystemSettingEntity } from "src/app/system-settings/entities/system-setting.entity";
import { RoleEntity } from "src/app/roles/entities/role.entity";
import { UserRoleEntity } from "src/app/roles/entities/user-role.entity";
import { UsersEntity } from "src/app/users/entities/users.entity";
import { EmployeeEntity } from "src/app/employees/entities/employee.entity";
import { AuthModule } from "./auth.module";
import { AuthService } from "./auth.service";
import { ResetTokenService } from "./reset-token.service";
import { ResetTokenEntity } from "./entities/reset-token.entity";
import { ThrottlerModule } from "@nestjs/throttler";

@Global()
@Module({ providers: [{ provide: DataSource, useValue: { createEntityManager: () => ({}) } }], exports: [DataSource] })
class FakeDataSourceModule {}

it("resolves AuthModule (route throttler guard, cleanup cron, users) without a database or circular imports", async () => {
  process.env.JWT_SECRET_KEY ??= "test-secret-for-auth-module-spec";
  // ThrottlerModule.forRoot is global and registered in AppModule, as here.
  const builder = Test.createTestingModule({
    imports: [FakeDataSourceModule, ThrottlerModule.forRoot([]), PersistenceModule, SystemSettingsModule, AuthModule],
  });
  for (const entity of [SystemSettingEntity, RoleEntity, UserRoleEntity, UsersEntity, EmployeeEntity, ResetTokenEntity]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  const module = await builder.compile();
  expect(module.get(AuthService)).toBeInstanceOf(AuthService);
  expect(module.get(ResetTokenService)).toBeInstanceOf(ResetTokenService);
  await module.close();
});
