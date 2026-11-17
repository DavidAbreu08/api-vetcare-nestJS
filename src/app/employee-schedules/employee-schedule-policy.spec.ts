import { HttpException, HttpStatus } from "@nestjs/common";
import { InstantPeriod, SchedulePeriod, assertFitsSchedule, fitsSchedule, validateSchedule, workingInstants, workingPeriods } from "./employee-schedule-policy";

// Calendar facts used below (Europe/Lisbon): 2030-01-07 is a Monday in winter (UTC+0), 2030-07-08 a Monday in summer (UTC+1).
// 2026-03-29 and 2026-10-25 are the DST change Sundays (clinic closed); Fri 2026-03-27 and Mon 2026-03-30 sit either side of the first one.
const MON = "2030-01-07";
const SUMMER_MON = "2030-07-08";

const period = (overrides: Partial<SchedulePeriod> = {}): SchedulePeriod => ({
  dayOfWeek: 1, startTime: "09:00", endTime: "13:00", validFrom: "2030-01-01", validUntil: null, ...overrides,
});
const at = (value: string) => new Date(value);
const iso = (periods: InstantPeriod[]) => periods.map(p => ({ start: p.start.toISOString(), end: p.end.toISOString() }));

/** The error thrown by fn; fails the test when fn does not throw. */
function thrownBy(fn: () => unknown): HttpException {
  try {
    fn();
  } catch (error) {
    return error as HttpException;
  }
  throw new Error("expected the call to throw");
}

/** Asserts the HTTP status and the domain code carried in the error response. */
function expectRejection(fn: () => unknown, status: HttpStatus, code: string): void {
  const error = thrownBy(fn);
  expect(error).toBeInstanceOf(HttpException);
  expect(error.getStatus()).toBe(status);
  expect(error.getResponse()).toMatchObject({ code });
}

