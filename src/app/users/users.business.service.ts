import { UsersMessages } from "./users.messages";
import { PersistenceService } from "../core/persistence/persistence.service";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, FindOptionsWhere, In, Not, Repository } from "typeorm";
import { UsersEntity } from "./entities/users.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { HttpResponse } from "../core/interface/http-response.interface";
import { generateRandomPassword } from "../core/generated/genarate-random.password";
import * as bcrypt from "bcrypt";
import { EmailService } from "src/email/email.service";
import { generateResetToken } from "../core/generated/generate-reset-token";
import { CreateClientDto } from "./dto/create-client.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { Actor } from "../core/authorization";
import { SystemRole } from "../core/enums/system-role.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { RoleMembershipService } from "../roles/role-membership.service";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { ResetTokenEntity } from "src/auth/entities/reset-token.entity";
import { catalogSummary, normalizeEmail, normalizeId, todayKey } from "../core/catalog";
import { serializeAccount, serializeEmployee } from "../employees/employee.serializer";
import { CLINIC_POLICY } from "../reservation/reservation-policy";
import { isEmploymentActive } from "../employees/employee-status";

/** Roles assignable while creating an account; the administrator role is only granted through PUT roles or the seed. */
export type AccountSystemRole = typeof SystemRole.EMPLOYEE | typeof SystemRole.CLIENT;

/** Account attributes accepted when creating a user. */
export type NewAccount = {
  name: string; email: string; password?: string; phone?: string | null; birthDate?: string | null; nif?: string | null;
  profilePictureUrl?: string | null; description?: string | null; notes?: string | null;
};

@Injectable()
export class UsersBusinessService {
  private readonly logger = new Logger(UsersBusinessService.name);

