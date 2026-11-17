import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { Actor, sameId } from "../core/authorization";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { ReservationStatus } from "../core/enums/reservation-status.enum";
import { applicationError } from "../core/exceptions/application-error";
import { PersistenceService } from "../core/persistence/persistence.service";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { EmployeeMessage } from "../employees/employees.messages";
import { acquireEmployeeScheduleLock } from "../reservation/employee-schedule-lock";
import { findOpenReservations, openReservationsConflict } from "../reservation/open-reservations";
import { ReplaceEmployeeSchedulesDto } from "./dto/employee-schedule.dto";
import { EmployeeScheduleEntity } from "./entities/employee-schedule.entity";
import { EmployeeScheduleMessages } from "./employee-schedule.messages";
import { fitsSchedule, SchedulePeriod, validateSchedule } from "./employee-schedule-policy";

export type EmployeeScheduleView = { id: string; dayOfWeek: number; startTime: string; endTime: string; validFrom: string; validUntil: string | null };

export function serializeSchedule(row: EmployeeScheduleEntity): EmployeeScheduleView {
  return { id: row.id, dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime, validFrom: row.validFrom, validUntil: row.validUntil ?? null };
}

const ORDER = { dayOfWeek: "ASC", startTime: "ASC", validFrom: "ASC", id: "ASC" } as const;

/**
 * Weekly schedules of employee profiles (vc_employee_schedules). Read by the employee itself or an administrator;
 * replaced as a whole by administrators (PUT /employees/:id/schedules). Without any schedule row valid on a date the
 * employee works the clinic hours (CLINIC_POLICY), which always remain the outer envelope.
 */
@Injectable()
export class EmployeeSchedulesBusinessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly persistence: PersistenceService,
  ) {}

  async list(employeeId: string, actor: Actor) {
    const manager = this.dataSource.manager;
    const employee = await this.persistence.execute(() => manager.findOne(EmployeeEntity, { where: { id: employeeId } }));
    if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, EmployeeMessage.NotFound);
    if (!actor.isAdmin && !sameId(employee.userId, actor.id)) throw applicationError(ErrorMetadata.FORBIDDEN, EmployeeMessage.Forbidden);
    return this.persistence.execute(() => this.rows(manager, employee.id)).then(rows => rows.map(serializeSchedule));
  }

  private rows(manager: EntityManager, employeeId: string) {
    return manager.find(EmployeeScheduleEntity, { where: { employeeId }, order: ORDER });
  }

  /**
   * Full replacement in one transaction. The new periods are validated first (400: end after start, DST hour, validity,
   * overlap). Then, in the reservation lock order: employee profile (UPDLOCK; 404) -> employee schedule applock
   * (Exclusive; the lock every reservation flow holds while it checks the schedule) -> read of the current rows and of
   * the employee's open reservations (plain reads) -> delete + insert. A CONFIRMED reservation not yet finished that fits
   * the current schedule but would not fit the new one makes the request fail with 409 IN_USE (count in the message);
   * nothing is cancelled. PENDING reservations are not checked here: confirmation checks them against the schedule.
   */
  async replace(employeeId: string, dto: ReplaceEmployeeSchedulesDto) {
    const periods: SchedulePeriod[] = dto.periods.map(period => ({
      dayOfWeek: period.dayOfWeek, startTime: period.startTime, endTime: period.endTime, validFrom: period.validFrom, validUntil: period.validUntil ?? null,
    }));
    validateSchedule(periods);
    const rows = await this.persistence.execute(() => this.dataSource.transaction(async manager => {
      const employee = await manager.findOne(EmployeeEntity, { where: { id: employeeId }, lock: { mode: "pessimistic_write" } });
      if (!employee) throw applicationError(ErrorMetadata.NOT_FOUND, EmployeeMessage.NotFound);
      await acquireEmployeeScheduleLock(manager, employee.id);
      const current = await this.rows(manager, employee.id);
      const confirmed = (await findOpenReservations(manager, { employeeId: employee.id }))
        .filter(reservation => reservation.status === ReservationStatus.CONFIRMED);
      const stranded = confirmed.filter(reservation =>
        fitsSchedule(current, reservation.startAt, reservation.endAt) && !fitsSchedule(periods, reservation.startAt, reservation.endAt));
      if (stranded.length) throw openReservationsConflict("SCHEDULE_STRANDS_CONFIRMED", EmployeeScheduleMessages.strandedReservations, stranded);
      await manager.delete(EmployeeScheduleEntity, { employeeId: employee.id });
      if (periods.length) await manager.insert(EmployeeScheduleEntity, periods.map(period => ({ ...period, employeeId: employee.id })));
      return this.rows(manager, employee.id);
    }));
    return rows.map(serializeSchedule);
  }
}
