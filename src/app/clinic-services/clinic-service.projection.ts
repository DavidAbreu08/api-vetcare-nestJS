import { EntityManager } from "typeorm";
import { ClinicServiceEntity } from "./entities/clinic-service.entity";
import { EmployeeServiceEntity } from "./entities/employee-service.entity";

export type ClinicServiceView = {
  id: string; code: string; name: string; description: string | null; durationMinutes: number; isActive: boolean; createdAt: Date; updatedAt: Date;
};
export type ClinicServiceSummary = { id: string; code: string; name: string; durationMinutes: number };

export function serializeClinicService(row: ClinicServiceEntity): ClinicServiceView {
  return {
    id: row.id, code: row.code, name: row.name, description: row.description ?? null, durationMinutes: row.durationMinutes,
    isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

/** Service embedded in a reservation response: { id, code, name, durationMinutes }. */
export function clinicServiceSummary(row: ClinicServiceEntity): ClinicServiceSummary {
  return { id: row.id, code: row.code, name: row.name, durationMinutes: row.durationMinutes };
}

/**
 * True when the employee profile holds the service qualification (vc_employee_services). Plain read: callers hold the
 * employee profile lock (UPDLOCK), which PUT /employees/:id/services also takes before changing qualifications, so the
 * check and the reservation write serialize with any qualification change.
 */
export async function isQualifiedForService(manager: EntityManager, employeeId: string, serviceId: string): Promise<boolean> {
  return (await manager.count(EmployeeServiceEntity, { where: { employeeId, serviceId } })) > 0;
}
