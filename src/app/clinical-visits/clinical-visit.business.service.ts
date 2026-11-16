import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { Actor, sameId } from "../core/authorization";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { isUniqueViolationOf, PersistenceService } from "../core/persistence/persistence.service";
import { isActiveEmployee } from "../employees/employee-status";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { ReservationHistoryService, reservationSnapshot } from "../reservation-history/reservation-history.service";
import { assertTransition } from "../reservation/reservation-policy";
import { CompleteClinicalVisitDto, CreateClinicalVisitDto, ListClinicalVisitsQueryDto, UpdateClinicalVisitDto, VoidClinicalVisitDto } from "./dto/clinical-visit.dto";
import { CLINICAL_VISIT_ANIMAL_IN_PROGRESS_INDEX, ClinicalVisitEntity } from "./entities/clinical-visit.entity";
import { ClinicalVisitStatus } from "./enums/clinical-visit-status.enum";
import { ClinicalVisitMessage } from "./clinical-visit.messages";
import { serializeClinicalVisit } from "./clinical-visit.serializer";
import { activeTutorExists, AnimalAccessService } from "../animal-owners/animal-access.service";

const WRITE_LOCK = { mode: "pessimistic_write" } as const;
const RELATIONS = { animal: { owner: true }, employee: { user: true } } as const;
/** Reservation states that grant the assigned employee clinical access to the animal (PENDING does not). */
export const CLINICAL_ACCESS_RESERVATION_STATUSES = [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW];

/**
 * Clinical visits. Access (no RBAC): administrators see everything; an employee with an active profile sees the
 * visits they are responsible for and those of animals with reservations assigned to them in CONFIRMED,
 * COMPLETED or NO_SHOW (a PENDING assignment is not yet accepted and grants nothing);
 * every active tutor (primary or secondary) of the animal sees its visits without clinical notes (the clinical record
 * follows the animal: a new tutor sees earlier visits, a former tutor none). Lock order is always
 * reservation -> animal -> visit -> measurement, matching reservation flows, animal deletion and visit start.
 */
@Injectable()
export class ClinicalVisitBusinessService {
  private readonly logger = new Logger(ClinicalVisitBusinessService.name);

  constructor(
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
    private readonly history: ReservationHistoryService,
    @InjectRepository(ClinicalVisitEntity) private readonly visits: Repository<ClinicalVisitEntity>,
    @InjectRepository(ReservationEntity) private readonly reservations: Repository<ReservationEntity>,
    private readonly access: AnimalAccessService,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  /** Active employee profile of the caller, or null. */
  private actorEmployeeId(actor: Actor): string | null {
    return actor.isEmployee && actor.employeeId ? actor.employeeId : null;
  }

  /** Animals (among the given ids) with a CONFIRMED/COMPLETED/NO_SHOW reservation assigned to the employee. */
  private async assignedAnimalIds(employeeId: string, animalIds: string[], manager?: EntityManager): Promise<Set<string>> {
    if (!animalIds.length) return new Set();
    const builder = manager ? manager.createQueryBuilder(ReservationEntity, "r") : this.reservations.createQueryBuilder("r");
    const rows: { animalId: string }[] = await this.persistence.execute(() => builder
      .select("DISTINCT r.animal_id", "animalId")
      .where("r.employee_id = :employeeId", { employeeId })
      .andWhere("r.status IN (:...accessStatuses)", { accessStatuses: CLINICAL_ACCESS_RESERVATION_STATUSES })
      .andWhere("r.animal_id IN (:...animalIds)", { animalIds: [...new Set(animalIds)] })
      .getRawMany());
    return new Set(rows.map(row => String(row.animalId).toLowerCase()));
  }

  /** Professional access: administrator, responsible employee, or employee with a reservation of the animal. */
  async hasProfessionalAccess(actor: Actor, visit: Pick<ClinicalVisitEntity, "employeeId" | "animalId">, manager?: EntityManager): Promise<boolean> {
    if (actor.isAdmin) return true;
    const employeeId = this.actorEmployeeId(actor);
    if (!employeeId) return false;
    if (sameId(visit.employeeId, employeeId)) return true;
    return (await this.assignedAnimalIds(employeeId, [visit.animalId], manager)).has(visit.animalId.toLowerCase());
  }

  /** Active tutor (primary or secondary) of the visit's animal. */
  private isTutor(actor: Actor, visit: ClinicalVisitEntity): Promise<boolean> {
    return this.access.isActiveTutor(visit.animalId, actor.id);
  }

  /** Administrator or the responsible employee (active profile). */
  private requireResponsible(actor: Actor, visit: ClinicalVisitEntity) {
    if (!actor.isAdmin && !sameId(visit.employeeId, this.actorEmployeeId(actor))) throw applicationError(ErrorMetadata.FORBIDDEN, ClinicalVisitMessage.NotResponsible);
  }

  private async load(id: string): Promise<ClinicalVisitEntity> {
    const visit = await this.persistence.execute(() => this.visits.findOne({ where: { id }, relations: RELATIONS, withDeleted: true }));
    if (!visit) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.NotFound);
    return visit;
  }

