import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, IsNull, MssqlParameter, Repository } from "typeorm";
import { Actor, isStaff } from "../core/authorization";
import { PersistenceService } from "../core/persistence/persistence.service";
import { utcInstantParam, uuidParam } from "../core/persistence/sql-params";
import { AnimalOwnerEntity } from "./entities/animal-owner.entity";
import { AnimalOwnerEndReason } from "./enums/animal-owner-end-reason.enum";

/**
 * SQL condition "userParam is an active tutor (primary or secondary) of the animal whose id is animalIdExpr", for
 * query builders. animalIdExpr is a property path of the outer query (e.g. "reservation.animalId", "animal.id"),
 * which TypeORM maps to its column; the subquery uses raw column names under its own alias, so it never collides
 * with the outer aliases. Served by uq_vc_animal_owners_active (animal_id, user_id) WHERE ended_at IS NULL.
 */
export function activeTutorExists(animalIdExpr: string, userParam: string): string {
  return `EXISTS (SELECT 1 FROM vc_animal_owners ao_tutor WHERE ao_tutor.animal_id = ${animalIdExpr} `
    + `AND ao_tutor.user_id = :${userParam} AND ao_tutor.ended_at IS NULL)`;
}

/**
 * Central read side of animal tutorship (vc_animal_owners). Every access decision about an animal and its
 * measurements, clinical visits and reservations goes through here instead of vc_animals.owner_id. Kept free of
 * other application modules so AnimalModule, MeasurementModule, ClinicalVisitModule, ReservationModule and
 * UsersModule can all depend on it without cycles.
 */
@Injectable()
export class AnimalAccessService {
  constructor(
    @InjectRepository(AnimalOwnerEntity) private readonly owners: Repository<AnimalOwnerEntity>,
    private readonly persistence: PersistenceService,
  ) {}

  private run<T>(manager: EntityManager | undefined, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return manager ? work(manager) : this.persistence.execute(() => work(this.owners.manager));
  }

  /** Active rows of an animal, primary first. Pass the transaction manager after locking the animal row. */
  activeTutors(animalId: string, manager?: EntityManager): Promise<AnimalOwnerEntity[]> {
    return this.run(manager, m => m.find(AnimalOwnerEntity, {
      where: { animalId, endedAt: IsNull() }, order: { isPrimary: "DESC", assignedAt: "ASC", id: "ASC" } }));
  }

  async isActiveTutor(animalId: string, userId: string, manager?: EntityManager): Promise<boolean> {
    return (await this.run(manager, m => m.count(AnimalOwnerEntity, { where: { animalId, userId, endedAt: IsNull() } }))) > 0;
  }

  async isPrimaryTutor(animalId: string, userId: string, manager?: EntityManager): Promise<boolean> {
    return (await this.run(manager, m => m.count(AnimalOwnerEntity, { where: { animalId, userId, isPrimary: true, endedAt: IsNull() } }))) > 0;
  }

  async activeTutorIds(animalId: string, manager?: EntityManager): Promise<string[]> {
    return (await this.activeTutors(animalId, manager)).map(row => row.userId);
  }

  /** Staff (administrator or active employee) or an active tutor of the animal. */
  async canReadAnimal(actor: Actor, animalId: string, manager?: EntityManager): Promise<boolean> {
    return isStaff(actor) || this.isActiveTutor(animalId, actor.id, manager);
  }

  /** Staff or the active primary tutor: who may edit the animal and manage its secondary tutors. */
  async canManageAnimal(actor: Actor, animalId: string, manager?: EntityManager): Promise<boolean> {
    return isStaff(actor) || this.isPrimaryTutor(animalId, actor.id, manager);
  }

