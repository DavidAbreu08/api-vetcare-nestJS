import dataSource from "./data-source";
import { UsersEntity } from "../app/users/entities/users.entity";
import { Role } from "../app/core/enums/role.enum";
import { Function as UserFunction } from "../app/core/enums/function.enum";

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least 12 characters) locally.");
  }
  await dataSource.initialize();
  try {
    if (await dataSource.showMigrations()) throw new Error("Run db:migrate before creating the administrator.");
    const repository = dataSource.getRepository(UsersEntity);
    const existing = await repository.findOne({ where: { email }, withDeleted: true });
    if (existing) {
      if (existing.role !== Role.ADMIN || existing.deletedAt || !existing.isActive) {
        throw new Error("The seed email already belongs to an unavailable or non-admin account; no changes made.");
      }
      console.log("Administrator already exists; password unchanged.");
      return;
    }
    await repository.save(repository.create({
      email,
      password,
      name: process.env.SEED_ADMIN_NAME?.trim() || "Administrador local",
      role: Role.ADMIN,
      function: UserFunction.ADMINISTRACAO,
      isActive: true,
    }));
    console.log("Local administrator created. No email was sent.");
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
  process.exitCode = 1;
});
