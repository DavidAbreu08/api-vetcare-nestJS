import { EntityManager, SelectQueryBuilder } from "typeorm";
import { utcInstantParam, uuidParam } from "../core/persistence/sql-params";
import { BlockedTimeEntity } from "./entities/bloked-times.entity";

/**
 * Blocks intersecting [startAt, endAt): start_at < @end AND end_at > @start AND (employee_id IS NULL OR employee_id IN
 * (@employeeIds)). Clinic-wide closures always apply; individual blocks only for the given employees (none = closures
 * only). Plain read without lock hints: reservation flows call it after the closures (Shared) and employee applocks, which
 * every block write holds (global Exclusive or the employee applock); availability reads are indicative.
 */
export function overlappingBlocks(manager: EntityManager, startAt: Date, endAt: Date, employeeIds: string[] = []): SelectQueryBuilder<BlockedTimeEntity> {
  const query = manager.createQueryBuilder(BlockedTimeEntity, "block")
    .where("block.startAt < :endAt", { endAt: utcInstantParam(endAt) })
    .andWhere("block.endAt > :startAt", { startAt: utcInstantParam(startAt) });
  return employeeIds.length
    ? query.andWhere("(block.employeeId IS NULL OR block.employeeId IN (:...blockEmployeeIds))", { blockEmployeeIds: employeeIds.map(uuidParam) })
    : query.andWhere("block.employeeId IS NULL");
}
