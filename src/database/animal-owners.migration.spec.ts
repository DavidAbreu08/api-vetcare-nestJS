import { ReservationHistoryAction } from "../app/reservation-history/enums/reservation-history-action.enum";
import { AnimalOwnerEndReason } from "../app/animal-owners/enums/animal-owner-end-reason.enum";
import { AnimalOwners1795435200000, RESERVATION_HISTORY_ACTIONS } from "./migrations/1795435200000-AnimalOwners";

/** Runs up() against a QueryRunner double and returns the SQL batches in order (never touches a database). */
async function run(existing: string[] = []) {
  const batches: string[] = [];
  const runner: any = {
    isTransactionActive: true,
    hasTable: jest.fn(async (name: string) => !name.endsWith("vc_animal_owners") || existing.includes(name)),
    query: jest.fn(async (sql: string) => { batches.push(sql.replace(/\s+/g, " ").trim()); }),
  };
  await new AnimalOwners1795435200000().up(runner);
  return batches;
}

describe("Migration 1795435200000 AnimalOwners (generated SQL)", () => {
  let batches: string[];
  const at = (pattern: RegExp | string) => batches.findIndex(sql => (typeof pattern === "string" ? sql.includes(pattern) : pattern.test(sql)));

  beforeAll(async () => { batches = await run(); });

  it("requires a transaction and refuses to run twice", async () => {
    await expect(new AnimalOwners1795435200000().up({ isTransactionActive: false } as any)).rejects.toThrow(/transaction/);
    await expect(run(["dbo.vc_animal_owners"])).rejects.toThrow(/already exists/);
    await expect(new AnimalOwners1795435200000().down()).rejects.toThrow(/backup/);
  });

  it("checks preconditions under exclusive table locks before any DDL", () => {
    const preconditions = at("THROW 51061");
    expect(at("THROW 51060")).toBeLessThan(preconditions);
    expect(batches[preconditions]).toContain("[dbo].[vc_animals] WITH (TABLOCKX, HOLDLOCK)");
    expect(batches[preconditions]).toContain("[dbo].[vc_reservation_history] WITH (TABLOCKX, HOLDLOCK)");
    for (const code of [51062, 51063, 51064]) expect(batches[preconditions]).toContain(`THROW ${code}`);
    expect(preconditions).toBeLessThan(at("CREATE TABLE [dbo].[vc_animal_owners]"));
  });

  it("creates vc_animal_owners with the agreed names, trusted constraints and no cascade", () => {
    const table = batches[at("CREATE TABLE [dbo].[vc_animal_owners]")];
    for (const name of [
      "pk_vc_animal_owners", "df_vc_animal_owners_id] DEFAULT NEWSEQUENTIALID()", "df_vc_animal_owners_is_primary] DEFAULT 0",
      "fk_vc_animal_owners_animal", "fk_vc_animal_owners_user", "fk_vc_animal_owners_assigned_by", "fk_vc_animal_owners_ended_by",
      "[ck_vc_animal_owners_dates] CHECK ([ended_at] IS NULL OR [ended_at] >= [assigned_at])",
      "[ck_vc_animal_owners_ended] CHECK ([ended_at] IS NOT NULL OR ([ended_by] IS NULL AND [end_reason] IS NULL))",
      "[assigned_at] datetime2(3) NOT NULL", "[ended_at] datetime2(3) NULL", "[end_reason] nvarchar(30) NULL",
    ]) expect(table).toContain(name);
    expect(table).not.toMatch(/CASCADE|SET NULL/i);
    // The end-reason CHECK lists exactly the application's enum.
    const reasons = /ck_vc_animal_owners_end_reason\] CHECK \(.*?IN \((.*?)\)\)/.exec(table)![1];
    expect(reasons.split(", ").map(value => value.slice(2, -1)).sort()).toEqual(Object.values(AnimalOwnerEndReason).sort());
  });

  it("creates the filtered unique indexes and the owner_id index in a later batch", () => {
    const indexes = batches[at("uq_vc_animal_owners_active")];
    expect(at("uq_vc_animal_owners_active")).toBeGreaterThan(at("CREATE TABLE [dbo].[vc_animal_owners]"));
    expect(indexes).toContain("CREATE UNIQUE INDEX [uq_vc_animal_owners_active] ON [dbo].[vc_animal_owners] ([animal_id], [user_id]) WHERE [ended_at] IS NULL;");
    expect(indexes).toContain("CREATE UNIQUE INDEX [uq_vc_animal_owners_primary] ON [dbo].[vc_animal_owners] ([animal_id]) WHERE [ended_at] IS NULL AND [is_primary] = 1;");
    expect(indexes).toContain("CREATE INDEX [ix_vc_animal_owners_user_active] ON [dbo].[vc_animal_owners] ([user_id], [animal_id]) INCLUDE ([is_primary]) WHERE [ended_at] IS NULL;");
    for (const name of ["ix_vc_animal_owners_animal_assigned", "ix_vc_animal_owners_assigned_by", "ix_vc_animal_owners_ended_by"]) expect(indexes).toContain(name);
    expect(indexes).toContain("CREATE INDEX [ix_vc_animals_owner_id] ON [dbo].[vc_animals] ([owner_id]);");
  });

  it("copies one active primary per animal with owner_id, then verifies the copy", () => {
    const copy = at("INSERT INTO [dbo].[vc_animal_owners]");
    expect(batches[copy]).toContain("SELECT a.[id], a.[owner_id], 1, CONVERT(datetime2(3), a.[created_at]), NULL, NULL, NULL, NULL FROM [dbo].[vc_animals] a WHERE a.[owner_id] IS NOT NULL;");
    expect(copy).toBeGreaterThan(at("uq_vc_animal_owners_primary"));
    const verification = at("THROW 51065");
    expect(verification).toBe(copy + 1);
    expect(batches[verification]).toContain("o.[user_id] = a.[owner_id]");
  });

  it("adds CLIENT_CHANGED to the reservation history CHECK (same list as the application enum), then verifies the final state", () => {
    expect([...RESERVATION_HISTORY_ACTIONS].sort()).toEqual(Object.values(ReservationHistoryAction).sort());
    const check = batches[at("DROP CONSTRAINT [ck_vc_reservation_history_action]")];
    expect(check).toContain("WITH CHECK ADD CONSTRAINT [ck_vc_reservation_history_action] CHECK ([action] COLLATE Latin1_General_100_BIN2 IN (");
    expect(check).toContain("N'CLIENT_CHANGED'");
    // Existing rows were validated against the same list before the drop.
    expect(batches[at("THROW 51064")]).toContain("N'CLIENT_CHANGED'");
    expect(at("THROW 51069")).toBe(batches.length - 1);
    expect(batches[batches.length - 1]).toContain("[definition] LIKE N'%CLIENT[_]CHANGED%'");
  });

  it("only uses THROW codes 51060-51069", () => {
    const codes = batches.join(" ").match(/THROW (\d+)/g)!.map(match => Number(match.slice(6)));
    expect(codes.every(code => code >= 51060 && code <= 51069)).toBe(true);
  });
});
