import { ReservationAuthorship1795521600000 } from "./migrations/1795521600000-ReservationAuthorship";

/** Runs up() against a QueryRunner double and returns the SQL batches in order (never touches a database). */
async function run(options: { hasColumn?: boolean; withoutAuthor?: number } = {}) {
  const batches: string[] = [];
  const log = jest.fn();
  const runner: any = {
    isTransactionActive: true,
    connection: { logger: { log } },
    hasTable: jest.fn(async () => true),
    hasColumn: jest.fn(async () => options.hasColumn ?? false),
    query: jest.fn(async (sql: string) => {
      batches.push(sql.replace(/\s+/g, " ").trim());
      return sql.includes("[withoutAuthor]") ? [{ withoutAuthor: options.withoutAuthor ?? 0 }] : undefined;
    }),
  };
  await new ReservationAuthorship1795521600000().up(runner);
  return { batches, log };
}

describe("Migration 1795521600000 ReservationAuthorship (generated SQL)", () => {
  let batches: string[];
  const at = (pattern: string) => batches.findIndex(sql => sql.includes(pattern));

  beforeAll(async () => { ({ batches } = await run()); });

  it("requires a transaction, refuses to run twice and has no automatic rollback", async () => {
    await expect(new ReservationAuthorship1795521600000().up({ isTransactionActive: false } as any)).rejects.toThrow(/transaction/);
    await expect(run({ hasColumn: true })).rejects.toThrow(/already exists/);
    await expect(new ReservationAuthorship1795521600000().down()).rejects.toThrow(/backup/);
  });

  it("checks preconditions (including duplicate CREATED events) under exclusive table locks before any DDL", () => {
    const preconditions = at("THROW 51071");
    expect(at("THROW 51070")).toBeLessThan(preconditions);
    expect(batches[preconditions]).toContain("[dbo].[vc_reservations] WITH (TABLOCKX, HOLDLOCK)");
    expect(batches[preconditions]).toContain("[dbo].[vc_reservation_history] WITH (TABLOCKX, HOLDLOCK)");
    for (const code of [51072, 51073]) expect(batches[preconditions]).toContain(`THROW ${code}`);
    expect(batches[preconditions]).toContain("WHERE [action] = N'CREATED' GROUP BY [reservation_id] HAVING COUNT(*) > 1");
    expect(preconditions).toBeLessThan(at("ADD [created_by]"));
  });

  it("adds a nullable column alone in its batch and references it only in later batches", () => {
    const add = at("ADD [created_by]");
    expect(batches[add]).toBe("ALTER TABLE [dbo].[vc_reservations] ADD [created_by] uniqueidentifier NULL;");
    const references = batches.map((sql, index) => (/r\.\[created_by\]|\(\[created_by\]\)|\[created_by\] IS NULL/.test(sql) ? index : -1)).filter(index => index >= 0);
    expect(references.length).toBeGreaterThan(0);
    expect(references.every(index => index > add)).toBe(true);
  });

  it("backfills from the CREATED event author only (never client_id), then verifies before adding the FK", () => {
    const backfill = at("UPDATE r SET r.[created_by] = h.[changed_by]");
    expect(batches[backfill]).toContain("INNER JOIN [dbo].[vc_reservation_history] h ON h.[reservation_id] = r.[id] AND h.[action] = N'CREATED'");
    expect(batches[backfill]).not.toContain("client_id");
    const verification = at("THROW 51074");
    expect(verification).toBe(backfill + 1);
    expect(verification).toBeLessThan(at("fk_vc_reservations_created_by] FOREIGN KEY"));
  });

  it("creates the trusted FK without cascade, the index and the filtered unique CREATED index", () => {
    const ddl = batches[at("fk_vc_reservations_created_by] FOREIGN KEY")];
    expect(ddl).toContain("ALTER TABLE [dbo].[vc_reservations] WITH CHECK ADD CONSTRAINT [fk_vc_reservations_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[vc_users] ([id]);");
    expect(ddl).not.toMatch(/CASCADE|SET NULL/i);
    expect(ddl).toContain("CREATE INDEX [ix_vc_reservations_created_by] ON [dbo].[vc_reservations] ([created_by]);");
    expect(ddl).toContain("CREATE UNIQUE INDEX [uq_vc_reservation_history_created] ON [dbo].[vc_reservation_history] ([reservation_id]) WHERE [action] = N'CREATED';");
    expect(batches[at("THROW 51079")]).toContain("[delete_referential_action] = 0");
  });

  it("reports the reservations left without a known author", async () => {
    expect((await run({ withoutAuthor: 0 })).log).not.toHaveBeenCalled();
    const { log } = await run({ withoutAuthor: 3 });
    expect(log).toHaveBeenCalledWith("warn", expect.stringContaining("3 reservation(s) have no known author"));
  });

  it("only uses THROW codes 51070-51079", () => {
    const codes = batches.join(" ").match(/THROW (\d+)/g)!.map(match => Number(match.slice(6)));
    expect(codes.every(code => code >= 51070 && code <= 51079)).toBe(true);
  });
});
