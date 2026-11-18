import { SchedulesAndBlocks1795694400000 } from "./migrations/1795694400000-SchedulesAndBlocks";

/** Runs up() against a QueryRunner double and returns the SQL batches in order (never touches a database). */
async function run(options: { existingTables?: string[]; existingColumns?: string[] } = {}) {
  const batches: string[] = [];
  const runner: any = {
    isTransactionActive: true,
    hasTable: jest.fn(async (name: string) => !/vc_employee_schedules$/.test(name) || (options.existingTables ?? []).includes(name)),
    hasColumn: jest.fn(async (_table: string, column: string) => (options.existingColumns ?? []).includes(column)),
    query: jest.fn(async (sql: string) => { batches.push(sql.replace(/\s+/g, " ").trim()); }),
  };
  await new SchedulesAndBlocks1795694400000().up(runner);
  return batches;
}

describe("Migration 1795694400000 SchedulesAndBlocks (generated SQL)", () => {
  let batches: string[];
  const at = (pattern: string) => batches.findIndex(sql => sql.includes(pattern));

  beforeAll(async () => { batches = await run(); });

  it("requires a transaction, refuses to run twice and has no automatic rollback", async () => {
    await expect(new SchedulesAndBlocks1795694400000().up({ isTransactionActive: false } as any)).rejects.toThrow(/transaction/);
    await expect(run({ existingTables: ["dbo.vc_employee_schedules"] })).rejects.toThrow(/already exists/);
    for (const column of ["employee_id", "start_at", "end_at", "created_by", "created_at"]) {
      await expect(run({ existingColumns: [column] })).rejects.toThrow(new RegExp(`vc_blocked_times.${column} already exists`));
    }
    await expect(new SchedulesAndBlocks1795694400000().down()).rejects.toThrow(/backup/);
  });

  it("checks preconditions under exclusive table locks before any DDL", () => {
    const preconditions = at("THROW 51090");
    expect(preconditions).toBe(0);
    expect(batches[0]).toContain("[dbo].[vc_blocked_times] WITH (TABLOCKX, HOLDLOCK)");
    expect(batches[0]).toContain("[dbo].[vc_employees] WITH (TABLOCKX, HOLDLOCK)");
    expect(batches[0]).toContain("THROW 51091");
    expect(batches[0]).toContain("THROW 51092");
    // The first batch only probes the new columns with COL_LENGTH (which compiles without them).
    expect(batches[0]).not.toMatch(/\[(start_at|end_at|employee_id|created_by)\]/);
    expect(preconditions).toBeLessThan(at("CREATE TABLE [dbo].[vc_employee_schedules]"));
  });

  it("creates vc_employee_schedules with the day, time and validity CHECKs and an FK without cascade", () => {
    const table = batches[at("CREATE TABLE [dbo].[vc_employee_schedules]")];
    for (const fragment of [
      "[id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_employee_schedules_id] DEFAULT NEWSEQUENTIALID()",
      "[employee_id] uniqueidentifier NOT NULL", "[day_of_week] tinyint NOT NULL",
      "[start_time] time(0) NOT NULL", "[end_time] time(0) NOT NULL", "[valid_from] date NOT NULL", "[valid_until] date NULL",
      "CONSTRAINT [pk_vc_employee_schedules] PRIMARY KEY ([id])",
      "CONSTRAINT [fk_vc_employee_schedules_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id])",
      "CONSTRAINT [ck_vc_employee_schedules_day_of_week] CHECK ([day_of_week] BETWEEN 0 AND 6)",
      "CONSTRAINT [ck_vc_employee_schedules_time] CHECK ([end_time] > [start_time])",
      "CONSTRAINT [ck_vc_employee_schedules_validity] CHECK ([valid_until] IS NULL OR [valid_until] >= [valid_from])",
    ]) expect(table).toContain(fragment);
    expect(batches.join(" ")).not.toMatch(/CASCADE|SET NULL/i);
    const index = at("CREATE INDEX [ix_vc_employee_schedules_employee_day]");
    expect(index).toBeGreaterThan(at("CREATE TABLE [dbo].[vc_employee_schedules]"));
    expect(batches[index]).toBe("CREATE INDEX [ix_vc_employee_schedules_employee_day] ON [dbo].[vc_employee_schedules] ([employee_id], [day_of_week], [valid_from]) INCLUDE ([start_time], [end_time], [valid_until]);");
  });

  it("adds the block columns alone in their batch and references them only in later batches", () => {
    const add = at("ALTER TABLE [dbo].[vc_blocked_times] ADD [employee_id]");
    expect(batches[add]).toBe("ALTER TABLE [dbo].[vc_blocked_times] ADD [employee_id] uniqueidentifier NULL, [start_at] datetime2(3) NULL, [end_at] datetime2(3) NULL, [created_by] uniqueidentifier NULL, [created_at] datetime2(3) NOT NULL CONSTRAINT [df_vc_blocked_times_created_at] DEFAULT SYSUTCDATETIME();");
    const references = batches.map((sql, index) => (/\[(start_at|end_at|employee_id|created_by)\]/.test(sql) && !sql.includes("vc_employee_schedules") ? index : -1))
      .filter(index => index >= 0 && index !== add);
    expect(references.length).toBeGreaterThan(0);
    expect(references.every(index => index > add)).toBe(true);
  });

  it("backfills start_at/end_at from the legacy [start]/[end] before the data precondition, NOT NULL and the CHECK", () => {
    const backfill = at("UPDATE [dbo].[vc_blocked_times]");
    expect(batches[backfill]).toBe("UPDATE [dbo].[vc_blocked_times] SET [start_at] = CAST([start] AS datetime2(3)), [end_at] = CAST([end] AS datetime2(3));");
    const precondition = at("THROW 51093");
    expect(batches[precondition]).toContain("WHERE [start_at] IS NULL OR [end_at] IS NULL OR [end_at] <= [start_at]");
    const notNull = at("ALTER COLUMN [start_at] datetime2(3) NOT NULL");
    const check = at("[ck_vc_blocked_times_interval] CHECK ([end_at] > [start_at])");
    expect(backfill).toBeGreaterThan(at("ADD [employee_id]"));
    expect(backfill).toBeLessThan(precondition);
    expect(precondition).toBeLessThan(notNull);
    expect(notNull).toBeLessThan(check);
    expect(batches[notNull]).toContain("ALTER TABLE [dbo].[vc_blocked_times] ALTER COLUMN [end_at] datetime2(3) NOT NULL;");
    // No other data change: no seed and no backfill of employee_id/created_by (legacy blocks stay global, author unknown).
    expect(batches.filter(sql => /INSERT INTO|UPDATE /.test(sql))).toHaveLength(1);
  });

  it("keeps the legacy columns, only making them NULL-able (never dropped)", () => {
    const alter = batches[at("ALTER COLUMN [start_at]")];
    for (const fragment of ["ALTER COLUMN [date] datetime NULL;", "ALTER COLUMN [time_start] nvarchar(255) NULL;", "ALTER COLUMN [time_end] nvarchar(255) NULL;",
      "ALTER COLUMN [start] datetime NULL;", "ALTER COLUMN [end] datetime NULL;"]) expect(alter).toContain(fragment);
    expect(batches.join(" ")).not.toMatch(/DROP COLUMN|DROP TABLE|DROP CONSTRAINT/i);
  });

  it("adds trusted FKs to vc_employees and vc_users and the two block indexes", () => {
    const constraints = batches[at("[fk_vc_blocked_times_employee]")];
    expect(constraints).toContain("ALTER TABLE [dbo].[vc_blocked_times] WITH CHECK ADD CONSTRAINT [ck_vc_blocked_times_interval] CHECK ([end_at] > [start_at]),");
    expect(constraints).toContain("CONSTRAINT [fk_vc_blocked_times_employee] FOREIGN KEY ([employee_id]) REFERENCES [dbo].[vc_employees] ([id])");
    expect(constraints).toContain("CONSTRAINT [fk_vc_blocked_times_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[vc_users] ([id]);");
    expect(constraints).toContain("CREATE INDEX [ix_vc_blocked_times_start_end] ON [dbo].[vc_blocked_times] ([start_at], [end_at]) INCLUDE ([employee_id]);");
    expect(constraints).toContain("CREATE INDEX [ix_vc_blocked_times_employee_start] ON [dbo].[vc_blocked_times] ([employee_id], [start_at]) INCLUDE ([end_at]);");
  });

  it("verifies the final state last (trusted checks and FKs, indexes, nullability)", () => {
    expect(at("THROW 51099")).toBe(batches.length - 1);
    const verification = batches[batches.length - 1];
    for (const fragment of ["ck_vc_employee_schedules_day_of_week", "ck_vc_employee_schedules_time", "ck_vc_employee_schedules_validity",
      "fk_vc_employee_schedules_employee", "ix_vc_employee_schedules_employee_day", "ck_vc_blocked_times_interval", "fk_vc_blocked_times_employee",
      "fk_vc_blocked_times_created_by", "ix_vc_blocked_times_start_end", "ix_vc_blocked_times_employee_start",
      "N'start_at', 'AllowsNull') <> 0", "N'employee_id', 'AllowsNull') <> 1", "N'time_start', 'AllowsNull') <> 1",
      "[delete_referential_action] = 0", "[is_not_trusted] = 0"]) {
      expect(verification).toContain(fragment);
    }
  });

  it("only uses THROW codes 51090-51099", () => {
    const codes = batches.join(" ").match(/THROW (\d+)/g)!.map(match => Number(match.slice(6)));
    expect(codes.every(code => code >= 51090 && code <= 51099)).toBe(true);
  });
});
