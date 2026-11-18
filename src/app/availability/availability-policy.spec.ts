import { InstantPeriod } from "../employee-schedules/employee-schedule-policy";
import { Slot, clinicDayWindow, generateSlots } from "./availability-policy";

// Monday 2030-01-07, winter (Lisbon = UTC+0). Calendar facts: 2030-01-12 is a Saturday, 2030-01-13 a Sunday,
// 2030-07-08 a Monday in summer (UTC+1). 2026-03-29 is the DST change Sunday (clinic closed); 2026-03-30 the Monday after it.
const interval = (start: string, end: string): InstantPeriod => ({ start: new Date(start), end: new Date(end) });
const localStarts = (slots: Slot[]) => slots.map(slot => slot.localStart);

const MORNING = interval("2030-01-07T09:00:00Z", "2030-01-07T12:00:00Z"); // 09:00-12:00 Lisbon
const NOW = new Date("2030-01-07T00:00:00Z"); // before every slot of the day
const BASE = { durationMinutes: 30, stepMinutes: 30, bufferMinutes: 0, now: NOW };

describe("availability policy", () => {
  describe("clinicDayWindow", () => {
    it("returns the clinic hours of a working day as UTC instants, with the Lisbon offset of the date", () => {
      expect(clinicDayWindow("2030-01-07")).toEqual({ start: new Date("2030-01-07T07:00:00Z"), end: new Date("2030-01-07T20:00:00Z") });
      expect(clinicDayWindow("2030-07-08")).toEqual({ start: new Date("2030-07-08T06:00:00Z"), end: new Date("2030-07-08T19:00:00Z") });
    });

    it("returns null on a closed day (Saturday and Sunday)", () => {
      expect(clinicDayWindow("2030-01-12")).toBeNull();
      expect(clinicDayWindow("2030-01-13")).toBeNull();
    });

    it("follows the Lisbon offset on the working days either side of the DST change", () => {
      expect(clinicDayWindow("2026-03-27")).toEqual({ start: new Date("2026-03-27T07:00:00Z"), end: new Date("2026-03-27T20:00:00Z") });
      expect(clinicDayWindow("2026-03-30")).toEqual({ start: new Date("2026-03-30T06:00:00Z"), end: new Date("2026-03-30T19:00:00Z") });
    });

    it("is closed on the DST change Sunday", () => {
      expect(clinicDayWindow("2026-03-29")).toBeNull();
    });
  });

  describe("generateSlots", () => {
    it("steps every stepMinutes from the start of the period and keeps only slots that end inside it", () => {
      // 09:00-12:00, 30-minute slots every 30 minutes: six slots, the last one ends exactly at 12:00.
      expect(localStarts(generateSlots([MORNING], [], [], BASE))).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
    });

    it("spaces the starts by stepMinutes, independently of durationMinutes", () => {
      // 30-minute slots every 15 minutes in 09:00-10:00: 09:45 would end at 10:15, after the period.
      const hour = interval("2030-01-07T09:00:00Z", "2030-01-07T10:00:00Z");
      expect(localStarts(generateSlots([hour], [], [], { ...BASE, stepMinutes: 15 }))).toEqual(["09:00", "09:15", "09:30"]);
    });

    it("lasts durationMinutes and omits a slot whose end would pass the period end", () => {
      const slots = generateSlots([interval("2030-01-07T09:00:00Z", "2030-01-07T11:00:00Z")], [], [], { ...BASE, durationMinutes: 60 });
      expect(slots.map(slot => [slot.localStart, slot.endAt])).toEqual([
        ["09:00", "2030-01-07T10:00:00.000Z"],
        ["09:30", "2030-01-07T10:30:00.000Z"],
        ["10:00", "2030-01-07T11:00:00.000Z"],
      ]);
    });

    it("returns no slot when the period is shorter than the duration", () => {
      expect(generateSlots([interval("2030-01-07T09:00:00Z", "2030-01-07T09:20:00Z")], [], [], BASE)).toEqual([]);
    });

    it("aligns the steps on each period start, not on the clock hour", () => {
      expect(localStarts(generateSlots([interval("2030-01-07T09:10:00Z", "2030-01-07T10:10:00Z")], [], [], BASE))).toEqual(["09:10", "09:40"]);
    });

    it("creates no slot across the gap between two periods of the day", () => {
      const slots = generateSlots([
        interval("2030-01-07T09:00:00Z", "2030-01-07T10:00:00Z"),
        interval("2030-01-07T13:00:00Z", "2030-01-07T14:00:00Z"),
      ], [], [], BASE);
      expect(localStarts(slots)).toEqual(["09:00", "09:30", "13:00", "13:30"]);
    });

    it("produces adjacent slots that touch but never overlap", () => {
      const slots = generateSlots([MORNING], [], [], BASE);
      for (let i = 1; i < slots.length; i++) {
        expect(new Date(slots[i - 1].endAt).getTime()).toBeLessThanOrEqual(new Date(slots[i].startAt).getTime());
      }
      expect(slots[0].endAt).toBe(slots[1].startAt);
      expect(slots[slots.length - 1].endAt).toBe("2030-01-07T12:00:00.000Z");
    });

    it("excludes slots that overlap a block", () => {
      // Block 09:15-10:15 overlaps the 09:00, 09:30 and 10:00 slots; the 10:30 slot starts after it.
      const blocks = [interval("2030-01-07T09:15:00Z", "2030-01-07T10:15:00Z")];
      expect(localStarts(generateSlots([MORNING], blocks, [], BASE))).toEqual(["10:30", "11:00", "11:30"]);
    });

    it("keeps slots that only touch a block (adjacent intervals do not overlap)", () => {
      // Block 09:30-10:00 removes only the 09:30 slot; 09:00 ends where the block starts, 10:00 starts where it ends.
      const blocks = [interval("2030-01-07T09:30:00Z", "2030-01-07T10:00:00Z")];
      expect(localStarts(generateSlots([MORNING], blocks, [], BASE))).toEqual(["09:00", "10:00", "10:30", "11:00", "11:30"]);
    });

    it("with no buffer, a CONFIRMED reservation only removes the slots it overlaps", () => {
      // Reservation 10:00-10:30: the 09:30 slot ends exactly when it starts, the 10:30 slot starts exactly when it ends.
      const confirmed = [interval("2030-01-07T10:00:00Z", "2030-01-07T10:30:00Z")];
      expect(localStarts(generateSlots([MORNING], [], confirmed, BASE))).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
    });

    it("widens a CONFIRMED reservation by the buffer on both sides", () => {
      // Reservation 10:00-10:30, buffer 15 min: a slot must end by 09:45 or start from 10:45.
      const confirmed = [interval("2030-01-07T10:00:00Z", "2030-01-07T10:30:00Z")];
      expect(localStarts(generateSlots([MORNING], [], confirmed, { ...BASE, bufferMinutes: 15 }))).toEqual(["09:00", "11:00", "11:30"]);
    });

    it("treats the buffer edge as exclusive (a slot ending exactly at the buffered start is kept)", () => {
      // Reservation 10:00-10:30, buffer 30 min: the 09:00 slot ends at 09:30 (buffered start 10:00) and the 11:00 slot
      // starts at 11:00 (buffered end 11:00); both touch the buffered limits and stay, the 09:30 and 10:30 slots do not.
      const confirmed = [interval("2030-01-07T10:00:00Z", "2030-01-07T10:30:00Z")];
      expect(localStarts(generateSlots([MORNING], [], confirmed, { ...BASE, bufferMinutes: 30 }))).toEqual(["09:00", "11:00", "11:30"]);
    });

    it("omits slots that start at or before now", () => {
      // now 10:15: the 09:00, 09:30 and 10:00 slots are in the past.
      expect(localStarts(generateSlots([MORNING], [], [], { ...BASE, now: new Date("2030-01-07T10:15:00Z") }))).toEqual(["10:30", "11:00", "11:30"]);
      // now 10:30 exactly: a slot starting at now is not after now.
      expect(localStarts(generateSlots([MORNING], [], [], { ...BASE, now: new Date("2030-01-07T10:30:00Z") }))).toEqual(["11:00", "11:30"]);
      // now after the period: nothing left.
      expect(generateSlots([MORNING], [], [], { ...BASE, now: new Date("2030-01-07T12:00:00Z") })).toEqual([]);
    });

    it("generates the full clinic day across the DST change with UTC instants and Lisbon labels", () => {
      // Monday 2026-03-30 is UTC+1: 07:00-20:00 Lisbon is 06:00Z-19:00Z, i.e. 26 slots of 30 minutes.
      const day = clinicDayWindow("2026-03-30") as InstantPeriod;
      const slots = generateSlots([day], [], [], { ...BASE, now: new Date("2026-03-29T00:00:00Z") });
      expect(slots).toHaveLength(26);
      expect(slots[0]).toEqual({ startAt: "2026-03-30T06:00:00.000Z", endAt: "2026-03-30T06:30:00.000Z", localStart: "07:00" });
      expect(slots[slots.length - 1]).toEqual({ startAt: "2026-03-30T18:30:00.000Z", endAt: "2026-03-30T19:00:00.000Z", localStart: "19:30" });
    });
  });
});