  constructor(
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeesRepository: Repository<EmployeeEntity>,
    private readonly emailService: EmailService,
    private readonly settings: SystemSettingsService,
    private readonly membership: RoleMembershipService,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  async getAll(query: ListUsersQueryDto = new ListUsersQueryDto()) {
    return this.persistence.execute(() => this.usersRepository.find({
      where: { email: query.email, userRoles: query.roleId ? { roleId: query.roleId } : undefined },
      select: ["id", "name", "email", "isActive"],
      skip: query.skip,
      take: query.take,
      order: { id: "ASC" },
    }));
  }

  async findAllClients(): Promise<UsersEntity[]> {
    const clientRoleId = await this.settings.resolveRoleId(SystemRole.CLIENT);
    return this.persistence.execute(() => this.usersRepository.find({
      where: { userRoles: { roleId: clientRoleId } },
      select: ["id", "name", "email", "createdAt", "phone", "nif", "birthDate"],
      order: { name: "ASC", id: "ASC" },
    }));
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const normalized = normalizeEmail(email);
    if (typeof normalized !== "string" || !normalized) return false;
    return !!(await this.persistence.execute(() => this.usersRepository.findOne({ where: { email: normalized } })));
  }

  async findForAuthentication(where: FindOptionsWhere<UsersEntity>) {
    return this.persistence.execute(() => this.usersRepository.findOne({
      where,
      select: ["id", "name", "email", "passwordHash", "isActive"],
    }));
  }

  async findOneOrFail(where: FindOptionsWhere<UsersEntity> | FindOptionsWhere<UsersEntity>[]) {
    const user = await this.persistence.execute(() => this.usersRepository.findOne({ where }));
    if (!user) throw new NotFoundException(UsersMessages.USER_NOT_FOUND);
    return user;
  }

  /**
   * Authenticated caller: active roles only, system-role flags resolved through settings. Staff access
   * through EMPLOYEE also needs an active employee profile (termination absent or after today), so a
   * termination date that passes without any save takes effect immediately; in that case the EMPLOYEE
   * role id is also left out of roleIds so @Roles(EMPLOYEE) denies access.
   */
  async loadActor(id: string): Promise<(Actor & { email: string; name: string }) | null> {
    const user = await this.persistence.execute(() => this.usersRepository.findOne({ where: { id } }));
    if (!user || !user.isActive) return null;
    const heldRoleIds = (await this.membership.activeRolesOf(user.id)).map(role => normalizeId(role.id));
    const flags = await this.settings.systemRoleFlags(heldRoleIds);
    const employee = await this.persistence.execute(() => this.employeesRepository.findOne({
      where: { userId: user.id }, select: { id: true, terminationDate: true },
    }));
    const isEmployee = flags.isEmployee && !!employee && isEmploymentActive(employee.terminationDate);
    let roleIds = heldRoleIds;
    if (flags.isEmployee && !isEmployee) {
      const employeeRoleId = await this.settings.resolveRoleId(SystemRole.EMPLOYEE);
      roleIds = heldRoleIds.filter(roleId => roleId !== employeeRoleId);
    }
    return { id: user.id, email: user.email, name: user.name, roleIds, ...flags, isEmployee, employeeId: employee?.id ?? null };
  }

  /** Contract of GET /api/auth/me: account, active roles and employee profile (or null). */
  async getAccountProfile(id: string) {
    const user = await this.findOneOrFail({ id });
    const roles = await this.membership.activeRolesOf(user.id);
    const employee = await this.persistence.execute(() => this.employeesRepository.findOne({
      where: { userId: user.id }, relations: { jobTitleLinks: { jobTitle: true } },
    }));
    return { ...serializeAccount(user), roles: roles.map(catalogSummary), employee: employee ? serializeEmployee(employee) : null };
  }

  /** Database filtered unique indexes remain the final arbiter; this gives a clearer early 409. */
  private async assertUniqueIdentity(manager: EntityManager, email?: string, nif?: string | null, excludeId?: string) {
    const where: FindOptionsWhere<UsersEntity>[] = [];
    if (email) where.push(excludeId ? { email, id: Not(excludeId) } : { email });
    if (nif) where.push(excludeId ? { nif, id: Not(excludeId) } : { nif });
    if (where.length && await manager.findOne(UsersEntity, { where })) {
      throw new ConflictException(UsersMessages.EMAIL_OR_NIF_ALREADY_EXISTS);
    }
  }

  private assertBirthDate(birthDate: string | null | undefined) {
    if (birthDate && birthDate > todayKey(CLINIC_POLICY.timeZone)) throw new BadRequestException(UsersMessages.FUTURE_BIRTH_DATE);
  }

  /**
   * Creates a user with the given system roles inside the caller's transaction.
   * Without a password a random one is hashed and a reset token is issued for the welcome email.
   */
  async createAccount(manager: EntityManager, data: NewAccount, roles: AccountSystemRole[], assignedBy: string | null): Promise<{ user: UsersEntity; resetToken: string | null }> {
    const email = normalizeEmail(data.email) as string;
    this.assertBirthDate(data.birthDate);
    await this.assertUniqueIdentity(manager, email, data.nif);
    const passwordHash = await bcrypt.hash(data.password ?? generateRandomPassword(), 10);
    const user = await manager.save(manager.create(UsersEntity, {
      name: data.name.trim(), email, passwordHash, phone: data.phone ?? null, birthDate: data.birthDate ?? null,
      nif: data.nif ?? null, profilePictureUrl: data.profilePictureUrl ?? null,
      description: data.description ?? null, notes: data.notes ?? null, isActive: true,
    }));
    const roleIds = await this.settings.resolveRoleIds(roles);
    if (roleIds.length) await manager.insert(UserRoleEntity, roleIds.map(roleId => ({ userId: user.id, roleId, assignedBy })));
    let resetToken: string | null = null;
    if (data.password === undefined) {
      const generated = generateResetToken();
      resetToken = generated.token;
      await manager.save(manager.create(ResetTokenEntity, { resetToken: generated.token, user, expiresAt: generated.expiresAt }));
    }
    return { user, resetToken };
  }

  async create(data: CreateUserDto) {
    // Public registration: no authenticated actor, so assigned_by stays null.
    const { user } = await this.transaction(manager => this.createAccount(manager, data, [SystemRole.CLIENT], null));
    return serializeAccount(user);
  }

  async createClient(data: CreateClientDto, actor: Actor | null) {
    const { user, resetToken } = await this.transaction(manager => this.createAccount(manager, data, [SystemRole.CLIENT], actor?.id ?? null));
    await this.emailService.sendClientWelcomeEmail(user.email, resetToken!);
    return { message: UsersMessages.CLIENT_CREATED, statusCode: HttpStatus.CREATED };
  }

  async update(id: string, data: UpdateUserDto, actor: Actor): Promise<HttpResponse> {
    if (!actor.isAdmin && (data.email !== undefined || data.isActive !== undefined)) {
      throw new ForbiddenException(UsersMessages.ADMIN_ONLY_FIELDS);
    }
    if (data.name === null || data.email === null || data.isActive === null) throw new BadRequestException(UsersMessages.NULL_REQUIRED_FIELD);
    this.assertBirthDate(data.birthDate);
    await this.transaction(async manager => {
      const user = await manager.findOne(UsersEntity, { where: { id } });
      if (!user) throw new NotFoundException(UsersMessages.USER_NOT_FOUND);
      const email = data.email !== undefined ? normalizeEmail(data.email) as string : undefined;
      await this.assertUniqueIdentity(manager, email !== user.email ? email : undefined, data.nif !== user.nif ? data.nif : undefined, user.id);
      if (data.isActive === false && user.isActive) await this.assertAnotherAdminRemains(manager, user.id);
      if (data.name !== undefined) user.name = data.name.trim();
      if (email !== undefined) user.email = email;
      for (const key of ["nif", "phone", "birthDate", "profilePictureUrl", "description", "notes"] as const) {
        if (data[key] !== undefined) user[key] = data[key] ?? null;
      }
      if (data.isActive !== undefined) user.isActive = data.isActive;
      await manager.save(user);
    });
    return { statusCode: HttpStatus.OK, message: UsersMessages.OK };
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    await this.persistence.execute(() => this.usersRepository.update({ id }, { passwordHash }));
  }

  /**
   * Soft-deletes the account and removes its reset tokens explicitly (no cascading FK). An active
   * employee profile (locked for the check) must be terminated or deleted first.
   */
  async delete(id: string) {
    await this.transaction(async manager => {
      const user = await manager.findOne(UsersEntity, { where: { id } });
      if (!user) throw new NotFoundException(UsersMessages.USER_NOT_FOUND);
      const profile = await manager.findOne(EmployeeEntity, { where: { userId: user.id }, lock: { mode: "pessimistic_write" } });
      if (profile && isEmploymentActive(profile.terminationDate)) throw new ConflictException(UsersMessages.ACTIVE_EMPLOYEE_PROFILE);
      await this.assertAnotherAdminRemains(manager, user.id);
      await manager.delete(ResetTokenEntity, { user: { id: user.id } });
      await manager.softDelete(UsersEntity, { id: user.id });
    });
  }

  async getRoles(id: string) {
    const user = await this.findOneOrFail({ id });
    return { userId: user.id, roles: (await this.membership.activeRolesOf(user.id)).map(catalogSummary) };
  }

  /**
   * Replaces the set of roles of a user atomically. Kept assignments are untouched (original
   * assigned_by and created_at preserved); only removed rows are deleted and new rows inserted.
   * Keeps at least one active administrator and keeps EMPLOYEE in step with an active employee profile.
   */
  async replaceRoles(id: string, roleIds: string[], actor: Actor) {
    const ids = [...new Set(roleIds.map(normalizeId))];
    const result = await this.transaction(async manager => {
      const user = await manager.findOne(UsersEntity, { where: { id } });
      if (!user) throw new NotFoundException(UsersMessages.USER_NOT_FOUND);
      const currentRows = await manager.find(UserRoleEntity, { where: { userId: user.id } });
      const current = new Set(currentRows.map(row => normalizeId(row.roleId)));
      const roles = ids.length ? await manager.find(RoleEntity, { where: { id: In(ids) } }) : [];
      // Existing assignments of since-deactivated roles may be kept; new ones need active roles.
      if (roles.length !== ids.length || roles.some(role => !role.isActive && !current.has(normalizeId(role.id)))) {
        throw new BadRequestException(UsersMessages.INVALID_ROLES);
      }
      const [adminRoleId, employeeRoleId] = await this.settings.resolveRoleIds([SystemRole.ADMIN, SystemRole.EMPLOYEE]);
      if (current.has(adminRoleId) && !ids.includes(adminRoleId)) await this.assertAnotherAdminRemains(manager, user.id);
      await this.assertEmployeeRoleMatchesProfile(manager, user.id, current.has(employeeRoleId), ids.includes(employeeRoleId));
      const removed = currentRows.filter(row => !ids.includes(normalizeId(row.roleId))).map(row => row.roleId);
      const added = ids.filter(roleId => !current.has(roleId));
      if (removed.length) await manager.delete(UserRoleEntity, { userId: user.id, roleId: In(removed) });
      if (added.length) await manager.insert(UserRoleEntity, added.map(roleId => ({ userId: user.id, roleId, assignedBy: actor.id })));
      return {
        userId: user.id,
        roles: roles.filter(role => role.isActive).map(catalogSummary),
        adminAssigned: added.includes(adminRoleId),
        adminRemoved: removed.some(roleId => normalizeId(roleId) === adminRoleId),
      };
    });
    // Logged after commit so rolled-back changes are never reported.
    const at = new Date().toISOString();
    if (result.adminAssigned) this.logger.log(`Administrator role assigned to user ${result.userId} by ${actor.id} at ${at}`);
    if (result.adminRemoved) this.logger.log(`Administrator role removed from user ${result.userId} by ${actor.id} at ${at}`);
    return { userId: result.userId, roles: result.roles };
  }

  /**
   * EMPLOYEE follows the employee profile: required while it is active, never granted without one.
   * The profile row is locked (UPDLOCK) so the check serializes with PUT /api/employees/:id even when
   * reads do not block (READ_COMMITTED_SNAPSHOT).
   */
  private async assertEmployeeRoleMatchesProfile(manager: EntityManager, userId: string, hadRole: boolean, keepsRole: boolean) {
    if (hadRole === keepsRole) return;
    const profile = await manager.findOne(EmployeeEntity, { where: { userId }, lock: { mode: "pessimistic_write" } });
    const active = !!profile && isEmploymentActive(profile.terminationDate);
    if (hadRole && active) throw new ConflictException(UsersMessages.EMPLOYEE_ROLE_REQUIRED);
    if (keepsRole && !active) throw new ConflictException(UsersMessages.EMPLOYEE_ROLE_WITHOUT_PROFILE);
  }

  /**
   * Called before a user may stop being an effective administrator (role removal,
   * deactivation, deletion). Locks the administrator role row to serialize concurrent changes.
   */
  private async assertAnotherAdminRemains(manager: EntityManager, userId: string) {
    const adminRoleId = await this.settings.resolveRoleId(SystemRole.ADMIN);
    const isEffectiveAdmin = await manager.count(UserRoleEntity, { where: { userId, roleId: adminRoleId, user: { isActive: true } } });
    if (!isEffectiveAdmin) return;
    await manager.findOne(RoleEntity, { where: { id: adminRoleId }, lock: { mode: "pessimistic_write" } });
    const others = await manager.count(UserRoleEntity, {
      where: { roleId: adminRoleId, userId: Not(userId), user: { isActive: true }, role: { isActive: true } },
    });
    if (!others) throw new ConflictException(UsersMessages.LAST_ADMIN);
  }
}
