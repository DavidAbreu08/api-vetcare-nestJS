import { EntityManager } from "typeorm";
import { applicationError } from "../core/exceptions/application-error";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { clinicDateParam, uuidParam } from "../core/persistence/sql-params";
import { CLINIC_POLICY, clinicDateTime, clinicParts, dateKey, minutes, policyError } from "../reservation/reservation-policy";
import { EmployeeScheduleEntity } from "./entities/employee-schedule.entity";
import { EmployeeScheduleMessages } from "./employee-schedule.messages";

/** A weekly period as stored (clinic local "HH:mm", calendar dates YYYY-MM-DD). */
export type SchedulePeriod = Pick<EmployeeScheduleEntity, "dayOfWeek" | "startTime" | "endTime" | "validFrom" | "validUntil">;
/** A working interval of one clinic day, in minutes after local midnight. */
export type LocalPeriod = { start: number; end: number };
/** A working interval as UTC instants. */
export type InstantPeriod = { start: Date; end: Date };

/**
 * Local hour skipped (last Sunday of March) or repeated (last Sunday of October) in Europe/Lisbon: [01:00, 02:00).
 * Schedule times inside it are rejected so every period boundary maps to exactly one instant.
 */
export const DST_TRANSITION_WINDOW = Object.freeze({ start: 60, end: 120 });

/** Weekday of a clinic calendar date (0 = Sunday); independent of the server timezone. */
export function weekdayOf(date: string): number {
  return new Date(`${dateKey(date)}T00:00:00Z`).getUTCDay();
}

export function isValidOn(period: Pick<SchedulePeriod, "validFrom" | "validUntil">, date: string): boolean {
  return period.validFrom <= date && (!period.validUntil || period.validUntil >= date);
}

/** "HH:mm" of a minute count. */
export function localTime(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

/**
 * Working periods of an employee on a clinic date, intersected with CLINIC_POLICY (always the outer envelope: clinic
 * days and hours). `rows` are the employee's schedule rows (any weekday). When none of them is valid on the date the
 * employee has no registered schedule for it and works the clinic hours (CLINIC_POLICY default). When some row is
 * valid on the date, only the rows of that weekday count: none means the employee does not work that day.
 */
export function workingPeriods(rows: SchedulePeriod[], date: string): LocalPeriod[] {
  const key = dateKey(date);
  const weekday = weekdayOf(key);
  if (!CLINIC_POLICY.days.includes(weekday)) return [];
  const clinic = { start: minutes(CLINIC_POLICY.start), end: minutes(CLINIC_POLICY.end) };
  const valid = rows.filter(row => isValidOn(row, key));
  const periods = valid.length === 0
    ? [clinic]
    : valid.filter(row => row.dayOfWeek === weekday).map(row => ({ start: minutes(row.startTime), end: minutes(row.endTime) }));
  return periods
    .map(period => ({ start: Math.max(period.start, clinic.start), end: Math.min(period.end, clinic.end) }))
    .filter(period => period.end > period.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * The working periods of a date as UTC instants (clinicDateTime handles the Lisbon offset of that date). The CLINIC_POLICY
 * envelope keeps every boundary outside the DST transition hour, so the conversion is never ambiguous.
 */
export function workingInstants(rows: SchedulePeriod[], date: string): InstantPeriod[] {
  return workingPeriods(rows, date).map(period => ({
    start: clinicDateTime(date, localTime(period.start)),
    end: clinicDateTime(date, localTime(period.end)),
  }));
}

/** True when [startAt, endAt) lies inside a single working period of the employee on the clinic date of startAt. */
export function fitsSchedule(rows: SchedulePeriod[], startAt: Date, endAt: Date): boolean {
  const date = clinicParts(startAt).date;
  if (clinicParts(endAt).date !== date) return false;
  return workingInstants(rows, date).some(period => period.start.getTime() <= startAt.getTime() && endAt.getTime() <= period.end.getTime());
}

/** 409 CONFLICT "outside the employee schedule" unless the interval fits one working period. */
export function assertFitsSchedule(rows: SchedulePeriod[], startAt: Date, endAt: Date): void {
  if (!fitsSchedule(rows, startAt, endAt)) {
    throw applicationError(ErrorMetadata.CONFLICT, EmployeeScheduleMessages.OUTSIDE_SCHEDULE, undefined, { code: "OUTSIDE_EMPLOYEE_SCHEDULE" });
  }
}

const inDstWindow = (value: number) => value >= DST_TRANSITION_WINDOW.start && value < DST_TRANSITION_WINDOW.end;
const validityIntersects = (a: SchedulePeriod, b: SchedulePeriod) =>
  a.validFrom <= (b.validUntil ?? "9999-12-31") && b.validFrom <= (a.validUntil ?? "9999-12-31");

/**
 * Validates a full schedule (400): HH:mm times, end after start (same day), no time inside the DST transition hour,
 * valid calendar dates with validUntil >= validFrom, and no two periods of the same weekday with intersecting validity
 * overlapping in time (touching periods, a.end = b.start, are allowed).
 */
export function validateSchedule(periods: SchedulePeriod[]): void {
  for (const period of periods) {
    const start = minutes(period.startTime);
    const end = minutes(period.endTime);
    if (end <= start) policyError("INVALID_SCHEDULE_PERIOD", EmployeeScheduleMessages.INVALID_PERIOD);
    if (inDstWindow(start) || inDstWindow(end)) policyError("SCHEDULE_DST_WINDOW", EmployeeScheduleMessages.DST_WINDOW);
    dateKey(period.validFrom);
    if (period.validUntil) {
      dateKey(period.validUntil);
      if (period.validUntil < period.validFrom) policyError("INVALID_SCHEDULE_VALIDITY", EmployeeScheduleMessages.INVALID_VALIDITY);
    }
  }
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const [a, b] = [periods[i], periods[j]];
      if (a.dayOfWeek === b.dayOfWeek && validityIntersects(a, b)
          && minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime)) {
        policyError("SCHEDULE_OVERLAP", EmployeeScheduleMessages.overlapping(a.dayOfWeek));
      }
    }
  }
}

/**
 * Schedule rows of the given employees that are valid on a clinic date (any weekday: workingPeriods needs them to tell
 * "no schedule" from "does not work that day"). Plain read: reservation flows call it under the employee schedule applock,
 * which PUT /employees/:id/schedules (the only writer) also holds; availability reads are indicative.
 */
export function findSchedulesValidOn(manager: EntityManager, employeeIds: string[], date: string): Promise<EmployeeScheduleEntity[]> {
  if (!employeeIds.length) return Promise.resolve([]);
  return manager.createQueryBuilder(EmployeeScheduleEntity, "schedule")
    .where("schedule.employeeId IN (:...employeeIds)", { employeeIds: employeeIds.map(uuidParam) })
    .andWhere("schedule.validFrom <= :date", { date: clinicDateParam(date) })
    .andWhere("(schedule.validUntil IS NULL OR schedule.validUntil >= :date)")
    .orderBy("schedule.employeeId", "ASC").addOrderBy("schedule.dayOfWeek", "ASC").addOrderBy("schedule.startTime", "ASC")
    .getMany();
}
