import { ReservationPolicyMessages } from "./reservation-policy.messages";
import { applicationError } from "../core/exceptions/application-error";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { ReservationStatus as Status } from '../core/enums/reservation-status.enum';

/** Clinic calendar. The buffer between reservations and the no-show tolerance live in vc_system_settings. */
export const CLINIC_POLICY = Object.freeze({
  start: '07:00', end: '20:00', days: [1, 2, 3, 4, 5],
  slotDurationMinutes: 30, timeZone: 'Europe/Lisbon',
});
export function policyError(code: string, message: string): never {
  throw applicationError(ErrorMetadata.INVALID_VALUE, message, undefined, { code });
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

const clinicFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_POLICY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Clinic calendar date (YYYY-MM-DD), local time (HH:mm) and weekday of a UTC instant. */
export function clinicParts(instant: Date): { date: string; time: string; weekday: number } {
  const parts = Object.fromEntries(clinicFormatter.formatToParts(instant).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: WEEKDAYS[parts.weekday] };
}

/**
 * A reservation interval (UTC instants): end after start, start in the future (unless allowPast), within one
 * clinic business day and business hours of the clinic timezone.
 */
export function validateReservationWindow(startAt: Date, endAt: Date, now = new Date(), allowPast = false): void {
  if (!Number.isFinite(startAt?.getTime()) || !Number.isFinite(endAt?.getTime())) policyError('INVALID_DATE', ReservationPolicyMessages.INVALID_INSTANT);
  if (endAt.getTime() <= startAt.getTime()) policyError('INVALID_INTERVAL', ReservationPolicyMessages.INVALID_INTERVAL);
  if (!allowPast && startAt.getTime() <= now.getTime()) policyError('PAST_RESERVATION', ReservationPolicyMessages.PAST_RESERVATION);
  const start = clinicParts(startAt);
  const end = clinicParts(endAt);
  if (start.date !== end.date || !CLINIC_POLICY.days.includes(start.weekday) ||
      minutes(start.time) < minutes(CLINIC_POLICY.start) || minutes(end.time) > minutes(CLINIC_POLICY.end)) {
    policyError('OUTSIDE_BUSINESS_HOURS', ReservationPolicyMessages.OUTSIDE_BUSINESS_HOURS);
  }
}

const TRANSITIONS: Record<Status, Status[]> = {
  [Status.PENDING]: [Status.CONFIRMED, Status.CANCELLED],
  [Status.CONFIRMED]: [Status.COMPLETED, Status.CANCELLED, Status.NO_SHOW],
  [Status.COMPLETED]: [], [Status.CANCELLED]: [], [Status.NO_SHOW]: [],
};

/** State machine of reservations; an invalid change is a 409 conflict with the current state. */
export function assertTransition(from: Status, to: Status): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw applicationError(ErrorMetadata.CONFLICT, ReservationPolicyMessages.invalidTransition(from, to), undefined, { code: 'INVALID_TRANSITION' });
  }
}
