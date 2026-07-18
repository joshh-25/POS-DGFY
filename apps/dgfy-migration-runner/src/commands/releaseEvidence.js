import { checkbox } from '@inquirer/prompts';

import { validateEnv } from '../config/env.js';
import {
  createTargetConnection,
  createMetaConnection,
  createBusinessTargetConnection
} from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';
import { dgfyBusinessContract } from '../schemaContracts/dgfyBusinessContract.js';
import { checkContractSchema, checkMigrationMetadata } from './verify.js';
import { resolveTargetKind } from './schema.js';

/**
 * SC2/D-02/D-03: interactive, on-demand release-evidence command.
 *
 * Discovers active tenants live from `dgfy_core.business_database_registry`
 * (JOIN businesses), lets the operator explicitly check which of those
 * tenants this run targets (never auto-selecting "all tenants" — Pitfall 4),
 * then for each selected tenant produces TWO distinct, correctly-sourced
 * evidence reports:
 *   - tenant_drift: schema-conformance findings from verify.js's exported
 *     checkContractSchema() (reused drift engine — zero duplication).
 *   - migration_verification: applied-migration/idempotency findings from
 *     verify.js's exported checkMigrationMetadata() reading the
 *     dgfy_migration_meta ledger (reused migration-ledger engine — a
 *     genuinely different data source from drift, per RESEARCH
 *     Architectural Responsibility Map).
 *
 * Fails closed (RUN-03/Pitfall 3): env-validate-before-connect, then a TTY
 * guard BEFORE prompting (Pitfall 4) — a non-interactive invocation throws
 * rather than silently defaulting to "select every active tenant", which
 * would reintroduce the auto-discovery model D-02 explicitly rejects.
 *
 * @param {{ evidenceDir?: string }} params
 */
