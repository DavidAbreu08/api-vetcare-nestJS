import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, IsNull, MoreThan, Repository } from "typeorm";
import { Actor, sameId } from "../core/authorization";
import { normalizeId } from "../core/catalog";
import { SystemRole } from "../core/enums/system-role.enum";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmailService } from "src/email/email.service";
import { JobTitleEntity } from "../job-titles/entities/job-title.entity";
import { ClinicalVisitEntity } from "../clinical-visits/entities/clinical-visit.entity";
import { findOpenReservations, openReservationsConflict } from "../reservation/open-reservations";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { clinicParts, dateKey } from "../reservation/reservation-policy";
import { clinicToday, isBookableEmployee, isEmploymentActive } from "./employee-status";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { UsersEntity } from "../users/entities/users.entity";
import { UsersService } from "../users/users.service";
import { CreateEmployeeDto, EmployeeFieldsDto, ListEmployeesQueryDto, UpdateEmployeeDto } from "./dto/create-employee.dto";
import { serializeEmployee } from "./employee.serializer";
import { EmployeeJobTitleEntity } from "./entities/employee-job-title.entity";
import { EmployeeEntity } from "./entities/employee.entity";
import { EmployeeConflictMessages, EmployeeMessage } from "./employees.messages";

const RELATIONS = { user: true, jobTitleLinks: { jobTitle: true } } as const;

/** Employee profiles, job-title assignments and booking eligibility. Multi-table writes are transactional. */
@Injectable()
export class EmployeesBusinessService {
  private readonly logger = new Logger(EmployeesBusinessService.name);

  constructor(
    @InjectRepository(EmployeeEntity) private readonly employees: Repository<EmployeeEntity>,
    private readonly dataSource: DataSource,
    private readonly persistence: PersistenceService,
    private readonly users: UsersService,
    private readonly settings: SystemSettingsService,
    private readonly emailService: EmailService,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  private async load(id: string) {
    const employee = await this.persistence.execute(() => this.employees.findOne({ where: { id }, relations: RELATIONS }));
    if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, EmployeeMessage.NotFound);
    return employee;
  }

  /** isAvailableForBookings=true also requires an active profile (termination absent or after today). */
  async getAll(query: ListEmployeesQueryDto) {
    const base = { isAvailableForBookings: query.isAvailableForBookings };
    const where = query.isAvailableForBookings === true
      ? [{ ...base, terminationDate: IsNull() }, { ...base, terminationDate: MoreThan(clinicToday()) }]
      : base;
    const rows = await this.persistence.execute(() => this.employees.find({
      where, relations: RELATIONS, skip: query.skip, take: query.take, order: { createdAt: "ASC", id: "ASC" },
    }));
    return rows.map(serializeEmployee);
  }

  async getById(id: string, actor: Actor) {
    const employee = await this.load(id);
    if (!actor.isAdmin && !sameId(employee.userId, actor.id)) throw applicationError(ErrorMetadata.FORBIDDEN, EmployeeMessage.Forbidden);
    return serializeEmployee(employee);
  }

