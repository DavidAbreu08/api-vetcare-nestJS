import { ReservationPolicyMessages } from "./reservation-policy.messages";
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReservationStatus as Status } from '../core/enums/reservation-status.enum';

export const CLINIC_POLICY = Object.freeze({
  start: '07:00', end: '20:00', days: [1, 2, 3, 4, 5],
  slotDurationMinutes: 30, bufferMinutes: 15, timeZone: 'Europe/Lisbon',
});
export function policyError(code: string, message: string): never {
  throw new BadRequestException({ statusCode: 400, code, message });
}
export function dateKey(value: Date | string): string {
  if (value instanceof Date && Number.isNaN(value.getTime())) policyError('INVALID_DATE', ReservationPolicyMessages.INVALID_DATE);
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key ?? '') || Number.isNaN(Date.parse(key + 'T00:00:00Z')) ||
      new Date(key + 'T00:00:00Z').toISOString().slice(0, 10) !== key) {
    policyError('INVALID_DATE', ReservationPolicyMessages.INVALID_DATE);
  }
  return key;
}
export function minutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '')) {
    policyError('INVALID_TIME', ReservationPolicyMessages.INVALID_TIME);
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutes(aStart) < minutes(bEnd) && minutes(aEnd) > minutes(bStart);
}
// Date-only values are clinic calendar dates; the server/browser timezone is irrelevant.
export function clinicDateTime(date: Date | string, time: string): Date {
  const key = dateKey(date);
  minutes(time);
  const wall = Date.parse(`${key}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_POLICY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const correction = wall - shown;
    if (!correction) {
      if (formatter.format(new Date(instant - 3600000)) === formatter.format(new Date(instant)) ||
          formatter.format(new Date(instant + 3600000)) === formatter.format(new Date(instant))) {
        policyError('INVALID_TIME', ReservationPolicyMessages.AMBIGUOUS_TIME);
      }
      return new Date(instant);
    }
    instant += correction;
  }
  policyError('INVALID_TIME', ReservationPolicyMessages.NONEXISTENT_TIME);
}
export function validateInterval(date: Date | string, start: string, end: string, allowPast = false): void {
  const key = dateKey(date);
  if (minutes(end) <= minutes(start)) policyError('INVALID_INTERVAL', ReservationPolicyMessages.INVALID_INTERVAL);
  const day = new Date(key + 'T00:00:00Z').getUTCDay();
  if (!CLINIC_POLICY.days.includes(day) || minutes(start) < minutes(CLINIC_POLICY.start) || minutes(end) > minutes(CLINIC_POLICY.end)) {
    policyError('OUTSIDE_BUSINESS_HOURS', ReservationPolicyMessages.OUTSIDE_BUSINESS_HOURS);
  }
  if (!allowPast && clinicDateTime(date, start).getTime() < Date.now()) {
    policyError('PAST_RESERVATION', ReservationPolicyMessages.PAST_RESERVATION);
  }
}
export function assertTransition(from: Status, to: Status): void {
  const allowed: Record<Status, Status[]> = {
    pending: [Status.CONFIRMED, Status.RESCHEDULED, Status.CANCELLED],
    confirmed: [Status.RESCHEDULED, Status.CANCELLED, Status.COMPLETED],
    rescheduled: [Status.CONFIRMED, Status.RESCHEDULED, Status.CANCELLED],
    cancelled: [], completed: [],
  };
  if (!allowed[from]?.includes(to)) {
    throw new ConflictException({ statusCode: 409, code: 'INVALID_TRANSITION', message: ReservationPolicyMessages.invalidTransition(from, to) });
  }
}
