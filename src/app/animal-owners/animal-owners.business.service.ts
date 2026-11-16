import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { AnimalEntity } from "../animal/entities/animal.entity";
import { Actor, isStaff, requireAdmin, sameId } from "../core/authorization";
import { SystemRole } from "../core/enums/system-role.enum";
import { isUniqueViolationOf, PersistenceService } from "../core/persistence/persistence.service";
import { findOpenReservations, OpenReservation, openReservationsConflict } from "../reservation/open-reservations";
import { ReservationEntity } from "../reservation/entities/reservation.entity";
import { ReservationHistoryAction } from "../reservation-history/enums/reservation-history-action.enum";
import { ReservationHistoryService } from "../reservation-history/reservation-history.service";
import { RoleMembershipService } from "../roles/role-membership.service";
import { UsersEntity } from "../users/entities/users.entity";
import { contactSummary, projectRelatedUser } from "../users/user.projection";
import { AnimalAccessService } from "./animal-access.service";
import { AddAnimalOwnerDto, ListAnimalOwnersQueryDto, RemoveAnimalOwnerDto, TransferAnimalDto } from "./dto/animal-owners.dto";
import { ANIMAL_OWNER_ACTIVE_INDEX, ANIMAL_OWNER_PRIMARY_INDEX, AnimalOwnerEntity } from "./entities/animal-owner.entity";
import { AnimalOwnerEndReason } from "./enums/animal-owner-end-reason.enum";
import { AnimalOwnersMessage } from "./animal-owners.messages";

const WRITE_LOCK = { mode: "pessimistic_write" } as const;

/** Options of a primary-tutor transfer that already holds the animal lock. */
export type TransferOptions = {
  newPrimaryUserId: string;
  keepPreviousAsSecondary?: boolean;
  transferFutureReservations?: boolean;
  reason?: string | null;
};

/**
 * Tutor as seen by the actor: the account as in the animal's `owner` (full for administrators, contact summary
 * otherwise). With `period` (history) the end of the period is included; who opened/closed it only for administrators.
 */
export function serializeTutor(row: AnimalOwnerEntity, actor: Actor, period = false) {
  const view: Record<string, unknown> = {
    user: projectRelatedUser(row.user, actor, contactSummary), isPrimary: row.isPrimary, assignedAt: row.assignedAt,
  };
  if (period) {
    view.endedAt = row.endedAt;
    view.endReason = row.endReason;
    if (actor.isAdmin) {
      view.assignedBy = row.assignedBy;
      view.endedBy = row.endedBy;
    }
  }
  return view;
}

/**
 * Tutorship management (vc_animal_owners). Lock order, an extension of the global one (docs/API_ORGANIZATION.md):
 *   vc_reservations (by id, only when reservations are moved) -> vc_animals -> vc_users (accounts, by id)
 *   -> writes to vc_animal_owners / vc_reservations.
 * The animal row is locked (UPDLOCK) before vc_animal_owners is read for a decision or written, so every tutorship
 * change of one animal is serialized; accounts that gain a row are locked before any vc_animal_owners write, so account
 * deletion and role changes (account lock, then vc_animal_owners) serialize with them. Reservations that may be moved
 * are locked BEFORE the animal (reservation -> animal, as every reservation flow), in id order; after the animal lock
 * they are read again and, if the set grew in between, the request fails with 409 RESERVATIONS_CHANGED (retry) instead
 * of locking a reservation while holding the animal (which could deadlock with confirm/reschedule/visit start).
 */
