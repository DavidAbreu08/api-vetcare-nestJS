import { MigrationInterface, QueryRunner } from "typeorm";

const VISITS = "N'dbo.vc_clinical_visits'";

/**
 * Integrity of clinical visits:
 * - uq_vc_clinical_visits_animal_in_progress: at most one IN_PROGRESS visit per animal (filtered unique index).
 * - completed_by (FK vc_users, NULL, ix_vc_clinical_visits_completed_by): author of the completion, written by the
 *   application from this release on. No CHECK "COMPLETED => completed_by NOT NULL": visits completed before this
 *   migration have no known author (a trusted CHECK would fail and an untrusted WITH NOCHECK one would hide them);
 *   the rule is enforced by the application only.
 * - ck_vc_clinical_visits_voided_dates: voided_at IS NULL OR voided_at >= started_at.
 * - Setting VETERINARIAN_JOB_TITLE_ID (vc_system_settings, seed id ...0006): the job title whose holders approve animal
 *   data. Seeded with the active job title of code VETERINARIAN (seeded by UserRolesAndEmployees) when it exists;
 *   otherwise NULL, which the application reads as "no veterinarian configured" (only administrators approve) until
 *   an administrator points it to a job title through /api/system-settings.
 * Additive: no data is converted. Other lifecycle rules of this release (open reservations blocking termination,
 * deactivation and deletion) are application rules and need no schema change.
 */
export class IntegrityAndLifecycle1795348800000 implements MigrationInterface {
  name = "IntegrityAndLifecycle1795348800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) throw new Error("Run this migration in a transaction (TypeORM --transaction all).");
    // Each required table and the migration that creates it.
    const origins: Record<string, string> = {
      vc_users: "UserRolesAndEmployees", vc_system_settings: "UserRolesAndEmployees", vc_job_titles: "UserRolesAndEmployees",
      vc_clinical_visits: "ReservationsAndClinicalVisits",
    };
    for (const [table, migration] of Object.entries(origins)) {
      if (!(await queryRunner.hasTable(`dbo.${table}`))) {
        throw new Error(`Missing dbo.${table} (created by ${migration}); apply the earlier migrations up to HashedResetTokens first.`);
      }
    }
    if (await queryRunner.hasColumn("dbo.vc_clinical_visits", "completed_by")) {
      throw new Error("vc_clinical_visits.completed_by already exists; review migration state.");
    }

    // 1. Filtered indexes need ANSI_NULLS and QUOTED_IDENTIFIER ON in the creating session (the mssql driver sets
    //    both; set again for tools that do not).
    await queryRunner.query(`SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`);
    await queryRunner.query(`
      IF SESSIONPROPERTY('ANSI_NULLS') <> 1 OR SESSIONPROPERTY('QUOTED_IDENTIFIER') <> 1
        THROW 51050, 'ANSI_NULLS and QUOTED_IDENTIFIER must be ON to create the filtered unique index.', 1;
    `);

    // 2. Preconditions, holding an exclusive table lock until commit so no offending visit appears meanwhile.
    //    No data is normalized automatically: duplicates and inconsistent dates need a clinical decision.
    await queryRunner.query(`
      DECLARE @locked int;
      SELECT @locked = COUNT(*) FROM [dbo].[vc_clinical_visits] WITH (TABLOCKX, HOLDLOCK);
      IF OBJECT_ID(N'dbo.fk_vc_clinical_visits_completed_by', N'F') IS NOT NULL
        OR OBJECT_ID(N'dbo.ck_vc_clinical_visits_voided_dates', N'C') IS NOT NULL
        OR EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${VISITS})
          AND [name] IN (N'uq_vc_clinical_visits_animal_in_progress', N'ix_vc_clinical_visits_completed_by'))
        THROW 51051, 'Integrity and lifecycle objects already exist on vc_clinical_visits; review migration state.', 1;
      IF EXISTS (
        SELECT 1 FROM [dbo].[vc_clinical_visits] WHERE [status] = N'IN_PROGRESS'
        GROUP BY [animal_id] HAVING COUNT(*) > 1)
        THROW 51052, 'Some animals have more than one IN_PROGRESS clinical visit; complete or void the extra visits before migrating.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_clinical_visits] WHERE [voided_at] IS NOT NULL AND [voided_at] < [started_at])
        THROW 51053, 'vc_clinical_visits has rows voided before they started; correct voided_at before migrating.', 1;
      IF EXISTS (SELECT 1 FROM [dbo].[vc_system_settings] WITH (UPDLOCK, HOLDLOCK)
        WHERE [code] = 'VETERINARIAN_JOB_TITLE_ID' OR [id] = '40000000-0000-4000-8000-000000000006')
        THROW 51054, 'The VETERINARIAN_JOB_TITLE_ID setting or its seed id already exists; review migration state.', 1;
    `);

