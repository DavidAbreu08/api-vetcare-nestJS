import { fromDbUtc, parseInstant, toDbUtc } from "./utc-datetime";

describe("UTC datetime helpers", () => {
  it("round-trips instants through the driver's local wall clock", () => {
    const instant = new Date("2030-01-07T10:15:30.123Z");
    const stored = toDbUtc(instant);
    expect([stored.getHours(), stored.getMinutes(), stored.getMilliseconds()]).toEqual([10, 15, 123]);
    expect(fromDbUtc(stored).toISOString()).toBe(instant.toISOString());
  });

  it("parses ISO instants with Z or an offset and rejects values without offset", () => {
    expect(parseInstant("2030-01-07T10:00:00Z")?.toISOString()).toBe("2030-01-07T10:00:00.000Z");
    expect(parseInstant("2030-01-07T11:00:00+01:00")?.toISOString()).toBe("2030-01-07T10:00:00.000Z");
    for (const value of ["2030-01-07T10:00:00", "2030-01-07", "2030-13-07T10:00:00Z", 1234, null]) {
      expect(parseInstant(value)).toBeNull();
    }
  });
});
