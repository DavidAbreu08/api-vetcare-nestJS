import { Actor, isStaff } from "../core/authorization";
import { AnimalMeasurementEntity } from "./entities/animal-measurement.entity";

/**
 * Measurement as seen by the actor: administrators and employees get the full row; clients do not see
 * updatedBy (who last edited it). recordedBy is unchanged. A copy of the entity is returned (same class, so
 * @Exclude/@Expose still apply in the global ClassSerializerInterceptor) and the loaded row is never mutated.
 */
export function projectMeasurement(row: AnimalMeasurementEntity, actor: Actor): AnimalMeasurementEntity {
  if (isStaff(actor)) return row;
  const copy = Object.assign(Object.create(Object.getPrototypeOf(row)), row) as AnimalMeasurementEntity;
  delete (copy as Partial<AnimalMeasurementEntity>).updatedBy;
  return copy;
}

export function projectMeasurements(rows: AnimalMeasurementEntity[], actor: Actor): AnimalMeasurementEntity[] {
  return rows.map(row => projectMeasurement(row, actor));
}