    // 3. Author of the completion (NULL for visits completed before this release).
    await queryRunner.query(`ALTER TABLE [dbo].[vc_clinical_visits] ADD [completed_by] uniqueidentifier NULL;`);

    // 4. Compile references to the new column after ADD. Trusted constraints (WITH CHECK), no cascade.
    await queryRunner.query(`
      ALTER TABLE [dbo].[vc_clinical_visits] WITH CHECK ADD
        CONSTRAINT [fk_vc_clinical_visits_completed_by] FOREIGN KEY ([completed_by]) REFERENCES [dbo].[vc_users] ([id]),
        CONSTRAINT [ck_vc_clinical_visits_voided_dates] CHECK ([voided_at] IS NULL OR [voided_at] >= [started_at]);
      CREATE INDEX [ix_vc_clinical_visits_completed_by] ON [dbo].[vc_clinical_visits] ([completed_by]);
      CREATE UNIQUE INDEX [uq_vc_clinical_visits_animal_in_progress] ON [dbo].[vc_clinical_visits] ([animal_id])
        WHERE [status] = N'IN_PROGRESS';
    `);

    // 5. Veterinarian qualification setting, same seeding method as the *_ROLE_ID settings (fixed id, lowercase UUID
    //    text). The job-title row is read with HOLDLOCK so it cannot be deactivated before commit.
    await queryRunner.query(`
      INSERT INTO [dbo].[vc_system_settings] ([id], [code], [value], [description])
      SELECT '40000000-0000-4000-8000-000000000006', 'VETERINARIAN_JOB_TITLE_ID',
        (SELECT LOWER(CONVERT(nvarchar(36), jt.[id])) FROM [dbo].[vc_job_titles] jt WITH (UPDLOCK, HOLDLOCK)
          WHERE jt.[code] = 'VETERINARIAN' AND jt.[is_active] = 1),
        N'Job title whose active employees approve animal data (species/breed changes, verification); empty = administrators only.';
    `);

    // 6. Final verification.
    await queryRunner.query(`
      IF COL_LENGTH(N'dbo.vc_clinical_visits', N'completed_by') IS NULL
        OR COLUMNPROPERTY(OBJECT_ID(${VISITS}), N'completed_by', 'AllowsNull') <> 1
        OR NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'fk_vc_clinical_visits_completed_by'
          AND [parent_object_id] = OBJECT_ID(${VISITS}) AND [is_not_trusted] = 0 AND [delete_referential_action] = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE [name] = N'ck_vc_clinical_visits_voided_dates'
          AND [parent_object_id] = OBJECT_ID(${VISITS}) AND [is_not_trusted] = 0)
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${VISITS})
          AND [name] = N'ix_vc_clinical_visits_completed_by')
        OR NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [object_id] = OBJECT_ID(${VISITS})
          AND [name] = N'uq_vc_clinical_visits_animal_in_progress' AND [is_unique] = 1 AND [has_filter] = 1)
        OR NOT EXISTS (SELECT 1 FROM [dbo].[vc_system_settings] WHERE [code] = 'VETERINARIAN_JOB_TITLE_ID')
        THROW 51059, 'vc_clinical_visits or vc_system_settings is not in the expected final state.', 1;
    `);
  }

  async down(): Promise<void> {
    throw new Error("Rollback would discard the completion authors (completed_by) of clinical visits and the VETERINARIAN_JOB_TITLE_ID setting. Restore a backup taken before this migration.");
  }
}
