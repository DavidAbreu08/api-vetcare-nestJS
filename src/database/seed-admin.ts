// Must stay the first import: forces process.env.TZ = "UTC" before anything creates dates or loads TypeORM.
import "../force-utc";
import * as bcrypt from "bcrypt";
import { Logger } from "@nestjs/common";
import { isUUID } from "class-validator";
import dataSource from "./data-source";
import { UsersEntity } from "../app/users/entities/users.entity";
import { UserRoleEntity } from "../app/roles/entities/user-role.entity";
import { RoleEntity } from "../app/roles/entities/role.entity";
import { EmployeeEntity } from "../app/employees/entities/employee.entity";
import { SystemSettingEntity } from "../app/system-settings/entities/system-setting.entity";
import { SystemSettingCode } from "../app/system-settings/enums/system-setting-code.enum";

/**
 * Creates the first administrator in one transaction: account, the roles referenced by ADMIN_ROLE_ID and
 * EMPLOYEE_ROLE_ID, and an employee profile (an active profile always carries the employee role).
 * Never promotes existing accounts nor changes an existing administrator's password.
 */
async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least 12 characters) locally.");
  }
  await dataSource.initialize();
  try {
    if (await dataSource.showMigrations()) throw new Error("Run db:migrate before creating the administrator.");
    const roleIdFor = async (code: SystemSettingCode) => {
      const setting = await dataSource.getRepository(SystemSettingEntity).findOneBy({ code });
      const roleId = setting?.value?.trim().toLowerCase();
      if (!roleId || !isUUID(roleId)) throw new Error(`System setting ${code} is missing or invalid; no changes made.`);
      const role = await dataSource.getRepository(RoleEntity).findOneBy({ id: roleId });
      if (!role || !role.isActive) throw new Error(`${code} does not reference an active role; no changes made.`);
      return roleId;
    };
    const adminRoleId = await roleIdFor(SystemSettingCode.ADMIN_ROLE_ID);
    const employeeRoleId = await roleIdFor(SystemSettingCode.EMPLOYEE_ROLE_ID);

    const users = dataSource.getRepository(UsersEntity);
    const existing = await users.findOne({ where: { email }, withDeleted: true });
    if (existing) {
      const isAdmin = await dataSource.getRepository(UserRoleEntity).countBy({ userId: existing.id, roleId: adminRoleId });
      if (!isAdmin || existing.deletedAt || !existing.isActive) {
        throw new Error("The seed email already belongs to an unavailable or non-admin account; no changes made.");
      }
      console.log("Administrator already exists; password unchanged.");
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await dataSource.transaction(async manager => {
      const user = await manager.save(manager.create(UsersEntity, {
        email,
        passwordHash,
        name: process.env.SEED_ADMIN_NAME?.trim() || "Administrador local",
        isActive: true,
      }));
      // assigned_by stays null: there is no authenticated actor during bootstrap.
      await manager.insert(UserRoleEntity, [
        { userId: user.id, roleId: adminRoleId, assignedBy: null },
        { userId: user.id, roleId: employeeRoleId, assignedBy: null },
      ]);
      await manager.save(manager.create(EmployeeEntity, { userId: user.id }));
      return user.id;
    });
    new Logger("SeedAdmin").log(`Administrator role assigned to user ${userId} by seed at ${new Date().toISOString()}`);
    console.log("Local administrator created. No email was sent.");
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
  process.exitCode = 1;
});
