import { EntityManager } from "typeorm";

/**
 * Longest wait for a row or table lock in a critical transaction. Beyond it SQL Server raises 1222 (lock request time
 * out), which the persistence layer translates to 409 (retry).
 */
export const CRITICAL_LOCK_TIMEOUT_MS = 5000;

/** The part of the mssql connection that TypeORM keeps on its SQL Server query runner while a transaction is open. */
type SqlServerSession = {
  request?: () => { batch: (sql: string) => Promise<unknown> };
};

/** The part of TypeORM's SQL Server query runner used here (`databaseConnection` is protected in its typings). */
type TransactionalQueryRunner = {
  isTransactionActive?: boolean;
  databaseConnection?: SqlServerSession | null;
};

/**
 * Runs `work` inside the transaction of `manager` with SQL Server's LOCK_TIMEOUT set to `timeoutMs` for the whole work,
 * so a lock wait longer than that fails with 1222 instead of waiting indefinitely.
 *
 * Why a batch on the transaction connection: TypeORM runs `manager.query()` through mssql `request.query()`, which
 * executes as `sp_executesql`, so a SET inside that call is reverted when the call returns. The SET is therefore sent as
 * a batch on the connection of the transaction itself. `databaseConnection` is the mssql Transaction that
 * SqlServerQueryRunner creates in startTransaction (SqlServerQueryRunner.js:87); every query of the transaction runs on
 * that same connection (SqlServerQueryRunner.js:174), so the timeout applies to all of them.
 *
 * Reset: mssql does not reset session state when a connection goes back to the pool, so `SET LOCK_TIMEOUT -1` (SQL
 * Server's default, no limit) is sent in `finally`. The reset is best effort. If the server already ended the
 * transaction (deadlock victim 1205, or a THROW inside a trigger), mssql has released the connection and the reset fails
 * with ENOTBEGUN; if a request is still pending it fails with EREQINPROG. Either failure is swallowed, so it never masks
 * the outcome of `work`.
 * Residual risk: after such a failure the pooled connection keeps the 5 s ceiling until another critical transaction
 * resets it. A lock wait above 5 s on that connection then returns 409 (retry). No data is affected.
 *
 * Runs under withLockTimeout only inside an active SQL Server transaction; any other manager is refused before `work`
 * runs.
 *
 * @throws Error when `timeoutMs` is not a non-negative integer, or when `manager` has no active SQL Server transaction.
 */
export async function withLockTimeout<T>(
  manager: EntityManager,
  work: (manager: EntityManager) => Promise<T>,
  timeoutMs = CRITICAL_LOCK_TIMEOUT_MS,
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
    throw new Error(`withLockTimeout expects a non-negative integer number of milliseconds, got ${timeoutMs}`);
  }
  const runner = manager.queryRunner as TransactionalQueryRunner | undefined;
  const session = runner?.databaseConnection;
  if (!runner?.isTransactionActive || typeof session?.request !== "function") {
    throw new Error("withLockTimeout must run inside an active SQL Server transaction");
  }
  await session.request().batch(`SET LOCK_TIMEOUT ${timeoutMs};`);
  try {
    return await work(manager);
  } finally {
    try {
      await session.request().batch("SET LOCK_TIMEOUT -1;");
    } catch {
      // Best effort, see the JSDoc above: the outcome of `work` must win over this failure.
    }
  }
}