  async get(id: string, actor: Actor) {
    const visit = await this.load(id);
    const professional = await this.hasProfessionalAccess(actor, visit);
    if (!professional && !(await this.isTutor(actor, visit))) throw applicationError(ErrorMetadata.FORBIDDEN, ClinicalVisitMessage.ClinicalAccessDenied);
    return serializeClinicalVisit(visit, actor, professional);
  }

  async list(query: ListClinicalVisitsQueryDto, actor: Actor) {
    const builder = this.visits.createQueryBuilder("visit")
      .withDeleted()
      .leftJoinAndSelect("visit.animal", "animal")
      .leftJoinAndSelect("animal.owner", "owner")
      .leftJoinAndSelect("visit.employee", "employee")
      .leftJoinAndSelect("employee.user", "employeeUser");
    const employeeId = this.actorEmployeeId(actor);
    if (!actor.isAdmin) {
      const scopes = [activeTutorExists("visit.animalId", "actorId")];
      if (employeeId) {
        scopes.push("visit.employeeId = :actorEmployeeId");
        scopes.push("visit.animalId IN (SELECT r.animal_id FROM vc_reservations r WHERE r.employee_id = :actorEmployeeId AND r.status IN (:...accessStatuses))");
      }
      builder.andWhere(`(${scopes.join(" OR ")})`, { actorId: actor.id, actorEmployeeId: employeeId, accessStatuses: CLINICAL_ACCESS_RESERVATION_STATUSES });
    }
    if (query.animalId) builder.andWhere("visit.animalId = :animalId", { animalId: query.animalId });
    if (query.employeeId) builder.andWhere("visit.employeeId = :employeeId", { employeeId: query.employeeId });
    if (query.reservationId) builder.andWhere("visit.reservationId = :reservationId", { reservationId: query.reservationId });
    if (query.status) builder.andWhere("visit.status = :status", { status: query.status });
    const rows = await this.persistence.execute(() => builder
      .orderBy("visit.startedAt", "DESC").addOrderBy("visit.id", "DESC").skip(query.skip).take(query.take).getMany());
    const assigned = !actor.isAdmin && employeeId ? await this.assignedAnimalIds(employeeId, rows.map(row => row.animalId)) : new Set<string>();
    return rows.map(row => serializeClinicalVisit(row, actor,
      actor.isAdmin || sameId(row.employeeId, employeeId) || assigned.has(row.animalId.toLowerCase())));
  }

  // ---------------------------------------------------------------- writes

