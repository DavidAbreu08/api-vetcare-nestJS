import { InstantPeriod } from "../employee-schedules/employee-schedule-policy";
import { CLINIC_POLICY, clinicDateTime, clinicParts } from "../reservation/reservation-policy";
import { weekdayOf } from "../employee-schedules/employee-schedule-policy";

export type Slot = { startAt: string; endAt: string; localStart: string };

/** Clinic hours of a date as UTC instants; null on days the clinic is closed (CLINIC_POLICY.days). */
export function clinicDayWindow(date: string): InstantPeriod | null {
  if (!CLINIC_POLICY.days.includes(weekdayOf(date))) return null;
  return { start: clinicDateTime(date, CLINIC_POLICY.start), end: clinicDateTime(date, CLINIC_POLICY.end) };
}

const intersects = (a: InstantPeriod, startMs: number, endMs: number) => a.start.getTime() < endMs && a.end.getTime() > startMs;

/** Parts of the periods not covered by any busy interval (busy intervals may overlap each other). */
export function subtractIntervals(periods: InstantPeriod[], busy: InstantPeriod[]): InstantPeriod[] {
  let free = periods.map(period => ({ start: period.start.getTime(), end: period.end.getTime() }));
  for (const block of busy) {
    const [bs, be] = [block.start.getTime(), block.end.getTime()];
    free = free.flatMap(part => {
      if (be <= part.start || bs >= part.end) return [part];
      return [{ start: part.start, end: Math.min(bs, part.end) }, { start: Math.max(be, part.start), end: part.end }].filter(piece => piece.end > piece.start);
    });
  }
  return free.map(part => ({ start: new Date(part.start), end: new Date(part.end) }));
}

/**
 * Candidate slots of one employee: starts every `stepMinutes` from the start of each working period, lasting
 * `durationMinutes`, entirely inside that period, starting after `now`, not intersecting any block and not overlapping a
 * CONFIRMED reservation widened by `bufferMinutes` on both sides (the same rules the confirmation enforces under locks:
 * existing.start < end + buffer AND existing.end > start - buffer). PENDING reservations are not passed in: they do not
 * occupy time. Working periods never contain a DST transition (clinic hours envelope), so UTC steps equal local steps.
 */
export function generateSlots(
  periods: InstantPeriod[], blocks: InstantPeriod[], confirmed: InstantPeriod[],
  options: { durationMinutes: number; stepMinutes: number; bufferMinutes: number; now: Date },
): Slot[] {
  const duration = options.durationMinutes * 60_000;
  const step = options.stepMinutes * 60_000;
  const buffer = options.bufferMinutes * 60_000;
  const slots: Slot[] = [];
  for (const period of periods) {
    for (let start = period.start.getTime(); start + duration <= period.end.getTime(); start += step) {
      const end = start + duration;
      if (start <= options.now.getTime()) continue;
      if (blocks.some(block => intersects(block, start, end))) continue;
      if (confirmed.some(reservation => intersects(reservation, start - buffer, end + buffer))) continue;
      slots.push({ startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), localStart: clinicParts(new Date(start)).time });
    }
  }
  return slots;
}
