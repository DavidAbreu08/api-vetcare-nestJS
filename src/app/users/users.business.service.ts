import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { UsersMessages } from "./users.messages";
import { PersistenceService } from "../core/persistence/persistence.service";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager, FindOptionsWhere, In, MssqlParameter, Not, Repository } from "typeorm";
import { UsersEntity } from "./entities/users.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
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
import { utcInstantParam, uuidParam } from "../core/persistence/sql-params";
import { findOpenReservations, openReservationsConflict } from "../reservation/open-reservations";
import { AnimalAccessService } from "../animal-owners/animal-access.service";
import { AnimalOwnerEndReason } from "../animal-owners/enums/animal-owner-end-reason.enum";

/**
 * JWT iat is in whole seconds: a token is valid when issued in the same second as the password change or later,
 * so the login right after a change is never rejected. Without password_changed_at every token is accepted.
 */
export function isIssuedAfterPasswordChange(issuedAt: number | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return true;
  return typeof issuedAt === "number" && issuedAt >= Math.floor(passwordChangedAt.getTime() / 1000);
}

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
    private readonly animalAccess: AnimalAccessService,
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
    if (!user) throw applicationError(ErrorMetadata.NOT_FOUND, UsersMessages.USER_NOT_FOUND);
    return user;
  }

  /**
   * Authenticated caller: active roles only, system-role flags resolved through settings. Staff access
   * through EMPLOYEE also needs an active employee profile (termination absent or after today), so a
   * termination date that passes without any save takes effect immediately; in that case the EMPLOYEE
   * role id is also left out of roleIds so @Roles(EMPLOYEE) denies access.
   */
  async loadActor(id: string, issuedAt?: number): Promise<(Actor & { email: string; name: string }) | null> {
    const user = await this.persistence.execute(() => this.usersRepository.findOne({ where: { id } }));
    if (!user || !user.isActive) return null;
    if (!isIssuedAfterPasswordChange(issuedAt, user.passwordChangedAt)) return null;
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
      throw applicationError(ErrorMetadata.ALREADY_EXISTS, UsersMessages.EMAIL_OR_NIF_ALREADY_EXISTS);
    }
  }

  private assertBirthDate(birthDate: string | null | undefined) {
    if (birthDate && birthDate > todayKey(CLINIC_POLICY.timeZone)) throw applicationError(ErrorMetadata.INVALID_VALUE, UsersMessages.FUTURE_BIRTH_DATE);
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
      // Only the hash is stored; the plain token is returned for the welcome email.
      const now = new Date();
      const generated = generateResetToken(now);
      resetToken = generated.token;
      await manager.insert(ResetTokenEntity, { userId: user.id, tokenHash: generated.tokenHash, expiresAt: generated.expiresAt, createdAt: now, usedAt: null });
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
    return null;
  }

  async update(id: string, data: UpdateUserDto, actor: Actor) {
    if (!actor.isAdmin && (data.email !== undefined || data.isActive !== undefined)) {
      throw applicationError(ErrorMetadata.FORBIDDEN, UsersMessages.ADMIN_ONLY_FIELDS);
    }
    if (data.name === null || data.email === null || data.isActive === null) throw applicationError(ErrorMetadata.INVALID_VALUE, UsersMessages.NULL_REQUIRED_FIELD);
    this.assertBirthDate(data.birthDate);
    await this.transaction(async manager => {
      // Account row locked first (UPDLOCK): lock order account -> employee profile, as in delete.
      const user = await manager.findOne(UsersEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!user) throw applicationError(ErrorMetadata.NOT_FOUND, UsersMessages.USER_NOT_FOUND);
      const email = data.email !== undefined ? normalizeEmail(data.email) as string : undefined;
      await this.assertUniqueIdentity(manager, email !== user.email ? email : undefined, data.nif !== user.nif ? data.nif : undefined, user.id);
      if (data.isActive === false && user.isActive) {
        await this.assertNoOpenReservations(manager, user.id);
        await this.assertAnotherAdminRemains(manager, user.id);
      }
      if (data.name !== undefined) user.name = data.name.trim();
      if (email !== undefined) user.email = email;
      for (const key of ["nif", "phone", "birthDate", "profilePictureUrl", "description", "notes"] as const) {
        if (data[key] !== undefined) user[key] = data[key] ?? null;
      }
      if (data.isActive !== undefined) user.isActive = data.isActive;
      await manager.save(user);
    });
    return null;
  }

  /**
   * Locks the account row (UPDLOCK, ROWLOCK) until the caller's transaction ends. Lock order for every flow that
   * writes vc_reset_tokens: vc_users row first, then vc_reset_tokens (see AuthService).
   */
  async lockForUpdate(manager: EntityManager, id: string): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      "SELECT 1 AS [locked] FROM [dbo].[vc_users] WITH (UPDLOCK, ROWLOCK) WHERE [id] = @0",
      [uuidParam(id)],
    );
    return rows?.length === 1;
  }

  /**
   * Sets the password hash and password_changed_at (which revokes JWTs issued before it) inside the caller's
   * transaction, only for an active, non-deleted account. Returns false when no row was updated.
   */
  async setPasswordHash(manager: EntityManager, id: string, passwordHash: string, now: Date): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      "UPDATE [dbo].[vc_users] SET [password_hash] = @0, [password_changed_at] = @1, [updated_at] = @1 OUTPUT inserted.[id] " +
      "WHERE [id] = @2 AND [deleted_at] IS NULL AND [is_active] = 1",
      [new MssqlParameter(passwordHash, "nvarchar", 255), utcInstantParam(now), uuidParam(id)],
    );
    return rows?.length === 1;
  }

  /**
   * Soft-deletes the account and removes its reset tokens explicitly (no cascading FK). An active
   * employee profile (locked for the check) must be terminated or deleted first. While the account is the active
   * primary tutor of non-deleted animals the deletion is refused (409 PRIMARY_TUTOR_OF_ANIMALS with animalIds: transfer
   * them first); its active secondary tutorships are closed in the same transaction (end_reason ACCOUNT_DELETED).
   */
  async delete(id: string, actor?: Actor) {
    await this.transaction(async manager => {
      // Account row locked first (UPDLOCK): same users -> reset tokens order as the password flows.
      const user = await manager.findOne(UsersEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!user) throw applicationError(ErrorMetadata.NOT_FOUND, UsersMessages.USER_NOT_FOUND);
      const profile = await manager.findOne(EmployeeEntity, { where: { userId: user.id }, lock: { mode: "pessimistic_write" } });
      if (profile && isEmploymentActive(profile.terminationDate)) throw applicationError(ErrorMetadata.CONFLICT, UsersMessages.ACTIVE_EMPLOYEE_PROFILE);
      await this.assertNoOpenReservations(manager, user.id, profile);
      await this.assertAnotherAdminRemains(manager, user.id);
      await this.releaseTutorships(manager, user.id, AnimalOwnerEndReason.ACCOUNT_DELETED, actor?.id ?? null);
      await manager.delete(ResetTokenEntity, { user: { id: user.id } });
      await manager.softDelete(UsersEntity, { id: user.id });
    });
  }

  /**
   * 409 with the reservation ids while the account is the client of, or (through its employee profile) assigned to,
   * PENDING/CONFIRMED reservations not yet finished; nothing is cancelled automatically. Requires the account row
   * locked by the caller; the employee profile is locked here (account -> employee profile). Reservation creation
   * locks the client account and assignment/confirmation lock the profile, so no open reservation can appear
   * between this check and the commit of the deactivation or deletion.
   */
  private async assertNoOpenReservations(manager: EntityManager, userId: string, lockedProfile?: EmployeeEntity | null) {
    const asClient = await findOpenReservations(manager, { clientId: userId });
    if (asClient.length) throw openReservationsConflict("CLIENT_HAS_OPEN_RESERVATIONS", UsersMessages.CLIENT_OPEN_RESERVATIONS, asClient);
    const profile = lockedProfile !== undefined
      ? lockedProfile
      : await manager.findOne(EmployeeEntity, { where: { userId }, lock: { mode: "pessimistic_write" } });
    if (!profile) return;
    const assigned = await findOpenReservations(manager, { employeeId: profile.id });
    if (assigned.length) throw openReservationsConflict("EMPLOYEE_HAS_OPEN_RESERVATIONS", UsersMessages.EMPLOYEE_OPEN_RESERVATIONS, assigned);
  }

  /**
   * The account stops being able to be a tutor (deletion, loss of CLIENT): 409 PRIMARY_TUTOR_OF_ANIMALS (animalIds)
   * while it is the active primary tutor of non-deleted animals, otherwise its active secondary tutorships are closed.
   * Requires the account row locked by the caller: every flow that opens a tutorship for an account locks that account
   * first (animal -> account -> vc_animal_owners), so none can be opened between this check and the commit.
   */
  private async releaseTutorships(manager: EntityManager, userId: string, reason: AnimalOwnerEndReason, actorId: string | null) {
    const animalIds = await this.animalAccess.primaryAnimalIdsOf(manager, userId);
    if (animalIds.length) {
      throw applicationError(ErrorMetadata.IN_USE, UsersMessages.PRIMARY_TUTOR_OF_ANIMALS, undefined, { code: "PRIMARY_TUTOR_OF_ANIMALS", animalIds });
    }
    await this.animalAccess.closeSecondaryTutorships(manager, userId, reason, actorId);
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
      // Account row locked (UPDLOCK) so a concurrent deactivation cannot slip between the check and the insert.
      const user = await manager.findOne(UsersEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!user) throw applicationError(ErrorMetadata.NOT_FOUND, UsersMessages.USER_NOT_FOUND);
      const currentRows = await manager.find(UserRoleEntity, { where: { userId: user.id } });
      const current = new Set(currentRows.map(row => normalizeId(row.roleId)));
      const roles = ids.length ? await manager.find(RoleEntity, { where: { id: In(ids) } }) : [];
      // Existing assignments of since-deactivated roles may be kept; new ones need active roles.
      if (roles.length !== ids.length || roles.some(role => !role.isActive && !current.has(normalizeId(role.id)))) {
        throw applicationError(ErrorMetadata.INVALID_VALUE, UsersMessages.INVALID_ROLES);
      }
      const [adminRoleId, employeeRoleId, clientRoleId] = await this.settings.resolveRoleIds([SystemRole.ADMIN, SystemRole.EMPLOYEE, SystemRole.CLIENT]);
      if (current.has(adminRoleId) && !ids.includes(adminRoleId)) await this.assertAnotherAdminRemains(manager, user.id);
      // Tutors must hold CLIENT: losing it is refused for a primary tutor and closes secondary tutorships (ROLE_CHANGED).
      if (current.has(clientRoleId) && !ids.includes(clientRoleId)) await this.releaseTutorships(manager, user.id, AnimalOwnerEndReason.ROLE_CHANGED, actor.id);
      await this.assertEmployeeRoleMatchesProfile(manager, user.id, current.has(employeeRoleId), ids.includes(employeeRoleId));
      const removed = currentRows.filter(row => !ids.includes(normalizeId(row.roleId))).map(row => row.roleId);
      const added = ids.filter(roleId => !current.has(roleId));
      if (added.length && !user.isActive) throw applicationError(ErrorMetadata.CONFLICT, UsersMessages.INACTIVE_ACCOUNT_ROLES);
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
    if (hadRole && active) throw applicationError(ErrorMetadata.CONFLICT, UsersMessages.EMPLOYEE_ROLE_REQUIRED);
    if (keepsRole && !active) throw applicationError(ErrorMetadata.CONFLICT, UsersMessages.EMPLOYEE_ROLE_WITHOUT_PROFILE);
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
      where: { roleId: adminRoleId, userId: Not(userId), user: { isActive: true }, role: { isActive: true } } });
    if (!others) throw applicationError(ErrorMetadata.CONFLICT, UsersMessages.LAST_ADMIN);
  }
}
