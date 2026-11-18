import { ClinicalIntegrity1795780800000 } from "./migrations/1795780800000-ClinicalIntegrity";

const VISITS = "vc_clinical_visits";
const RESERVATIONS = "vc_reservations";
const VISIT_TRIGGER = "tr_vc_clinical_visits_reservation_integrity";
const RESERVATION_TRIGGER = "tr_vc_reservations_visit_integrity";
const TRIGGERS: Array<[trigger: string, table: string]> = [[VISIT_TRIGGER, VISITS], [RESERVATION_TRIGGER, RESERVATIONS]];
const UP_CODES = [51100, 51101, 51102, 51103, 51104, 51105, 51106, 51107, 51109];

/** Runs up() against a QueryRunner double and returns the SQL batches in order (never touches a database). */
async function run(options: { missingTables?: string[] } = {}) {
  const batches: string[] = [];
  const runner: any = {
    isTransactionActive: true,
    hasTable: jest.fn(async (name: string) => !(options.missingTables ?? []).includes(name)),
    query: jest.fn(async (sql: string) => { batches.push(sql.replace(/\s+/g, " ").trim()); }),
  };
  await new ClinicalIntegrity1795780800000().up(runner);
  return batches;
}

describe("Migration 1795780800000 ClinicalIntegrity (generated SQL)", () => {
  let batches: string[];
  const at = (pattern: string) => batches.findIndex(sql => sql.includes(pattern));
  const trigger = (name: string) => batches.findIndex(sql => sql.startsWith(`CREATE TRIGGER [dbo].[${name}]`));

  beforeAll(async () => { batches = await run(); });

  it("requires a transaction and both parent tables (created by ReservationsAndClinicalVisits)", async () => {
    await expect(new ClinicalIntegrity1795780800000().up({ isTransactionActive: false } as any)).rejects.toThrow(/transaction/);
    for (const table of [RESERVATIONS, VISITS]) {
      await expect(run({ missingTables: [`dbo.${table}`] })).rejects.toThrow(`Missing dbo.${table} (created by ReservationsAndClinicalVisits)`);
    }
  });

  it("runs the batches in the documented order: preconditions, data, visit trigger, reservation trigger, verification", () => {
    expect(batches).toHaveLength(5);
    expect(at("THROW 51100")).toBe(0);
    expect(at("THROW 51102")).toBe(1);
    expect(trigger(VISIT_TRIGGER)).toBe(2);
    expect(trigger(RESERVATION_TRIGGER)).toBe(3);
    expect(at("THROW 51109")).toBe(4);
  });

  it("checks preconditions under TABLOCKX/HOLDLOCK in batch 0, before any CREATE TRIGGER", () => {
    expect(at("THROW 51100")).toBe(0);
    expect(at("THROW 51101")).toBe(0);
    expect(batches[0]).toContain(`OBJECT_ID(N'dbo.${VISIT_TRIGGER}', N'TR') IS NOT NULL`);
    const reservationsLock = batches[0].indexOf("[dbo].[vc_reservations] WITH (TABLOCKX, HOLDLOCK)");
    const visitsLock = batches[0].indexOf("[dbo].[vc_clinical_visits] WITH (TABLOCKX, HOLDLOCK)");
    expect(reservationsLock).toBeGreaterThanOrEqual(0);
    expect(reservationsLock).toBeLessThan(visitsLock);
    expect(at("CREATE TRIGGER")).toBeGreaterThan(0);
  });

  it("checks existing data (51102, 51103) in one batch after the preconditions and before the triggers", () => {
    const data = at("THROW 51102");
    expect(data).toBeGreaterThan(0);
    expect(at("THROW 51103")).toBe(data);
    expect(batches[data]).toContain("r.[status] = N'COMPLETED'");
    expect(batches[data]).toContain("v.[status] IN (N'IN_PROGRESS', N'COMPLETED')");
    expect(data).toBeLessThan(trigger(VISIT_TRIGGER));
  });

  it("creates each trigger alone, as the first statement of its batch, AFTER INSERT, UPDATE with SET NOCOUNT ON", () => {
    for (const [name, table] of TRIGGERS) {
      const index = trigger(name);
      expect(index).toBeGreaterThan(0);
      const sql = batches[index];
      expect(sql.startsWith(`CREATE TRIGGER [dbo].[${name}] ON [dbo].[${table}] AFTER INSERT, UPDATE AS BEGIN SET NOCOUNT ON;`)).toBe(true);
      expect(sql.match(/CREATE TRIGGER/g)).toHaveLength(1);
    }
  });

  it("visit trigger: empty-inserted guard, immutable columns through INTERSECT, CONFIRMED check with READCOMMITTEDLOCK (51104, 51105)", () => {
    const sql = batches[trigger(VISIT_TRIGGER)];
    for (const fragment of [
      "IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;",
      "THROW 51104",
      "THROW 51105",
      "INTERSECT",
      "READCOMMITTEDLOCK",
      "WHERE r.[status] <> N'CONFIRMED'",
    ]) expect(sql).toContain(fragment);
  });

  it("reservation trigger: status-only transitions, null-safe INSERT detection, READCOMMITTEDLOCK (51106, 51107)", () => {
    const sql = batches[trigger(RESERVATION_TRIGGER)];
    for (const fragment of [
      "IF NOT UPDATE([status]) RETURN;",
      "THROW 51106",
      "THROW 51107",
      "READCOMMITTEDLOCK",
      "d.[id] IS NULL OR d.[status] <> i.[status]",
    ]) expect(sql).toContain(fragment);
  });

  it("is set-based: no CURSOR, FETCH or WHILE in the trigger batches", () => {
    const triggers = batches.filter(sql => sql.startsWith("CREATE TRIGGER"));
    expect(triggers).toHaveLength(2);
    for (const sql of triggers) expect(sql).not.toMatch(/\b(CURSOR|FETCH|WHILE)\b/i);
  });

  it("verifies the final state last through sys.trigger_events (51109)", () => {
    expect(at("THROW 51109")).toBe(batches.length - 1);
    const verification = batches[batches.length - 1];
    for (const fragment of [
      "sys.trigger_events",
      "e.[type_desc] IN (N'INSERT', N'UPDATE')",
      "e.[type_desc] = N'DELETE'",
      `N'${VISIT_TRIGGER}'`,
      `N'${RESERVATION_TRIGGER}'`,
      "t.[is_disabled] = 0",
    ]) expect(verification).toContain(fragment);
  });

  it("uses each THROW code exactly once (51100-51107 and 51109); 51108 is reserved and unused", () => {
    const thrown = (batches.join(" ").match(/THROW \d+/g) ?? []).map(match => Number(match.slice(6)));
    for (const code of UP_CODES) expect(thrown.filter(value => value === code)).toHaveLength(1);
    expect(thrown).not.toContain(51108);
    expect(thrown.every(code => code >= 51100 && code <= 51109)).toBe(true);
  });

  it("up() never drops or deletes anything", () => {
    expect(batches.join(" ")).not.toMatch(/DROP (TABLE|COLUMN|CONSTRAINT)|ALTER TABLE|INSERT INTO|DELETE FROM/i);
  });

  it("down() drops both triggers, each guarded by OBJECT_ID and in its own batch, without touching data", async () => {
    const sqls: string[] = [];
    const runner: any = { query: jest.fn(async (sql: string) => { sqls.push(sql.replace(/\s+/g, " ").trim()); }) };
    await new ClinicalIntegrity1795780800000().down(runner);
    expect(sqls).toEqual([
      `IF OBJECT_ID(N'dbo.${RESERVATION_TRIGGER}', N'TR') IS NOT NULL DROP TRIGGER [dbo].[${RESERVATION_TRIGGER}];`,
      `IF OBJECT_ID(N'dbo.${VISIT_TRIGGER}', N'TR') IS NOT NULL DROP TRIGGER [dbo].[${VISIT_TRIGGER}];`,
    ]);
    expect(sqls.join(" ")).not.toMatch(/DROP (TABLE|COLUMN|CONSTRAINT)|DELETE|TRUNCATE/i);
  });
});