describe("employee schedule policy", () => {
  describe("validateSchedule", () => {
    it("accepts a valid period", () => {
      expect(() => validateSchedule([period()])).not.toThrow();
    });

    it("accepts touching periods of the same weekday and overlapping periods of other weekdays", () => {
      expect(() => validateSchedule([
        period({ startTime: "09:00", endTime: "12:00" }),
        period({ startTime: "12:00", endTime: "13:00" }),
        period({ dayOfWeek: 2, startTime: "09:00", endTime: "13:00" }),
      ])).not.toThrow();
    });

    it("accepts same-weekday periods whose validity does not intersect", () => {
      expect(() => validateSchedule([
        period({ validFrom: "2030-01-01", validUntil: "2030-06-30" }),
        period({ validFrom: "2030-07-01", validUntil: null }),
      ])).not.toThrow();
    });

    it("accepts a single-day validity (validUntil equal to validFrom)", () => {
      expect(() => validateSchedule([period({ validFrom: MON, validUntil: MON })])).not.toThrow();
    });

    it("rejects a period whose end is not after its start (400)", () => {
      expectRejection(() => validateSchedule([period({ startTime: "13:00", endTime: "09:00" })]), HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE_PERIOD");
      expectRejection(() => validateSchedule([period({ startTime: "09:00", endTime: "09:00" })]), HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE_PERIOD");
    });

    it("rejects overlapping periods of the same weekday with intersecting validity (400)", () => {
      expectRejection(() => validateSchedule([
        period({ startTime: "09:00", endTime: "13:00" }),
        period({ startTime: "12:00", endTime: "15:00" }),
      ]), HttpStatus.BAD_REQUEST, "SCHEDULE_OVERLAP");
    });

    it("treats validUntil and validFrom as inclusive when deciding that validity intersects", () => {
      const first = period({ startTime: "09:00", endTime: "13:00", validUntil: "2030-06-30" });
      expectRejection(() => validateSchedule([first, period({ startTime: "12:00", endTime: "15:00", validFrom: "2030-06-30" })]),
        HttpStatus.BAD_REQUEST, "SCHEDULE_OVERLAP");
      expect(() => validateSchedule([first, period({ startTime: "12:00", endTime: "15:00", validFrom: "2030-07-01" })])).not.toThrow();
    });

    it("rejects validUntil before validFrom (400)", () => {
      expectRejection(() => validateSchedule([period({ validFrom: "2030-06-30", validUntil: "2030-01-01" })]),
        HttpStatus.BAD_REQUEST, "INVALID_SCHEDULE_VALIDITY");
    });

    it("rejects times inside the DST transition hour 01:00-01:59 (400) and accepts 02:00", () => {
      expectRejection(() => validateSchedule([period({ startTime: "01:00", endTime: "05:00" })]), HttpStatus.BAD_REQUEST, "SCHEDULE_DST_WINDOW");
      expectRejection(() => validateSchedule([period({ startTime: "00:30", endTime: "01:30" })]), HttpStatus.BAD_REQUEST, "SCHEDULE_DST_WINDOW");
      expect(() => validateSchedule([period({ startTime: "02:00", endTime: "05:00" })])).not.toThrow();
    });

    it("rejects malformed times and invalid calendar dates (400)", () => {
      expectRejection(() => validateSchedule([period({ startTime: "9:00" })]), HttpStatus.BAD_REQUEST, "INVALID_TIME");
      expectRejection(() => validateSchedule([period({ validFrom: "2030-02-30" })]), HttpStatus.BAD_REQUEST, "INVALID_DATE");
    });
  });

  describe("workingPeriods", () => {
    it("uses the clinic hours when no schedule row is valid on the date", () => {
      expect(workingPeriods([], MON)).toEqual([{ start: 420, end: 1200 }]); // 07:00-20:00
      expect(workingPeriods([period({ validFrom: "2029-01-01", validUntil: "2029-12-31" })], MON)).toEqual([{ start: 420, end: 1200 }]);
    });

    it("uses only the rows of the weekday once some row is valid; none for that weekday means no work that day", () => {
      const tuesdayOnly = [period({ dayOfWeek: 2, startTime: "09:00", endTime: "13:00" })];
      expect(workingPeriods(tuesdayOnly, MON)).toEqual([]);
      expect(workingPeriods(tuesdayOnly, "2030-01-08")).toEqual([{ start: 540, end: 780 }]);
    });

    it("clips periods to the clinic envelope and drops the ones entirely outside it", () => {
      expect(workingPeriods([period({ startTime: "06:00", endTime: "22:00" })], MON)).toEqual([{ start: 420, end: 1200 }]);
      expect(workingPeriods([period({ startTime: "19:00", endTime: "22:00" })], MON)).toEqual([{ start: 1140, end: 1200 }]);
      expect(workingPeriods([period({ startTime: "21:00", endTime: "22:00" })], MON)).toEqual([]);
    });

    it("returns the periods of the day sorted by start", () => {
      expect(workingPeriods([
        period({ startTime: "13:00", endTime: "15:00" }),
        period({ startTime: "09:00", endTime: "11:00" }),
      ], MON)).toEqual([{ start: 540, end: 660 }, { start: 780, end: 900 }]);
    });

    it("never works on Saturday or Sunday, even with a valid row for that day", () => {
      expect(workingPeriods([], "2030-01-05")).toEqual([]); // Saturday
      expect(workingPeriods([period({ dayOfWeek: 6, startTime: "09:00", endTime: "13:00" })], "2030-01-12")).toEqual([]); // Saturday
      expect(workingPeriods([], "2030-01-06")).toEqual([]); // Sunday
    });
  });

  describe("workingInstants", () => {
    it("maps the clinic hours to UTC with the Lisbon offset of the date (winter and summer)", () => {
      expect(iso(workingInstants([], MON))).toEqual([{ start: "2030-01-07T07:00:00.000Z", end: "2030-01-07T20:00:00.000Z" }]);
      expect(iso(workingInstants([], SUMMER_MON))).toEqual([{ start: "2030-07-08T06:00:00.000Z", end: "2030-07-08T19:00:00.000Z" }]);
    });

    it("maps an employee period to UTC instants with the Lisbon offset of the date", () => {
      expect(iso(workingInstants([period()], SUMMER_MON))).toEqual([{ start: "2030-07-08T08:00:00.000Z", end: "2030-07-08T12:00:00.000Z" }]);
    });

    it("keeps the Lisbon wall-clock hours across the DST change (Friday before, Monday after)", () => {
      expect(iso(workingInstants([], "2026-03-27"))).toEqual([{ start: "2026-03-27T07:00:00.000Z", end: "2026-03-27T20:00:00.000Z" }]);
      expect(iso(workingInstants([], "2026-03-30"))).toEqual([{ start: "2026-03-30T06:00:00.000Z", end: "2026-03-30T19:00:00.000Z" }]);
      expect(iso(workingInstants([], "2026-10-23"))).toEqual([{ start: "2026-10-23T06:00:00.000Z", end: "2026-10-23T19:00:00.000Z" }]);
      expect(iso(workingInstants([], "2026-10-26"))).toEqual([{ start: "2026-10-26T07:00:00.000Z", end: "2026-10-26T20:00:00.000Z" }]);
    });

    it("returns no instants on the DST change Sunday (the clinic is closed)", () => {
      expect(workingInstants([], "2026-03-29")).toEqual([]);
      expect(workingInstants([], "2026-10-25")).toEqual([]);
    });
  });

  describe("fitsSchedule and assertFitsSchedule", () => {
    // Monday 09:00-13:00 Lisbon, open-ended (winter, so Lisbon = UTC here).
    const rows = [period()];

    it("accepts an interval inside a working period, including its exact boundaries", () => {
      expect(fitsSchedule(rows, at("2030-01-07T09:00:00Z"), at("2030-01-07T09:30:00Z"))).toBe(true);
      expect(fitsSchedule(rows, at("2030-01-07T12:30:00Z"), at("2030-01-07T13:00:00Z"))).toBe(true);
    });

    it("rejects an interval that starts before or ends after the working period", () => {
      expect(fitsSchedule(rows, at("2030-01-07T08:30:00Z"), at("2030-01-07T09:30:00Z"))).toBe(false);
      expect(fitsSchedule(rows, at("2030-01-07T12:30:00Z"), at("2030-01-07T13:30:00Z"))).toBe(false);
    });

    it("throws 409 OUTSIDE_EMPLOYEE_SCHEDULE from assertFitsSchedule when the interval does not fit", () => {
      expectRejection(() => assertFitsSchedule(rows, at("2030-01-07T12:30:00Z"), at("2030-01-07T13:30:00Z")),
        HttpStatus.CONFLICT, "OUTSIDE_EMPLOYEE_SCHEDULE");
      expect(() => assertFitsSchedule(rows, at("2030-01-07T09:00:00Z"), at("2030-01-07T09:30:00Z"))).not.toThrow();
    });

    it("requires the interval to lie inside a single working period, not across two touching periods", () => {
      const touching = [period({ startTime: "09:00", endTime: "12:00" }), period({ startTime: "12:00", endTime: "13:00" })];
      expect(fitsSchedule(touching, at("2030-01-07T11:30:00Z"), at("2030-01-07T12:30:00Z"))).toBe(false);
    });

    it("rejects an interval that ends on another clinic day", () => {
      expect(fitsSchedule(rows, at("2030-01-07T12:50:00Z"), at("2030-01-08T09:10:00Z"))).toBe(false);
    });

    it("applies the clinic hours when no schedule row is valid on the date", () => {
      const expired = [period({ validFrom: "2029-01-01", validUntil: "2029-12-31" })];
      expect(fitsSchedule(expired, at("2030-01-07T08:00:00Z"), at("2030-01-07T08:30:00Z"))).toBe(true);
      expect(fitsSchedule([], at("2030-01-07T06:30:00Z"), at("2030-01-07T07:00:00Z"))).toBe(false);
      expect(fitsSchedule([], at("2030-01-07T19:30:00Z"), at("2030-01-07T20:00:00Z"))).toBe(true);
      expect(fitsSchedule([], at("2030-01-07T19:30:00Z"), at("2030-01-07T20:30:00Z"))).toBe(false);
    });

    it("does not fit on a day the employee does not work (409 from assertFitsSchedule)", () => {
      const tuesdayOnly = [period({ dayOfWeek: 2 })];
      expect(fitsSchedule(tuesdayOnly, at("2030-01-07T09:00:00Z"), at("2030-01-07T09:30:00Z"))).toBe(false);
      expectRejection(() => assertFitsSchedule(tuesdayOnly, at("2030-01-07T09:00:00Z"), at("2030-01-07T09:30:00Z")),
        HttpStatus.CONFLICT, "OUTSIDE_EMPLOYEE_SCHEDULE");
    });

    it("compares against Lisbon wall-clock times across the DST change", () => {
      // Monday 2026-03-30 is UTC+1: 07:00 Lisbon is 06:00Z, so 06:30 Lisbon (05:30Z) is outside the clinic hours.
      expect(fitsSchedule([], at("2026-03-30T06:00:00Z"), at("2026-03-30T06:30:00Z"))).toBe(true);
      expect(fitsSchedule([], at("2026-03-30T05:30:00Z"), at("2026-03-30T06:00:00Z"))).toBe(false);
      // Employee row 09:00-13:00 valid since 2026: 09:00 Lisbon is 08:00Z on that Monday.
      const rows2026 = [period({ validFrom: "2026-01-01" })];
      expect(fitsSchedule(rows2026, at("2026-03-30T08:00:00Z"), at("2026-03-30T08:30:00Z"))).toBe(true);
      expect(fitsSchedule(rows2026, at("2026-03-30T07:30:00Z"), at("2026-03-30T08:00:00Z"))).toBe(false);
    });

    it("does not fit on the DST change Sunday, when the clinic is closed", () => {
      expect(fitsSchedule([], at("2026-03-29T08:00:00Z"), at("2026-03-29T08:30:00Z"))).toBe(false);
    });
  });
});