  async getMine(actor: Actor) {
    const employee = await this.persistence.execute(() => this.employees.findOne({ where: { userId: actor.id }, relations: RELATIONS }));
    if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, EmployeeMessage.NotFound);
    return serializeEmployee(employee);
  }

  private assertDates(hireDate: string | null | undefined, terminationDate: string | null | undefined) {
    if (hireDate && terminationDate && terminationDate < hireDate) throw applicationError(ErrorMetadata.INVALID_VALUE, EmployeeMessage.InvalidDates);
  }

  private fields(dto: EmployeeFieldsDto): Partial<EmployeeEntity> {
    if (dto.isAvailableForBookings === null || (dto.jobTitleIds as unknown) === null) throw applicationError(ErrorMetadata.INVALID_VALUE, EmployeeMessage.NullField);
    const result: Partial<EmployeeEntity> = {};
    for (const key of ["employeeNumber", "licenseNumber", "hireDate", "terminationDate", "description", "notes"] as const) {
      if (dto[key] !== undefined) result[key] = dto[key] ?? null;
    }
    if (dto.isAvailableForBookings !== undefined) result.isAvailableForBookings = dto.isAvailableForBookings;
    return result;
  }

  /** Replaces the employee's job titles; kept assignments of deactivated titles remain allowed. */
  private async replaceJobTitles(manager: EntityManager, employeeId: string, jobTitleIds: string[]) {
    const ids = [...new Set(jobTitleIds.map(normalizeId))];
    const current = new Set((await manager.find(EmployeeJobTitleEntity, { where: { employeeId } })).map(row => normalizeId(row.jobTitleId)));
    const titles = ids.length ? await manager.find(JobTitleEntity, { where: { id: In(ids) } }) : [];
    if (titles.length !== ids.length || titles.some(title => !title.isActive && !current.has(normalizeId(title.id)))) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, EmployeeMessage.InvalidJobTitles);
    }
    await manager.delete(EmployeeJobTitleEntity, { employeeId });
    if (ids.length) await manager.insert(EmployeeJobTitleEntity, ids.map(jobTitleId => ({ employeeId, jobTitleId })));
  }

  /**
   * EMPLOYEE accompanies the active profile; assigned in the caller's transaction and audited with the actor.
   * A role is never granted to an inactive account (409): reactivate the account first.
   */
  private async ensureEmployeeRole(manager: EntityManager, userId: string, assignedBy: string) {
    const roleId = await this.settings.resolveRoleId(SystemRole.EMPLOYEE);
    if (!(await manager.count(UserRoleEntity, { where: { userId, roleId } }))) {
      const account = await manager.findOne(UsersEntity, { where: { id: userId } });
      if (!account?.isActive) throw applicationError(ErrorMetadata.CONFLICT, EmployeeMessage.InactiveAccount);
      await manager.insert(UserRoleEntity, { userId, roleId, assignedBy });
    }
  }

  /**
   * Rejects (409, count in the message only) a profile change that makes the employee unable to attend PENDING or
   * CONFIRMED reservations assigned to them and not yet finished: termination on or before their clinic date or
   * isAvailableForBookings=false. Nothing is cancelled automatically. Only reservations attendable before the
   * change count, so editing an already unavailable profile is not blocked by them. Called with the profile row
   * locked (UPDLOCK): every flow that assigns or confirms a reservation locks the same row (lock order
   * reservation -> employee profile), so no reservation can be assigned or confirmed between this read and commit.
   */
  private async assertNoStrandedReservations(manager: EntityManager, before: EmployeeEntity, after: EmployeeEntity) {
    const user = await manager.findOne(UsersEntity, { where: { id: before.userId } });
    if (!user) return;
    const open = await findOpenReservations(manager, { employeeId: before.id });
    const stranded = open.filter(reservation => {
      const date = clinicParts(reservation.startAt).date;
      return this.isBookable({ ...before, user }, date) && !this.isBookable({ ...after, user }, date);
    });
    if (stranded.length) throw openReservationsConflict("EMPLOYEE_HAS_OPEN_RESERVATIONS", EmployeeConflictMessages.openReservations, stranded);
  }

  /** A terminated profile loses EMPLOYEE in the caller's transaction; returns whether a row was removed. */
  private async revokeEmployeeRole(manager: EntityManager, userId: string): Promise<boolean> {
    const roleId = await this.settings.resolveRoleId(SystemRole.EMPLOYEE);
    if (!(await manager.count(UserRoleEntity, { where: { userId, roleId } }))) return false;
    await manager.delete(UserRoleEntity, { userId, roleId });
    return true;
  }

  /** A terminated employee (termination today or earlier) is never available for new bookings. */
  private applyAvailabilityRule(employee: Partial<EmployeeEntity>, requestedAvailability: boolean | undefined) {
    if (isEmploymentActive(employee.terminationDate)) return;
    if (requestedAvailability === true) throw applicationError(ErrorMetadata.INVALID_VALUE, EmployeeMessage.TerminatedUnavailable);
    employee.isAvailableForBookings = false;
  }

  /**
   * Creates the profile (and optionally its account) in one transaction. The role in EMPLOYEE_ROLE_ID is
   * granted only when the created profile is active; a profile created already terminated gets no role
   * (a new account is then created without roles).
   */
  async create(dto: CreateEmployeeDto, actor: Actor) {
    if (!!dto.userId === !!dto.user) throw applicationError(ErrorMetadata.INVALID_VALUE, EmployeeMessage.UserSource);
    const attributes = this.fields(dto);
    this.assertDates(attributes.hireDate, attributes.terminationDate);
    this.applyAvailabilityRule(attributes, dto.isAvailableForBookings);
    const active = isEmploymentActive(attributes.terminationDate);
    const created = await this.transaction(async manager => {
      let user: UsersEntity | null;
      let resetToken: string | null = null;
      if (dto.user) {
        ({ user, resetToken } = await this.users.createAccount(manager, dto.user, active ? [SystemRole.EMPLOYEE] : [], actor.id));
      } else {
        user = await manager.findOne(UsersEntity, { where: { id: dto.userId }, lock: { mode: "pessimistic_write" } });
        if (!user) throw applicationError(ErrorMetadata.INVALID_VALUE, EmployeeMessage.InvalidUser);
        if (!user.isActive) throw applicationError(ErrorMetadata.CONFLICT, EmployeeMessage.InactiveAccount);
        if (await manager.count(EmployeeEntity, { where: { userId: user.id } })) throw applicationError(ErrorMetadata.ALREADY_EXISTS, EmployeeMessage.AlreadyEmployee);
        if (active) await this.ensureEmployeeRole(manager, user.id, actor.id);
      }
      const employee = await manager.save(manager.create(EmployeeEntity, { ...attributes, userId: user.id }));
      await this.replaceJobTitles(manager, employee.id, dto.jobTitleIds ?? []);
      return { id: employee.id, email: user.email, resetToken };
    });
    if (created.resetToken) await this.emailService.sendEmployeeWelcomeEmail(created.email, created.resetToken);
    return serializeEmployee(await this.load(created.id));
  }

  /**
   * EMPLOYEE follows the profile in the same transaction: an active profile (termination absent or in the
   * future) gets it (again) and a terminated one loses it. The profile row is locked (UPDLOCK) so this
   * serializes with PUT /api/vetcare/users/:id/roles and with reservation assignment/confirmation without relying on
   * blocking reads. Termination or unavailability with open reservations assigned returns 409 (their ids).
   */
  async update(id: string, dto: UpdateEmployeeDto, actor: Actor) {
    const attributes = this.fields(dto);
    const revokedFrom = await this.transaction(async manager => {
      const employee = await manager.findOne(EmployeeEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, EmployeeMessage.NotFound);
      const before = { ...employee };
      Object.assign(employee, attributes);
      this.assertDates(employee.hireDate, employee.terminationDate);
      this.applyAvailabilityRule(employee, dto.isAvailableForBookings);
      await this.assertNoStrandedReservations(manager, before, employee);
      await manager.save(employee);
      let revoked = false;
      if (isEmploymentActive(employee.terminationDate)) await this.ensureEmployeeRole(manager, employee.userId, actor.id);
      else revoked = await this.revokeEmployeeRole(manager, employee.userId);
      if (dto.jobTitleIds !== undefined) await this.replaceJobTitles(manager, employee.id, dto.jobTitleIds);
      return revoked ? employee.userId : null;
    });
    // Logged after commit so rolled-back changes are never reported.
    if (revokedFrom) {
      this.logger.log(`Employee role removed from user ${revokedFrom} (profile ${id} terminated) by ${actor.id} at ${new Date().toISOString()}`);
    }
    return serializeEmployee(await this.load(id));
  }

  /**
   * Removes the profile, its job titles and the EMPLOYEE role together; the account remains. A profile referenced
   * by any reservation or clinical visit (any state) is never deleted (409, counts in the message only): terminate it instead.
   * The row is locked (UPDLOCK) first, so no assignment or visit (which lock or read it) appears meanwhile; the
   * foreign keys remain the final arbiter.
   */
  async delete(id: string) {
    await this.transaction(async manager => {
      const employee = await manager.findOne(EmployeeEntity, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, EmployeeMessage.NotFound);
      const reservationCount = await manager.count(ReservationEntity, { where: { employeeId: employee.id } });
      const clinicalVisitCount = await manager.count(ClinicalVisitEntity, { where: { employeeId: employee.id } });
      if (reservationCount || clinicalVisitCount) {
        throw applicationError(ErrorMetadata.IN_USE, EmployeeConflictMessages.hasHistory(reservationCount, clinicalVisitCount), undefined, { code: "EMPLOYEE_HAS_HISTORY" });
      }
      const employeeRoleId = await this.settings.resolveRoleId(SystemRole.EMPLOYEE);
      await manager.delete(EmployeeJobTitleEntity, { employeeId: employee.id });
      await manager.delete(EmployeeEntity, { id: employee.id });
      await manager.delete(UserRoleEntity, { userId: employee.userId, roleId: employeeRoleId });
    });
  }

  /** Bookable on a date: available profile, active account, not terminated on or before today/the date. */
  isBookable(employee: EmployeeEntity | null | undefined, date?: string): employee is EmployeeEntity & { user: UsersEntity } {
    return isBookableEmployee(employee, date);
  }

  /** Bookable employees for a clinic date. TODO: also consider existing reservations or shifts. */
  async getAvailableByDate(date: string) {
    const key = dateKey(date);
    const rows = await this.persistence.execute(() => this.employees.createQueryBuilder("employee")
      .innerJoinAndSelect("employee.user", "user")
      .leftJoinAndSelect("employee.jobTitleLinks", "link")
      .leftJoinAndSelect("link.jobTitle", "jobTitle")
      .where("employee.isAvailableForBookings = :available", { available: true })
      .andWhere("user.isActive = :active", { active: true })
      .andWhere("(employee.terminationDate IS NULL OR employee.terminationDate > :date)", { date: key })
      .orderBy("user.name", "ASC")
      .getMany());
    return rows.filter(row => this.isBookable(row, key)).map(serializeEmployee);
  }
}