export async function runReleaseEvidence({ evidenceDir } = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  const reportDir = evidenceDir || config.reportDir;

  const targetSequelize = createTargetConnection(config);
  let metaSequelize;
  const businessConnections = [];

  try {
    // D-02: live tenant discovery — registry lives in dgfy_core (the
    // primary target connection), joined to businesses for a
    // human-readable label. Only active, verified tenants are eligible —
    // test-only/provisioning/deprecated businesses never surface here.
    const [rows] = await targetSequelize.query(
      `SELECT r.business_id, r.database_name, r.status, r.verified_at,
              b.display_name, b.business_handle
       FROM business_database_registry r
       JOIN businesses b ON b.id = r.business_id
       WHERE r.status = 'active' AND r.verified_at IS NOT NULL
       ORDER BY b.display_name`
    );
    const activeTenants = rows || [];

    if (activeTenants.length === 0) {
      const emptyReport = {
        generated_at: new Date().toISOString(),
        command: 'release-evidence',
        selected: [],
        no_targets: true,
        reason: 'No active, verified tenants found in business_database_registry — nothing to select.'
      };
      const reportJsonPath = await writeJsonReport(reportDir, 'release-evidence', emptyReport);
      const reportSummaryPath = await writeSummaryReport(reportDir, 'release-evidence', emptyReport, 'success');
      return {
        selected: [],
        no_targets: true,
        reports: { release_evidence: { json: reportJsonPath, summary: reportSummaryPath } },
        ok: true
      };
    }

    // D-03/Pitfall 4: TTY guard BEFORE prompting. Never silently fall back
    // to selecting all tenants — that reintroduces the auto-discovery model
    // D-02 forbids.
    if (!process.stdin.isTTY) {
      throw new Error(
        'release-evidence tenant selection requires an interactive terminal (non-TTY stdin detected) — '
        + 'refusing to fall back to an all-tenants run.'
      );
    }

    const selected = await checkbox({
      message: 'Select tenants to include in this release-evidence run:',
      choices: activeTenants.map((tenant) => ({
        name: `${tenant.display_name} (${tenant.database_name}) [${tenant.status}]`,
        value: tenant.database_name
      }))
    });

    const businessIdByDatabaseName = new Map(
      activeTenants.map((tenant) => [tenant.database_name, tenant.business_id])
    );

    // 5b setup: one shared metadata connection for the migration-ledger
    // engine — the ledger (dgfy_migration_meta) is a single meta database
    // keyed per targetDatabase, exactly as runVerify() does it.
    metaSequelize = createMetaConnection(config);

    const driftResults = [];
    const migrationResults = [];

    for (const databaseName of selected) {
      // 5a: per-tenant DRIFT evidence (schema-conformance engine).
      // eslint-disable-next-line no-await-in-loop
      let driftResult;
      try {
        const businessSequelize = createBusinessTargetConnection(config, databaseName);
        businessConnections.push(businessSequelize);
        // eslint-disable-next-line no-await-in-loop
        driftResult = await checkContractSchema({
          connection: businessSequelize,
          databaseName,
          contract: dgfyBusinessContract
        });
      } catch (error) {
        driftResult = {
          database: databaseName,
          ok: false,
          tables: [],
          rejected_tables_present: [],
          error: error?.message || String(error)
        };
      }
      driftResults.push(driftResult);

      // 5b: per-tenant MIGRATION-VERIFICATION evidence (dgfy_migration_meta
      // ledger engine) — a genuinely different data source from drift.
      // Wrapped independently so a metadata-store failure never gets
      // relabeled as a drift result.
      let migrationResult;
      try {
        // eslint-disable-next-line no-await-in-loop
        migrationResult = await checkMigrationMetadata(
          metaSequelize,
          resolveTargetKind(databaseName),
          databaseName
        );
      } catch (error) {
        migrationResult = {
          target_database: databaseName,
          kind: resolveTargetKind(databaseName),
          ok: false,
          expected_migrations: [],
          executed_migrations: [],
          missing_migrations: null,
          error: error?.message || String(error)
        };
      }
      migrationResults.push(migrationResult);
    }

    const selectedDetail = selected.map((databaseName) => ({
      database_name: databaseName,
      business_id: businessIdByDatabaseName.get(databaseName) ?? null
    }));

    const tenantDriftReport = {
      generated_at: new Date().toISOString(),
      command: 'tenant-drift',
      selected: selectedDetail,
      results: driftResults,
      summary: {
        target_count: driftResults.length,
        ok: driftResults.every((result) => result.ok)
      }
    };

    const migrationVerificationReport = {
      generated_at: new Date().toISOString(),
      command: 'migration-verification',
      selected: selectedDetail,
      results: migrationResults,
      summary: {
        target_count: migrationResults.length,
        ok: migrationResults.every((result) => result.ok)
      }
    };

    // RUN-05/no-secrets: reuse the existing report writers. Reports carry
    // only database names, business_id, table names, migration names,
    // counts, checksums, timestamps, and booleans — never
    // host/user/password/DSN/token/credential values.
    const tenantDriftJsonPath = await writeJsonReport(reportDir, 'tenant_drift', tenantDriftReport);
    const tenantDriftSummaryPath = await writeSummaryReport(reportDir, 'tenant_drift', tenantDriftReport, 'success');
    const migrationVerificationJsonPath = await writeJsonReport(
      reportDir,
      'migration_verification',
      migrationVerificationReport
    );
    const migrationVerificationSummaryPath = await writeSummaryReport(
      reportDir,
      'migration_verification',
      migrationVerificationReport,
      'success'
    );

    return {
      selected: selectedDetail,
      reports: {
        tenant_drift: { json: tenantDriftJsonPath, summary: tenantDriftSummaryPath },
        migration_verification: { json: migrationVerificationJsonPath, summary: migrationVerificationSummaryPath }
      },
      ok: tenantDriftReport.summary.ok && migrationVerificationReport.summary.ok
    };
  } finally {
    if (metaSequelize) {
      await metaSequelize.close();
    }
    for (const businessSequelize of businessConnections) {
      // eslint-disable-next-line no-await-in-loop
      await businessSequelize.close();
    }
    await targetSequelize.close();
  }
}

export default { runReleaseEvidence };
