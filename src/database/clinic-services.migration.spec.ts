import { ClinicServices1795608000000 } from "./migrations/1795608000000-ClinicServices";

/** Runs up() against a QueryRunner double and returns the SQL batches in order (never touches a database). */
async function run(options: { existingTables?: string[]; hasColumn?: boolean } = {}) {
  const batches: string[] = [];
  const runner: any = {
    isTransactionActive: true,
    hasTable: jest.fn(async (name: string) => !/vc_(employee_)?services$/.test(name) || (options.existingTables ?? []).includes(name)),
    hasColumn: jest.fn(async () => options.hasColumn ?? false),
    query: jest.fn(async (sql: string) => { batches.push(sql.replace(/\s+/g, " ").trim()); }),
  };
  await new ClinicServices1795608000000().up(runner);
  return batches;
}

describe("Migration 1795608000000 ClinicServices (generated SQL)", () => {
  let batches: string[];
  const at = (pattern: string) => batches.findIndex(sql => sql.includes(pattern));

  beforeAll(async () => { batches = await run(); });

  it("requires a transaction, refuses to run twice and has no automatic rollback", async () => {
    await expect(new ClinicServices1795608000000().up({ isTransactionActive: false } as any)).rejects.toThrow(/transaction/);
    await expect(run({ existingTables: ["dbo.vc_services"] })).rejects.toThrow(/already exists/);
    await expect(run({ existingTables: ["dbo.vc_employee_services"] })).rejects.toThrow(/already exists/);
    await expect(run({ hasColumn: true })).rejects.toThrow(/service_id already exists/);
    await expect(new ClinicServices1795608000000().down()).rejects.toThrow(/backup/);
  });

  it("checks preconditions under exclusive table locks before any DDL", () => {
    const preconditions = at("THROW 51081");
    expect(preconditions).toBe(0);
    expect(batches[preconditions]).toContain("[dbo].[vc_reservations] WITH (TABLOCKX, HOLDLOCK)");
    expect(batches[preconditions]).toContain("[dbo].[vc_employees] WITH (TABLOCKX, HOLDLOCK)");
    expect(batches[preconditions]).toContain("THROW 51082");
    expect(preconditions).toBeLessThan(at("CREATE TABLE [dbo].[vc_services]"));
  });

  it("creates vc_services with the catalog code CHECK, the duration CHECK, a unique code and no price column", () => {
    const table = batches[at("CREATE TABLE [dbo].[vc_services]")];
    for (const fragment of [
      "[id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_services_id] DEFAULT NEWSEQUENTIALID()",
      "[code] varchar(64) NOT NULL", "[name] nvarchar(100) NOT NULL", "[description] nvarchar(240) NULL", "[duration_minutes] int NOT NULL",
      "[is_active] bit NOT NULL CONSTRAINT [df_vc_services_is_active] DEFAULT 1",
      "CONSTRAINT [pk_vc_services] PRIMARY KEY ([id])", "CONSTRAINT [uq_vc_services_code] UNIQUE ([code])",
      "CONSTRAINT [ck_vc_services_code] CHECK ([code] COLLATE Latin1_General_100_BIN2 LIKE '[A-Z]%' AND [code] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Z0-9_]%')",
      "CONSTRAINT [ck_vc_services_duration] CHECK ([duration_minutes] BETWEEN 1 AND 1440 AND [duration_minutes] % 5 = 0)",
    ]) expect(table).toContain(fragment);
    expect(table).not.toMatch(/price/i);
  });

  it("creates vc_employee_services with a composite key and FKs without cascade, the index in a later batch", () => {
    const table = batches[at("CREATE TABLE [dbo].[vc_employee_services]")];
    expect(table).toContain("CONSTRAINT [pk_vc_employee_services] PRIMARY KEY ([employee_id], [service_id])");
    expect(table).toContain("CONSTRAINT [fk_vc_employee_services_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id])");
    expect(table).toContain("CONSTRAINT [fk_vc_employee_services_service] FOREIGN KEY ([service_id]) REFERENCES [dbo].[vc_services] ([id])");
    expect(batches.join(" ")).not.toMatch(/CASCADE|SET NULL/i);
    const index = at("CREATE INDEX [ix_vc_employee_services_service_id]");
    expect(index).toBeGreaterThan(at("CREATE TABLE [dbo].[vc_employee_services]"));
    expect(batches[index]).toBe("CREATE INDEX [ix_vc_employee_services_service_id] ON [dbo].[vc_employee_services] ([service_id]);");
  });

  it("adds vc_reservations.service_id nullable alone in its batch and references it only in later batches", () => {
    const add = at("ADD [service_id]");
    expect(batches[add]).toBe("ALTER TABLE [dbo].[vc_reservations] ADD [service_id] uniqueidentifier NULL;");
    // Statements on vc_reservations.service_id (the precondition batch only probes it with COL_LENGTH, which compiles without the column).
    const references = batches.map((sql, index) => (/\[fk_vc_reservations_service\] FOREIGN KEY|\[vc_reservations\] \(\[service_id\]\)|N'service_id', 'AllowsNull'/.test(sql) ? index : -1))
      .filter(index => index >= 0);
    expect(references.length).toBeGreaterThan(0);
    expect(references.every(index => index > add)).toBe(true);
    const fk = batches[at("[fk_vc_reservations_service] FOREIGN KEY")];
    expect(fk).toContain("ALTER TABLE [dbo].[vc_reservations] WITH CHECK ADD CONSTRAINT [fk_vc_reservations_service] FOREIGN KEY ([service_id]) REFERENCES [dbo].[vc_services] ([id]);");
    expect(fk).toContain("CREATE INDEX [ix_vc_reservations_service_id] ON [dbo].[vc_reservations] ([service_id]);");
    // No backfill or seed: legacy reservations keep service_id NULL; the administrator creates the catalog.
    expect(batches.join(" ")).not.toMatch(/INSERT INTO|UPDATE /);
  });

  it("verifies the final state last (trusted checks and FKs, unique code, indexes, nullable column)", () => {
    expect(at("THROW 51089")).toBe(batches.length - 1);
    const verification = batches[batches.length - 1];
    for (const fragment of ["ck_vc_services_duration", "uq_vc_services_code", "fk_vc_employee_services_service", "ix_vc_employee_services_service_id",
      "fk_vc_reservations_service", "ix_vc_reservations_service_id", "'AllowsNull') <> 1", "[delete_referential_action] = 0", "[is_not_trusted] = 0"]) {
      expect(verification).toContain(fragment);
    }
  });

  it("only uses THROW codes 51080-51089", () => {
    const codes = batches.join(" ").match(/THROW (\d+)/g)!.map(match => Number(match.slice(6)));
    expect(codes.every(code => code >= 51080 && code <= 51089)).toBe(true);
  });
});