  /**
   * Responsible employee: the caller's active profile, or (administrators only) any active employee. Without an
   * explicit choice, `fallback` (the reservation's employee) is used before the caller's own profile.
   */
  private async resolveEmployee(manager: EntityManager, requested: string | undefined, actor: Actor, fallback?: string | null): Promise<EmployeeEntity> {
    const own = this.actorEmployeeId(actor);
    if (requested && !actor.isAdmin && !sameId(requested, own)) throw applicationError(ErrorMetadata.FORBIDDEN, ClinicalVisitMessage.EmployeeForbidden);
    const target = requested ?? fallback ?? own;
    if (!target) throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicalVisitMessage.EmployeeRequired);
    const employee = await manager.findOne(EmployeeEntity, { where: { id: target }, relations: { user: true } });
    if (!isActiveEmployee(employee)) throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicalVisitMessage.InvalidEmployee);
    return employee;
  }

  /**
   * Starts a visit. From a reservation: the reservation row is locked, must be CONFIRMED and without a visit,
   * and gives the animal (a different animalId is rejected; the composite FK enforces it in SQL too). Only the
   * employee assigned to the reservation or an administrator (who may name another responsible) can start it.
   * Any existing visit, VOIDED included, blocks a new one (filtered unique index on reservation_id).
   * The animal row is then locked (UPDLOCK; not soft-deleted) and an animal may have only one IN_PROGRESS visit:
   * 409 ANIMAL_VISIT_IN_PROGRESS with the visit id, also when the filtered unique index
   * uq_vc_clinical_visits_animal_in_progress rejects the insert (concurrent start).
   */
  async start(dto: CreateClinicalVisitDto, actor: Actor) {
    if (!dto.reservationId && !dto.animalId) throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicalVisitMessage.AnimalOrReservationRequired);
    const saved = await this.transaction(async manager => {
      let animalId = dto.animalId as string;
      let reservationId: string | null = null;
      let reservationEmployeeId: string | null = null;
      if (dto.reservationId) {
        const reservation = await manager.findOne(ReservationEntity, { where: { id: dto.reservationId }, lock: WRITE_LOCK });
        if (!reservation) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.ReservationNotFound);
        if (reservation.status !== ReservationStatus.CONFIRMED) throw applicationError(ErrorMetadata.CONFLICT, ClinicalVisitMessage.ReservationNotConfirmed);
        if (!actor.isAdmin && !sameId(reservation.employeeId, this.actorEmployeeId(actor))) {
          throw applicationError(ErrorMetadata.FORBIDDEN, ClinicalVisitMessage.NotReservationEmployee);
        }
        if (dto.animalId && !sameId(dto.animalId, reservation.animalId)) throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicalVisitMessage.AnimalMismatch);
        if ((await manager.count(ClinicalVisitEntity, { where: { reservationId: reservation.id } })) > 0) {
          throw applicationError(ErrorMetadata.CONFLICT, ClinicalVisitMessage.ReservationHasVisit);
        }
        animalId = reservation.animalId;
        reservationId = reservation.id;
        reservationEmployeeId = reservation.employeeId;
      }
      const animal = await manager.findOne(AnimalEntity, { where: { id: animalId }, lock: WRITE_LOCK });
      if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.AnimalNotFound);
      const inProgress = await manager.find(ClinicalVisitEntity, { select: { id: true }, where: { animalId: animal.id, status: ClinicalVisitStatus.IN_PROGRESS } });
      if (inProgress.length) throw this.visitInProgressConflict(inProgress.map(visit => visit.id));
      const employee = await this.resolveEmployee(manager, dto.employeeId, actor, reservationEmployeeId);
      try {
        return await manager.save(manager.create(ClinicalVisitEntity, {
          reservationId, animalId: animal.id, employeeId: employee.id, status: ClinicalVisitStatus.IN_PROGRESS,
          startedAt: new Date(), endedAt: null, clinicalNotes: dto.clinicalNotes ?? null, description: dto.description ?? null,
          voidReason: null, voidedAt: null, voidedBy: null, completedBy: null,
        }));
      } catch (error) {
        if (isUniqueViolationOf(error, CLINICAL_VISIT_ANIMAL_IN_PROGRESS_INDEX)) throw this.visitInProgressConflict([]);
        throw error;
      }
    });
    return this.get(saved.id, actor);
  }

  private visitInProgressConflict(clinicalVisitIds: string[]): ConflictException {
    return applicationError(ErrorMetadata.IN_USE, ClinicalVisitMessage.AnimalVisitInProgress, undefined, { code: "ANIMAL_VISIT_IN_PROGRESS", clinicalVisitIds });
  }

  /** Locks the reservation (if any) and then the visit, re-reading the visit under its lock. */
  private async lockVisit(manager: EntityManager, id: string): Promise<{ visit: ClinicalVisitEntity; reservation: ReservationEntity | null }> {
    const current = await manager.findOne(ClinicalVisitEntity, { where: { id } });
    if (!current) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.NotFound);
    const reservation = current.reservationId
      ? await manager.findOne(ReservationEntity, { where: { id: current.reservationId }, lock: WRITE_LOCK })
      : null;
    const visit = await manager.findOne(ClinicalVisitEntity, { where: { id }, lock: WRITE_LOCK });
    if (!visit) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.NotFound);
    return { visit, reservation };
  }

  private requireInProgress(visit: ClinicalVisitEntity) {
    if (visit.status !== ClinicalVisitStatus.IN_PROGRESS) throw applicationError(ErrorMetadata.CONFLICT, ClinicalVisitMessage.NotInProgress);
  }

  /** Notes/description of an IN_PROGRESS visit (responsible employee or administrator). */
  async update(id: string, dto: UpdateClinicalVisitDto, actor: Actor) {
    await this.transaction(async manager => {
      const { visit } = await this.lockVisit(manager, id);
      this.requireResponsible(actor, visit);
      this.requireInProgress(visit);
      const changes: Partial<ClinicalVisitEntity> = {};
      if (dto.clinicalNotes !== undefined) changes.clinicalNotes = dto.clinicalNotes;
      if (dto.description !== undefined) changes.description = dto.description;
      if (Object.keys(changes).length) await manager.update(ClinicalVisitEntity, { id: visit.id }, changes);
    });
    return this.get(id, actor);
  }

  /**
   * IN_PROGRESS -> COMPLETED (endedAt = now, never before startedAt; completedBy = the caller's account). A visit
   * from a reservation completes the reservation (CONFIRMED -> COMPLETED) and records COMPLETED in its history, all
   * in the same transaction.
   */
  async complete(id: string, dto: CompleteClinicalVisitDto, actor: Actor) {
    await this.transaction(async manager => {
      const { visit, reservation } = await this.lockVisit(manager, id);
      this.requireResponsible(actor, visit);
      this.requireInProgress(visit);
      if (visit.reservationId) {
        if (!reservation) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.ReservationNotFound);
        assertTransition(reservation.status, ReservationStatus.COMPLETED);
      }
      const endedAt = new Date(Math.max(Date.now(), visit.startedAt.getTime()));
      await manager.update(ClinicalVisitEntity, { id: visit.id }, {
        status: ClinicalVisitStatus.COMPLETED, endedAt, completedBy: actor.id,
        ...(dto.clinicalNotes !== undefined ? { clinicalNotes: dto.clinicalNotes } : {}),
      });
      if (visit.reservationId && reservation) {
        await manager.update(ReservationEntity, { id: reservation.id }, { status: ReservationStatus.COMPLETED });
        await this.history.record(manager, {
          reservationId: reservation.id, action: ReservationHistoryAction.COMPLETED, changedBy: actor.id,
          oldData: reservationSnapshot(reservation),
          newData: { ...reservationSnapshot({ ...reservation, status: ReservationStatus.COMPLETED }), clinicalVisitId: visit.id },
        });
      }
    });
    return this.get(id, actor);
  }

  /**
   * IN_PROGRESS -> VOIDED by an administrator with a justification; the reservation is left unchanged. voidedAt is
   * never before startedAt (ck_vc_clinical_visits_voided_dates), as endedAt on completion.
   */
  async voidVisit(id: string, dto: VoidClinicalVisitDto, actor: Actor) {
    if (!actor.isAdmin) throw applicationError(ErrorMetadata.FORBIDDEN, ClinicalVisitMessage.NotResponsible);
    const reason = typeof dto.reason === "string" ? dto.reason.trim() : "";
    if (!reason) throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicalVisitMessage.ReasonRequired);
    let voidedAt = new Date();
    await this.transaction(async manager => {
      const { visit } = await this.lockVisit(manager, id);
      this.requireInProgress(visit);
      voidedAt = new Date(Math.max(voidedAt.getTime(), visit.startedAt.getTime()));
      await manager.update(ClinicalVisitEntity, { id: visit.id }, { status: ClinicalVisitStatus.VOIDED, voidReason: reason, voidedAt, voidedBy: actor.id });
    });
    this.logger.warn(`Clinical visit ${id} voided by ${actor.id} at ${voidedAt.toISOString()}`);
    return this.get(id, actor);
  }

  /**
   * Runs measurement work linked to a visit in one transaction holding the visit lock: the visit must exist,
   * belong to the measurement's animal, be professionally accessible to the caller and be IN_PROGRESS.
   */
  async withWritableVisit<T>(visitId: string, animalId: string, actor: Actor, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.transaction(async manager => {
      const visit = await manager.findOne(ClinicalVisitEntity, { where: { id: visitId }, lock: WRITE_LOCK });
      if (!visit) throw applicationError(ErrorMetadata.NOT_FOUND, ClinicalVisitMessage.NotFound);
      if (!sameId(visit.animalId, animalId)) throw applicationError(ErrorMetadata.INVALID_VALUE, ClinicalVisitMessage.MeasurementAnimalMismatch);
      if (!(await this.hasProfessionalAccess(actor, visit, manager))) throw applicationError(ErrorMetadata.FORBIDDEN, ClinicalVisitMessage.ClinicalAccessDenied);
      if (visit.status !== ClinicalVisitStatus.IN_PROGRESS) throw applicationError(ErrorMetadata.CONFLICT, ClinicalVisitMessage.MeasurementVisitClosed);
      return work(manager);
    });
  }
}