  /** Active tutors (with their accounts) of each animal, keyed by lowercase animal id; primary first. */
  async activeTutorsOf(animalIds: string[]): Promise<Map<string, AnimalOwnerEntity[]>> {
    const ids = [...new Set(animalIds.map(id => id.toLowerCase()))];
    const result = new Map<string, AnimalOwnerEntity[]>(ids.map(id => [id, []]));
    for (let offset = 0; offset < ids.length; offset += 1000) {
      const rows = await this.persistence.execute(() => this.owners.find({
        where: { animalId: In(ids.slice(offset, offset + 1000)), endedAt: IsNull() },
        relations: { user: true }, withDeleted: true,
        order: { isPrimary: "DESC", assignedAt: "ASC", id: "ASC" } }));
      for (const row of rows) result.get(row.animalId.toLowerCase())?.push(row);
    }
    return result;
  }

  /** Every period (active and closed) of an animal, oldest first, with the tutor's account. */
  history(animalId: string): Promise<AnimalOwnerEntity[]> {
    return this.persistence.execute(() => this.owners.find({
      where: { animalId }, relations: { user: true }, withDeleted: true, order: { assignedAt: "ASC", id: "ASC" } }));
  }

  /**
   * Non-deleted animals of which the account is the active primary tutor (soft-deleted animals keep their rows
   * untouched). Plain read inside the caller's transaction, after the caller locked the account: every flow that
   * makes an account primary locks that account first.
   */
  async primaryAnimalIdsOf(manager: EntityManager, userId: string): Promise<string[]> {
    const rows = await manager.createQueryBuilder(AnimalOwnerEntity, "o")
      .select(["o.id", "o.animalId"])
      .innerJoin("o.animal", "animal")
      .where("o.userId = :userId", { userId })
      .andWhere("o.isPrimary = 1")
      .andWhere("o.endedAt IS NULL")
      .orderBy("o.animalId", "ASC")
      .getMany();
    return rows.map(row => row.animalId);
  }

  /**
   * Non-deleted animals of which the account is an active secondary tutor. Plain read inside the caller's transaction,
   * after the caller locked the account (every flow that opens or closes a secondary row locks that account first).
   */
  async secondaryAnimalIdsOf(manager: EntityManager, userId: string): Promise<string[]> {
    const rows = await manager.createQueryBuilder(AnimalOwnerEntity, "o")
      .select(["o.id", "o.animalId"])
      .innerJoin("o.animal", "animal")
      .where("o.userId = :userId", { userId })
      .andWhere("o.isPrimary = 0")
      .andWhere("o.endedAt IS NULL")
      .orderBy("o.animalId", "ASC")
      .getMany();
    return rows.map(row => row.animalId);
  }

  /**
   * Closes every active secondary tutorship of the account (account deletion, loss of the CLIENT role) in the
   * caller's transaction, after the caller locked the account. ended_at is never before assigned_at
   * (ck_vc_animal_owners_dates). Returns the affected animal ids.
   * Concurrency: only rows still active (ended_at IS NULL) are touched, so a period closed meanwhile is never rewritten.
   * The animal is not locked here (account -> vc_animal_owners rows); tutorship removal locks animal -> account and
   * reads/closes rows only after the account lock, so the two flows serialize on the account row and never wait on
   * each other's vc_animal_owners row locks (no cycle). The UPDATE seeks ix_vc_animal_owners_user_active (user_id),
   * so it only locks this account's rows.
   */
  async closeSecondaryTutorships(manager: EntityManager, userId: string, reason: AnimalOwnerEndReason, actorId: string | null, now = new Date()): Promise<string[]> {
    const rows: { animal_id: string }[] = await manager.query(
      "UPDATE [dbo].[vc_animal_owners] SET [ended_at] = CASE WHEN [assigned_at] > @0 THEN [assigned_at] ELSE @0 END, "
      + "[ended_by] = @1, [end_reason] = @2, [updated_at] = SYSDATETIME() OUTPUT inserted.[animal_id] "
      + "WHERE [user_id] = @3 AND [is_primary] = 0 AND [ended_at] IS NULL",
      [utcInstantParam(now), actorId ? uuidParam(actorId) : new MssqlParameter(null, "uniqueidentifier"), new MssqlParameter(reason, "nvarchar", 30), uuidParam(userId)],
    );
    return (rows ?? []).map(row => row.animal_id);
  }
}