@Injectable()
export class AnimalOwnersBusinessService {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly dataSource: DataSource,
    private readonly access: AnimalAccessService,
    private readonly membership: RoleMembershipService,
    private readonly history: ReservationHistoryService,
  ) {}

  private transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.persistence.execute(() => this.dataSource.transaction(work));
  }

  private async requireAnimal(animalId: string): Promise<void> {
    const animal = await this.persistence.execute(() => this.dataSource.manager.findOne(AnimalEntity, { select: { id: true }, where: { id: animalId } }));
    if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalOwnersMessage.AnimalNotFound);
  }

  /** Locks the animal row (UPDLOCK, no joins; soft-deleted animals are not found). */
  private async lockAnimal(manager: EntityManager, animalId: string): Promise<AnimalEntity> {
    const animal = await manager.findOne(AnimalEntity, { where: { id: animalId }, lock: WRITE_LOCK });
    if (!animal) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalOwnersMessage.AnimalNotFound);
    return animal;
  }

  /**
   * Locks (UPDLOCK) an account that is about to gain a tutorship row: it must exist, not be deleted, be active and
   * hold CLIENT (400 otherwise).
   */
  async lockTutorAccount(manager: EntityManager, userId: string): Promise<UsersEntity> {
    const account = await manager.findOne(UsersEntity, { where: { id: userId }, lock: WRITE_LOCK });
    if (!account?.isActive || !(await this.membership.hasSystemRole(account.id, SystemRole.CLIENT))) {
      throw applicationError(ErrorMetadata.INVALID_VALUE, AnimalOwnersMessage.InvalidTutor);
    }
    return account;
  }

  // ---------------------------------------------------------------- reads

  /**
   * Active tutors (primary first) for staff and active tutors; with includeHistory every period, active and closed,
   * for staff and the primary tutor only (403 otherwise).
   */
  async list(animalId: string, query: ListAnimalOwnersQueryDto, actor: Actor) {
    await this.requireAnimal(animalId);
    if (!(await this.access.canReadAnimal(actor, animalId))) throw applicationError(ErrorMetadata.FORBIDDEN, AnimalOwnersMessage.AccessDenied);
    if (query.includeHistory) {
      if (!(await this.access.canManageAnimal(actor, animalId))) throw applicationError(ErrorMetadata.FORBIDDEN, AnimalOwnersMessage.HistoryForbidden);
      return (await this.access.history(animalId)).map(row => serializeTutor(row, actor, true));
    }
    const rows = (await this.access.activeTutorsOf([animalId])).get(animalId.toLowerCase()) ?? [];
    return rows.map(row => serializeTutor(row, actor));
  }

  // ---------------------------------------------------------------- writes

  /** Opens the first primary period of a new animal (creation), after the caller locked the account. */
  async openInitialPrimary(manager: EntityManager, animalId: string, userId: string, actorId: string, now = new Date()) {
    await manager.insert(AnimalOwnerEntity, {
      animalId, userId, isPrimary: true, assignedAt: now, endedAt: null, assignedBy: actorId, endedBy: null, endReason: null });
  }

  /** Secondary tutor added by staff or the primary tutor. The animal needs a primary tutor (409 otherwise). */
  async add(animalId: string, dto: AddAnimalOwnerDto, actor: Actor) {
    await this.transaction(async manager => {
      await this.lockAnimal(manager, animalId);
      const active = await this.access.activeTutors(animalId, manager);
      if (!isStaff(actor) && !active.some(row => row.isPrimary && sameId(row.userId, actor.id))) {
        throw applicationError(ErrorMetadata.FORBIDDEN, AnimalOwnersMessage.ManageForbidden);
      }
      if (!active.some(row => row.isPrimary)) throw this.noPrimary();
      if (active.some(row => sameId(row.userId, dto.userId))) throw this.alreadyTutor();
      await this.lockTutorAccount(manager, dto.userId);
      try {
        await manager.insert(AnimalOwnerEntity, {
          animalId, userId: dto.userId, isPrimary: false, assignedAt: new Date(), endedAt: null, assignedBy: actor.id, endedBy: null, endReason: null });
      } catch (error) {
        if (isUniqueViolationOf(error, ANIMAL_OWNER_ACTIVE_INDEX)) throw this.alreadyTutor();
        throw error;
      }
    });
    return this.list(animalId, {}, actor);
  }

  private alreadyTutor() {
    return applicationError(ErrorMetadata.ALREADY_EXISTS, AnimalOwnersMessage.AlreadyTutor, undefined, { code: "ALREADY_TUTOR" });
  }

  private noPrimary() {
    return applicationError(ErrorMetadata.CONFLICT, AnimalOwnersMessage.NoPrimary, undefined, { code: "ANIMAL_HAS_NO_PRIMARY" });
  }

  /**
   * Ends a secondary tutorship (ended_at, never deleted). Allowed to staff, the primary tutor and the secondary tutor
   * themselves; the primary tutor cannot be removed (409, transfer first). Open reservations of the animal whose
   * client is that tutor block the removal (409 with the list) unless transferFutureReservations, which moves them to
   * the primary tutor (CLIENT_CHANGED events) in the same transaction.
   */
  async remove(animalId: string, userId: string, dto: RemoveAnimalOwnerDto, actor: Actor) {
    await this.requireAnimal(animalId);
    const allowed = (primaryUserId: string | null | undefined) => isStaff(actor) || sameId(actor.id, userId) || sameId(actor.id, primaryUserId);
    // Early 403 without locks; re-checked under the animal lock.
    if (!isStaff(actor) && !sameId(actor.id, userId) && !(await this.access.isPrimaryTutor(animalId, actor.id))) {
      throw applicationError(ErrorMetadata.FORBIDDEN, AnimalOwnersMessage.ManageForbidden);
    }
    const moved = await this.transaction(async manager => {
      const locked = dto.transferFutureReservations ? await this.lockReservationsOf(manager, animalId, userId) : new Set<string>();
      await this.lockAnimal(manager, animalId);
      const active = await this.access.activeTutors(animalId, manager);
      const primary = active.find(row => row.isPrimary) ?? null;
      if (!allowed(primary?.userId)) throw applicationError(ErrorMetadata.FORBIDDEN, AnimalOwnersMessage.ManageForbidden);
      const target = active.find(row => sameId(row.userId, userId));
      if (!target) throw applicationError(ErrorMetadata.NOT_FOUND, AnimalOwnersMessage.NotTutor);
      if (target.isPrimary) throw applicationError(ErrorMetadata.CONFLICT, AnimalOwnersMessage.PrimaryNotRemovable, undefined, { code: "PRIMARY_TUTOR_NOT_REMOVABLE" });
      const open = await this.openReservationsOf(manager, animalId, userId);
      if (open.length) {
        if (!dto.transferFutureReservations) throw openReservationsConflict("TUTOR_HAS_OPEN_RESERVATIONS", AnimalOwnersMessage.FutureReservations, open);
        this.requireLocked(open, locked);
        if (!primary) throw this.noPrimary();
        const account = await manager.findOne(UsersEntity, { where: { id: primary.userId }, lock: WRITE_LOCK });
        if (!account?.isActive) throw applicationError(ErrorMetadata.CONFLICT, AnimalOwnersMessage.PrimaryInactive, undefined, { code: "PRIMARY_TUTOR_INACTIVE" });
      }
      await this.close(manager, target, actor.id, AnimalOwnerEndReason.REMOVED);
      if (open.length) await this.moveReservations(manager, open, primary!.userId, actor.id, null);
      return open.map(reservation => reservation.id);
    });
    return { movedReservationIds: moved };
  }

  /** Administrators only: hands the primary tutorship to another active client account (see transferLocked). */
  async transfer(animalId: string, dto: TransferAnimalDto, actor: Actor) {
    requireAdmin(actor, AnimalOwnersMessage.TransferForbidden);
    await this.transaction(async manager => {
      let locked = new Set<string>();
      if (dto.transferFutureReservations) {
        // Phase 1 (before the animal lock): lock the reservations that may be moved, in id order.
        const current = (await this.access.activeTutors(animalId, manager)).find(row => row.isPrimary);
        if (current) locked = await this.lockReservationsOf(manager, animalId, current.userId);
      }
      await this.lockAnimal(manager, animalId);
      await this.transferLocked(manager, animalId, dto, actor, locked);
    });
    return this.list(animalId, {}, actor);
  }

  /**
   * Primary-tutor transfer inside the caller's transaction, which already locked the animal row (and, when
   * transferFutureReservations, the reservations in `locked`). Closes the current primary period (TRANSFERRED),
   * closes the new tutor's secondary period if any (TRANSFERRED; promotion = close + open), opens the new primary
   * period, optionally reopens the previous primary as secondary, and synchronizes vc_animals.owner_id. Accounts are
   * locked in id order before any write. Without a current primary (legacy animal without owner) it only assigns one.
   * Returns the new primary account.
   */
  async transferLocked(manager: EntityManager, animalId: string, options: TransferOptions, actor: Actor, locked = new Set<string>()): Promise<UsersEntity> {
    const active = await this.access.activeTutors(animalId, manager);
    const previous = active.find(row => row.isPrimary) ?? null;
    if (previous && sameId(previous.userId, options.newPrimaryUserId)) {
      throw applicationError(ErrorMetadata.ALREADY_EXISTS, AnimalOwnersMessage.AlreadyPrimary, undefined, { code: "ALREADY_PRIMARY" });
    }
    const open = previous ? await this.openReservationsOf(manager, animalId, previous.userId) : [];
    if (open.length) {
      if (!options.transferFutureReservations) throw openReservationsConflict("TUTOR_HAS_OPEN_RESERVATIONS", AnimalOwnersMessage.FutureReservations, open);
      this.requireLocked(open, locked);
    }
    const keepPrevious = !!options.keepPreviousAsSecondary && !!previous;
    const accountIds = [options.newPrimaryUserId, ...(keepPrevious ? [previous!.userId] : [])]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    let newPrimary: UsersEntity | null = null;
    for (const id of accountIds) {
      if (sameId(id, options.newPrimaryUserId)) newPrimary = await this.lockTutorAccount(manager, id);
      else if (!(await manager.findOne(UsersEntity, { where: { id }, lock: WRITE_LOCK }))) {
        throw applicationError(ErrorMetadata.CONFLICT, AnimalOwnersMessage.PreviousTutorUnavailable, undefined, { code: "PREVIOUS_TUTOR_UNAVAILABLE" });
      }
    }
    const now = new Date();
    if (previous) await this.close(manager, previous, actor.id, AnimalOwnerEndReason.TRANSFERRED, now);
    const secondary = active.find(row => !row.isPrimary && sameId(row.userId, options.newPrimaryUserId));
    if (secondary) await this.close(manager, secondary, actor.id, AnimalOwnerEndReason.TRANSFERRED, now);
    try {
      await manager.insert(AnimalOwnerEntity, {
        animalId, userId: newPrimary!.id, isPrimary: true, assignedAt: now, endedAt: null, assignedBy: actor.id, endedBy: null, endReason: null });
      if (keepPrevious) {
        await manager.insert(AnimalOwnerEntity, {
          animalId, userId: previous!.userId, isPrimary: false, assignedAt: now, endedAt: null, assignedBy: actor.id, endedBy: null, endReason: null });
      }
    } catch (error) {
      // Not expected while the animal lock is held; mapped to a clear 409 should the invariant ever be broken.
      if (isUniqueViolationOf(error, ANIMAL_OWNER_PRIMARY_INDEX) || isUniqueViolationOf(error, ANIMAL_OWNER_ACTIVE_INDEX)) {
        throw applicationError(ErrorMetadata.CONFLICT, AnimalOwnersMessage.TutorsChanged, undefined, { code: "TUTORS_CHANGED" });
      }
      throw error;
    }
    await manager.update(AnimalEntity, { id: animalId }, { owner: { id: newPrimary!.id } });
    if (open.length) await this.moveReservations(manager, open, newPrimary!.id, actor.id, options.reason ?? null);
    return newPrimary!;
  }

  // ---------------------------------------------------------------- helpers

  /** PENDING/CONFIRMED reservations of the animal, not yet finished, whose client is the account. */
  private async openReservationsOf(manager: EntityManager, animalId: string, clientId: string): Promise<OpenReservation[]> {
    return (await findOpenReservations(manager, { animalId })).filter(reservation => sameId(reservation.clientId, clientId));
  }

  /**
   * Phase 1 of a move: locks (UPDLOCK), one by one in id order, the open reservations of the animal whose client is
   * the account. Runs before the animal lock (reservation -> animal, the order of every reservation flow).
   */
  private async lockReservationsOf(manager: EntityManager, animalId: string, clientId: string): Promise<Set<string>> {
    const ids = (await this.openReservationsOf(manager, animalId, clientId)).map(reservation => reservation.id.toLowerCase()).sort();
    for (const id of ids) await manager.findOne(ReservationEntity, { where: { id }, lock: WRITE_LOCK });
    return new Set(ids);
  }

  /** Reservations to move must have been locked in phase 1; one that appeared in between makes the request fail (retry). */
  private requireLocked(open: OpenReservation[], locked: Set<string>) {
    const unlocked = open.filter(reservation => !locked.has(reservation.id.toLowerCase()));
    if (unlocked.length) {
      throw applicationError(ErrorMetadata.CONFLICT, AnimalOwnersMessage.ConcurrentReservations, undefined, {
        code: "RESERVATIONS_CHANGED", reservationIds: unlocked.map(reservation => reservation.id) });
    }
  }

  /** Changes the client of each (locked) reservation and records CLIENT_CHANGED in the append-only history. */
  private async moveReservations(manager: EntityManager, reservations: OpenReservation[], clientId: string, actorId: string, reason: string | null) {
    for (const reservation of reservations) {
      await manager.update(ReservationEntity, { id: reservation.id }, { clientId });
      await this.history.record(manager, {
        reservationId: reservation.id, action: ReservationHistoryAction.CLIENT_CHANGED, changedBy: actorId, reason,
        oldData: { clientId: reservation.clientId }, newData: { clientId } });
    }
  }

  /** Closes one active period; ended_at is never before assigned_at (ck_vc_animal_owners_dates). */
  private async close(manager: EntityManager, row: AnimalOwnerEntity, actorId: string, reason: AnimalOwnerEndReason, now = new Date()) {
    const endedAt = new Date(Math.max(now.getTime(), row.assignedAt.getTime()));
    await manager.update(AnimalOwnerEntity, { id: row.id }, { endedAt, endedBy: actorId, endReason: reason });
  }
}
