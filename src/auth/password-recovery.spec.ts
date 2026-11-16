import "src/force-utc";
import { BadRequestException, Logger, UnauthorizedException } from "@nestjs/common";
import { createHash } from "crypto";
import { hashSync } from "bcrypt";
import { MssqlParameter } from "typeorm";
import { PersistenceService } from "src/app/core/persistence/persistence.service";
import { UsersBusinessService } from "src/app/users/users.business.service";
import { UsersService } from "src/app/users/users.service";
import { AuthMessages } from "./auth.messages";
import { AuthService, RESET_TOKENS_PER_WINDOW } from "./auth.service";
import { ResetTokenEntityRepository } from "./repository/reset-token.repository";

type TokenRow = { userId: string; tokenHash: Buffer; expiresAt: Date; usedAt: Date | null; createdAt: Date };
type UserRow = { id: string; email: string; name: string; isActive: boolean; deletedAt: Date | null; passwordHash: string; passwordChangedAt: Date | null };

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest();
const PASSWORD = "NewSecret#123";
const HOUR = 60 * 60 * 1000;

/**
 * In-memory stand-in for vc_users / vc_reset_tokens that executes the statements issued by the repository and
 * UsersBusinessService with their SQL semantics; a transaction is rolled back when its work throws.
 */
function fakeDatabase() {
  const db = { tokens: [] as TokenRow[], users: [] as UserRow[], statements: [] as string[] };
  const manager = {
    query: jest.fn(async (sql: string, typed: MssqlParameter[]) => {
      // Every raw parameter is typed (datetime2 instants, varbinary hash, uniqueidentifier ids).
      expect(typed.every(p => p instanceof MssqlParameter)).toBe(true);
      const params = typed.map(p => p.value);
      if (sql.startsWith("SELECT 1 AS [locked] FROM [dbo].[vc_users] WITH (UPDLOCK, ROWLOCK) WHERE [id] = @0")) {
        db.statements.push("lock");
        const [id] = params as [string];
        return db.users.filter(u => u.id === id).map(() => ({ locked: 1 }));
      }
      if (sql.startsWith("SELECT [user_id] FROM [dbo].[vc_reset_tokens] WHERE [token_hash] = @0 AND [used_at] IS NULL AND [expires_at] > @1")) {
        db.statements.push("lookup");
        const [hash, now] = params as [Buffer, Date];
        return db.tokens.filter(t => t.tokenHash.equals(hash) && t.usedAt === null && t.expiresAt > now).map(t => ({ user_id: t.userId }));
      }
      if (sql.startsWith("UPDATE [dbo].[vc_reset_tokens] SET [used_at] = @0 OUTPUT inserted.[id] WHERE [token_hash] = @1 AND [user_id] = @2 AND [used_at] IS NULL AND [expires_at] > @0")) {
        db.statements.push("consume");
        const [now, hash, userId] = params as [Date, Buffer, string];
        const rows = db.tokens.filter(t => t.tokenHash.equals(hash) && t.userId === userId && t.usedAt === null && t.expiresAt > now);
        rows.forEach(t => (t.usedAt = now));
        return rows.map(() => ({ id: "T" }));
      }
      if (sql.startsWith("SELECT COUNT(*) AS [total] FROM [dbo].[vc_reset_tokens] WHERE [user_id] = @0 AND [created_at] > @1")) {
        db.statements.push("count");
        const [userId, since] = params as [string, Date];
        return [{ total: db.tokens.filter(t => t.userId === userId && t.createdAt > since).length }];
      }
      if (sql.startsWith("UPDATE [dbo].[vc_reset_tokens] SET [used_at] = @0 WHERE [user_id] = @1 AND [used_at] IS NULL")) {
        db.statements.push("invalidate");
        const [now, userId] = params as [Date, string];
        db.tokens.filter(t => t.userId === userId && t.usedAt === null).forEach(t => (t.usedAt = now));
        return undefined;
      }
      if (sql.startsWith("UPDATE [dbo].[vc_users] SET [password_hash] = @0, [password_changed_at] = @1")) {
        db.statements.push("user");
        expect(sql).toContain("[deleted_at] IS NULL AND [is_active] = 1");
        const [passwordHash, now, id] = params as [string, Date, string];
        const user = db.users.find(u => u.id === id && u.deletedAt === null && u.isActive);
        if (!user) return [];
        Object.assign(user, { passwordHash, passwordChangedAt: now });
        return [{ id }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    insert: jest.fn(async (_entity: unknown, row: TokenRow) => { db.statements.push("insert"); db.tokens.push({ ...row }); }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (m: unknown) => Promise<unknown>) => {
      const snapshot = { tokens: db.tokens.map(t => ({ ...t })), users: db.users.map(u => ({ ...u })) };
      try {
        return await work(manager);
      } catch (error) {
        db.tokens = snapshot.tokens;
        db.users = snapshot.users;
        throw error;
      }
    }),
  };
  /** vc_users repository: soft-deleted rows are excluded like TypeORM does with @DeleteDateColumn. */
  const usersRepository = {
    findOne: jest.fn(async ({ where }: any) => db.users.find(u => u.deletedAt === null &&
      Object.entries(where).every(([key, value]) => (u as any)[key] === value)) ?? null),
  };
  return { db, manager, dataSource, usersRepository };
}

describe("Password recovery", () => {
  let fake: ReturnType<typeof fakeDatabase>, auth: AuthService, email: { sendResetPasswordEmail: jest.Mock }, logs: jest.SpyInstance[];
  let background: jest.SpyInstance;

  const addUser = (overrides: Partial<UserRow> = {}) => {
    const user: UserRow = { id: "U-1", email: "ana@x.pt", name: "Ana", isActive: true, deletedAt: null, passwordHash: hashSync("Old#12345", 4), passwordChangedAt: null, ...overrides };
    fake.db.users.push(user);
    return user;
  };
  const addToken = (token: string, overrides: Partial<TokenRow> = {}) => {
    const now = Date.now();
    fake.db.tokens.push({ userId: "U-1", tokenHash: sha256(token), expiresAt: new Date(now + HOUR), usedAt: null, createdAt: new Date(now - 2 * HOUR), ...overrides });
  };
  const loggedText = () => logs.flatMap(spy => spy.mock.calls.flat()).map(String).join("\n");
  /** Test seam: waits for every background issuance started by forgotPassword (no sleeps). */
  const settled = () => Promise.all(background.mock.results.map(result => result.value));
  const forgot = async (address: string) => {
    const response = await auth.forgotPassword(address);
    await settled();
    return response;
  };

  beforeEach(() => {
    fake = fakeDatabase();
    email = { sendResetPasswordEmail: jest.fn(async () => undefined) };
    const business = new UsersBusinessService(new PersistenceService(), fake.dataSource as any, fake.usersRepository as any, {} as any, {} as any, {} as any, {} as any);
    const repository = new ResetTokenEntityRepository({ createEntityManager: () => ({}) } as any);
    auth = new AuthService(new UsersService(business), {} as any, email as any, repository, fake.dataSource as any, new PersistenceService());
    logs = (["log", "error", "warn", "debug", "verbose"] as const).map(level => jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined));
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    background = jest.spyOn(AuthService.prototype as any, "issuePasswordResetInBackground");
  });

  afterEach(() => jest.restoreAllMocks());

  describe("forgotPassword", () => {
    const answer = { message: AuthMessages.PASSWORD_RESET_REQUESTED };

    it("issues a hashed token and emails the plain one for an active account", async () => {
      addUser();
      await expect(forgot(" Ana@X.pt ")).resolves.toEqual(answer);
      expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
      const [to, token] = email.sendResetPasswordEmail.mock.calls[0];
      expect(to).toBe("ana@x.pt");
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(fake.db.tokens).toHaveLength(1);
      expect(fake.db.tokens[0].tokenHash.equals(sha256(token))).toBe(true);
      expect(fake.db.tokens[0]).toMatchObject({ userId: "U-1", usedAt: null });
      // The repository never receives the plain token.
      for (const call of [...fake.manager.insert.mock.calls, ...fake.manager.query.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain(token);
      }
    });

    it("invalidates earlier pending tokens (kept for the per-account limit) in the same transaction", async () => {
      addUser();
      addToken("a".repeat(64));
      await forgot("ana@x.pt");
      expect(fake.db.tokens).toHaveLength(2);
      expect(fake.db.tokens[0].usedAt).toBeInstanceOf(Date);
      expect(fake.db.tokens[1].usedAt).toBeNull();
      expect(fake.dataSource.transaction).toHaveBeenCalledTimes(1);
      // The account row is locked before the tokens are counted, invalidated or inserted (users -> tokens).
      expect(fake.db.statements).toEqual(["lock", "count", "invalidate", "insert"]);
    });

    it("answers before any issuance work completes (no timing oracle) and finishes it in the background", async () => {
      addUser();
      let release!: () => void;
      const lookup = fake.usersRepository.findOne.getMockImplementation()!;
      fake.usersRepository.findOne.mockImplementationOnce(async (options: any) => {
        await new Promise<void>(resolve => (release = resolve));
        return lookup(options);
      });
      await expect(auth.forgotPassword("ana@x.pt")).resolves.toEqual(answer);
      expect(fake.dataSource.transaction).not.toHaveBeenCalled();
      expect(email.sendResetPasswordEmail).not.toHaveBeenCalled();
      release();
      await settled();
      expect(fake.db.tokens).toHaveLength(1);
      expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    });

    it("answers identically for unknown, inactive and deleted accounts without issuing or sending", async () => {
      addUser({ id: "U-2", email: "off@x.pt", isActive: false });
      addUser({ id: "U-3", email: "gone@x.pt", deletedAt: new Date() });
      for (const address of ["nobody@x.pt", "off@x.pt", "gone@x.pt"]) {
        await expect(forgot(address)).resolves.toEqual(answer);
      }
      expect(fake.db.tokens).toHaveLength(0);
      expect(email.sendResetPasswordEmail).not.toHaveBeenCalled();
    });

    it("answers identically when SMTP fails, logging no token", async () => {
      addUser();
      email.sendResetPasswordEmail.mockImplementation(async (_to: string, token: string) => { throw new Error(`SMTP down for ${token}`); });
      await expect(forgot("ana@x.pt")).resolves.toEqual(answer);
      const token = email.sendResetPasswordEmail.mock.calls[0][1];
      expect(logs[1]).toHaveBeenCalledWith(AuthMessages.RESET_EMAIL_FAILED);
      expect(loggedText()).not.toContain(token);
    });

    it("answers identically when the database fails, logging only a constant", async () => {
      addUser();
      fake.dataSource.transaction.mockRejectedValueOnce(new Error("db down"));
      await expect(forgot("ana@x.pt")).resolves.toEqual(answer);
      expect(logs[1]).toHaveBeenCalledWith(AuthMessages.PASSWORD_RESET_FAILED);
      expect(email.sendResetPasswordEmail).not.toHaveBeenCalled();
    });

    it(`stops issuing after ${RESET_TOKENS_PER_WINDOW} tokens in the last hour with the same answer`, async () => {
      addUser();
      for (let i = 0; i < RESET_TOKENS_PER_WINDOW; i++) {
        await expect(forgot("ana@x.pt")).resolves.toEqual(answer);
      }
      expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_TOKENS_PER_WINDOW);
      await expect(forgot("ana@x.pt")).resolves.toEqual(answer);
      expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_TOKENS_PER_WINDOW);
      expect(fake.db.tokens).toHaveLength(RESET_TOKENS_PER_WINDOW);
      // Tokens older than one hour do not count.
      fake.db.tokens.forEach(t => (t.createdAt = new Date(Date.now() - HOUR - 1000)));
      await forgot("ana@x.pt");
      expect(email.sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_TOKENS_PER_WINDOW + 1);
    });
  });

  describe("resetPassword", () => {
    const TOKEN = "c".repeat(64);
    const generic = (promise: Promise<unknown>) => expect(promise).rejects.toThrow(new BadRequestException(AuthMessages.INVALID_RESET_TOKEN));

    it("consumes the token, invalidates the others and updates password and password_changed_at", async () => {
      const user = addUser();
      addToken(TOKEN);
      addToken("d".repeat(64));
      const before = Date.now();
      await expect(auth.resetPassword(TOKEN, PASSWORD, PASSWORD)).resolves.toMatchObject({ message: AuthMessages.PASSWORD_RESET });
      expect(fake.db.tokens.every(t => t.usedAt instanceof Date)).toBe(true);
      const stored = fake.db.users.find(u => u.id === user.id)!;
      expect(require("bcrypt").compareSync(PASSWORD, stored.passwordHash)).toBe(true);
      expect(stored.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(before);
      // Users-first: token read without locks, account row locked, then token consumed and password set.
      expect(fake.db.statements).toEqual(["lookup", "lock", "consume", "user", "invalidate"]);
      // Single use.
      await generic(auth.resetPassword(TOKEN, PASSWORD, PASSWORD));
    });

    it("gives the same message for unknown, expired and used tokens, writing nothing", async () => {
      addUser();
      addToken("e".repeat(64), { expiresAt: new Date(Date.now() - 1000) });
      addToken("f".repeat(64), { usedAt: new Date() });
      for (const token of ["0".repeat(64), "e".repeat(64), "f".repeat(64)]) {
        await generic(auth.resetPassword(token, PASSWORD, PASSWORD));
      }
      expect(fake.db.statements).toEqual(["lookup", "lookup", "lookup"]);
      expect(fake.db.users[0].passwordChangedAt).toBeNull();
    });

    it("rejects a confirmation mismatch before looking at the token", async () => {
      addUser();
      addToken(TOKEN);
      await expect(auth.resetPassword(TOKEN, PASSWORD, "Other#12345")).rejects.toThrow(new BadRequestException(AuthMessages.PASSWORD_CONFIRMATION_MISMATCH));
      expect(fake.manager.query).not.toHaveBeenCalled();
      expect(fake.dataSource.transaction).not.toHaveBeenCalled();
      expect(fake.db.tokens[0].usedAt).toBeNull();
    });

    it("fails with the same message for inactive or deleted accounts and rolls back the token", async () => {
      for (const overrides of [{ isActive: false }, { deletedAt: new Date() }]) {
        fake.db.users = [];
        fake.db.tokens = [];
        addUser(overrides);
        addToken(TOKEN);
        await generic(auth.resetPassword(TOKEN, PASSWORD, PASSWORD));
        expect(fake.db.tokens[0].usedAt).toBeNull();
        expect(fake.db.users[0].passwordChangedAt).toBeNull();
      }
    });
  });

  describe("changePassword", () => {
    it("updates password_changed_at and invalidates pending tokens in one transaction", async () => {
      addUser();
      addToken("a".repeat(64));
      await auth.changePassword("U-1", "Old#12345", PASSWORD, PASSWORD);
      expect(fake.db.users[0].passwordChangedAt).toBeInstanceOf(Date);
      expect(fake.db.tokens[0].usedAt).toEqual(fake.db.users[0].passwordChangedAt);
      expect(fake.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(fake.db.statements).toEqual(["user", "invalidate"]);
    });

    it("keeps rejecting a wrong old password without writing", async () => {
      addUser();
      await expect(auth.changePassword("U-1", "Wrong#12345", PASSWORD, PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(fake.db.statements).toEqual([]);
    });
  });
});
