import { MigrationInterface, QueryRunner } from "typeorm";

const TOKENS = "N'dbo.vc_reset_tokens'";
const columnId = (column: string) => `COLUMNPROPERTY(OBJECT_ID(${TOKENS}), N'${column}', 'ColumnId')`;
/** Columns whose definition changes (reset_token dropped, user_id and expires_at made NOT NULL). */
const CHANGED_COLUMNS = ["reset_token", "user_id", "expires_at"].map(columnId).join(", ");

/**
 * Password reset tokens stored only as SHA-256 hashes, single-use (used_at) and revocation of JWTs after a
 * password change (vc_users.password_changed_at):
 * - vc_reset_tokens: surrogate key id (pk_vc_reset_tokens), token_hash binary(32) unique, used_at, created_at;
 *   user_id and expires_at become NOT NULL and the plain-text reset_token column is removed.
 * - Existing usable tokens are converted in place (HASHBYTES of the varchar text, equal to SHA-256 of the utf8
 *   text for the hexadecimal tokens issued by the application); unusable rows are deleted.
 * Code and migration ship in the same deploy: the previous code reads reset_token and the new code token_hash.
 */
export class HashedResetTokens1795262400000 implements MigrationInterface {
  name = "HashedResetTokens1795262400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    for (const table of ["vc_reset_tokens", "vc_users"]) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) throw new Error(`Missing dbo.${table}; apply MeasurementsHardening first.`);
    }
    if (!(await queryRunner.hasColumn("dbo.vc_reset_tokens", "reset_token"))) {
      throw new Error("vc_reset_tokens.reset_token is missing; review migration state.");
    }
    for (const column of ["id", "token_hash", "used_at", "created_at"]) {
      if (await queryRunner.hasColumn("dbo.vc_reset_tokens", column)) throw new Error(`vc_reset_tokens.${column} already exists; review migration state.`);
    }
    if (await queryRunner.hasColumn("dbo.vc_users", "password_changed_at")) {
      throw new Error("vc_users.password_changed_at already exists; review migration state.");
    }

    // 1. Preconditions, holding an exclusive table lock until commit so no token is issued or consumed meanwhile.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[vc_reset_tokens] WITH (TABLOCKX, HOLDLOCK);
      IF OBJECT_ID(N'dbo.pk_vc_reset_tokens', N'PK') IS NULL
        OR OBJECT_ID(N'dbo.fk_vc_reset_tokens_user', N'F') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${TOKENS}) AND [name] = N'ix_vc_reset_tokens_user_id')
        THROW 51040, 'pk_vc_reset_tokens, fk_vc_reset_tokens_user or ix_vc_reset_tokens_user_id is missing; review migration state.', 1;
      IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE [object_id] = OBJECT_ID(${TOKENS}) AND [type] > 0
          AND [name] NOT IN (N'pk_vc_reset_tokens', N'ix_vc_reset_tokens_user_id'))
        OR EXISTS (
        SELECT 1 FROM sys.stats_columns sc
        INNER JOIN sys.stats s ON s.[object_id] = sc.[object_id] AND s.[stats_id] = sc.[stats_id]
        WHERE sc.[object_id] = OBJECT_ID(${TOKENS}) AND s.[user_created] = 1 AND sc.[column_id] IN (${CHANGED_COLUMNS}))
        THROW 51041, 'Unexpected indexes or statistics exist on vc_reset_tokens; review them before migrating.', 1;
      IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [referenced_object_id] = OBJECT_ID(${TOKENS}))
        OR EXISTS (SELECT 1 FROM sys.check_constraints WHERE [parent_object_id] = OBJECT_ID(${TOKENS}))
        OR EXISTS (SELECT 1 FROM sys.default_constraints WHERE [parent_object_id] = OBJECT_ID(${TOKENS})
          AND [parent_column_id] IN (${CHANGED_COLUMNS}))
        OR EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [parent_object_id] = OBJECT_ID(${TOKENS})
          AND [name] <> N'fk_vc_reset_tokens_user')
        OR EXISTS (SELECT 1 FROM sys.computed_columns WHERE [object_id] = OBJECT_ID(${TOKENS}))
        OR EXISTS (SELECT 1 FROM sys.sql_expression_dependencies WHERE [referenced_id] = OBJECT_ID(${TOKENS}) AND [is_schema_bound_reference] = 1)
        THROW 51042, 'Unexpected constraints, computed columns or schema-bound objects depend on vc_reset_tokens; review them before migrating.', 1;
      IF OBJECT_ID(N'dbo.uq_vc_reset_tokens_token_hash') IS NOT NULL
        OR OBJECT_ID(N'dbo.df_vc_reset_tokens_id', N'D') IS NOT NULL
        OR OBJECT_ID(N'dbo.df_vc_reset_tokens_created_at', N'D') IS NOT NULL
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${TOKENS}) AND [name] = N'uq_vc_reset_tokens_token_hash')
        THROW 51043, 'Hashed reset token objects already exist; review migration state.', 1;
    `);

    // 2. Unusable rows: no user, orphaned user (no vc_users row; soft-deleted accounts still have one), no expiry,
    //    already expired (UTC, the application clock) or not an issued token. Orphans are verified afterwards.
    await queryRunner.query(`
      DELETE t FROM [dbo].[vc_reset_tokens] t
      WHERE t.[user_id] IS NULL OR t.[expires_at] IS NULL OR t.[expires_at] <= SYSUTCDATETIME()
        OR NOT EXISTS (SELECT 1 FROM [dbo].[vc_users] u WHERE u.[id] = t.[user_id])
        OR DATALENGTH(t.[reset_token]) <> 128
        OR t.[reset_token] COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%';
      IF EXISTS (
        SELECT 1 FROM [dbo].[vc_reset_tokens] t
        WHERE NOT EXISTS (SELECT 1 FROM [dbo].[vc_users] u WHERE u.[id] = t.[user_id]))
        THROW 51044, 'vc_reset_tokens references missing users; the trusted foreign key cannot be recreated.', 1;
    `);

    // 3. New columns. created_at is a UTC instant (the process runs in UTC).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_reset_tokens] ADD
        [id] uniqueidentifier NOT NULL CONSTRAINT [df_vc_reset_tokens_id] DEFAULT NEWSEQUENTIALID(),
        [token_hash] binary(32) NULL,
        [used_at] datetime2 NULL,
        [created_at] datetime2 NOT NULL CONSTRAINT [df_vc_reset_tokens_created_at] DEFAULT SYSUTCDATETIME();
    `);

    // 4. Convert in place (varchar: one byte per hexadecimal character, as the utf8 hash computed by the
    //    application). Tokens lived one hour, so created_at is estimated from expires_at.
    await queryRunner.query(`
      UPDATE [dbo].[vc_reset_tokens]
      SET [token_hash] = HASHBYTES('SHA2_256', CONVERT(varchar(255), [reset_token])),
          [created_at] = CASE WHEN DATEADD(HOUR, -1, [expires_at]) < SYSUTCDATETIME()
                              THEN DATEADD(HOUR, -1, [expires_at]) ELSE SYSUTCDATETIME() END;
    `);

    // 5. Drop the plain-text key and the objects depending on the columns whose nullability changes.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_reset_tokens] DROP CONSTRAINT [fk_vc_reset_tokens_user];
      DROP INDEX [ix_vc_reset_tokens_user_id] ON [dbo].[vc_reset_tokens];
      ALTER TABLE [dbo].[vc_reset_tokens] ALTER COLUMN [user_id] uniqueidentifier NOT NULL;
      ALTER TABLE [dbo].[vc_reset_tokens] ALTER COLUMN [expires_at] datetime2 NOT NULL;
      ALTER TABLE [dbo].[vc_reset_tokens] ALTER COLUMN [token_hash] binary(32) NOT NULL;
      ALTER TABLE [dbo].[vc_reset_tokens] DROP CONSTRAINT [pk_vc_reset_tokens];
      ALTER TABLE [dbo].[vc_reset_tokens] DROP COLUMN [reset_token];
    `);

    // 6. New key, unique hash, user index and trusted foreign key (no cascade: tokens are removed explicitly).
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_reset_tokens] ADD CONSTRAINT [pk_vc_reset_tokens] PRIMARY KEY ([id]);
      CREATE UNIQUE INDEX [uq_vc_reset_tokens_token_hash] ON [dbo].[vc_reset_tokens] ([token_hash]);
      CREATE INDEX [ix_vc_reset_tokens_user_id] ON [dbo].[vc_reset_tokens] ([user_id]);
      ALTER TABLE [dbo].[vc_reset_tokens] WITH CHECK ADD CONSTRAINT [fk_vc_reset_tokens_user]
        FOREIGN KEY ([user_id]) REFERENCES [dbo].[vc_users] ([id]);
    `);

    // 7. JWT revocation: tokens issued in a second before password_changed_at (UTC) are rejected.
    await queryRunner.query(`ALTER TABLE [dbo].[vc_users] ADD [password_changed_at] datetime2 NULL;`);

    // 8. Final verification.
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM [dbo].[vc_reset_tokens] WHERE [token_hash] IS NULL OR DATALENGTH([token_hash]) <> 32)
        THROW 51048, 'vc_reset_tokens has rows without a valid token_hash after conversion.', 1;
      IF COL_LENGTH(N'dbo.vc_reset_tokens', N'reset_token') IS NOT NULL
        OR COLUMNPROPERTY(OBJECT_ID(${TOKENS}), N'token_hash', 'AllowsNull') <> 0
        OR COLUMNPROPERTY(OBJECT_ID(${TOKENS}), N'user_id', 'AllowsNull') <> 0
        OR COLUMNPROPERTY(OBJECT_ID(${TOKENS}), N'expires_at', 'AllowsNull') <> 0
        OR OBJECT_ID(N'dbo.pk_vc_reset_tokens', N'PK') IS NULL
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${TOKENS})
          AND [name] = N'uq_vc_reset_tokens_token_hash' AND [is_unique] = 1)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${TOKENS}) AND [name] = N'ix_vc_reset_tokens_user_id')
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'fk_vc_reset_tokens_user'
          AND [parent_object_id] = OBJECT_ID(${TOKENS}) AND [is_not_trusted] = 0 AND [delete_referential_action] = 0)
        OR COL_LENGTH(N'dbo.vc_users', N'password_changed_at') IS NULL
        THROW 51049, 'vc_reset_tokens or vc_users is not in the expected final state.', 1;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback cannot restore plain-text reset tokens from their hashes. Restore a backup taken before this migration.");
  }
}
