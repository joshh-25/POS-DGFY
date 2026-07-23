import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { assertDestructiveAllowed } from '../safety/destructiveGate.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { loadMigrationTargetManifest } from '../data/targetManifest.js';
import { runDryRunTransformations, DEFAULT_RUN_SCOPE, redactTargetPayload } from '../data/dryRun.js';
import { runApplyTransformations } from '../data/apply.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';

/**
 * Phase 03 Plan 03 (MIG-02, T-03-03-03): real read-only dry-run
 * orchestration. Never destructive (D-09), so assertDestructiveAllowed is
 * not called here, and --confirm-destructive is never required. Ordering
 * preserved from the Phase 1 contract stub: validateEnv() ->
 * assertTargetDbNameAllowed() -> [new] load+validate migration target
 * manifest -> create target/meta connections -> ensureMetadataSchema() ->
 * recordCommandStart() -> [new] run dry-run planner (which opens its own
 * read-only source connections) -> write JSON+summary reports ->
 * recordCommandComplete(). Both new steps happen — and can reject — before
 * any DB connection factory is called.
 *
 * @param {{}} params
 */
export async function runDataDryRun({} = {}) {
  const { valid, errors, config } = validateEnv(process.env, { requireMigrationManifest: true });
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  const manifestResult = await loadMigrationTargetManifest(config.migrationTargetManifestPath);
  if (!manifestResult.valid) {
    throw new EnvValidationError(manifestResult.errors.join('; '));
  }
  const targets = manifestResult.targets;

  let metaSequelize;
  let executionId;

  try {
    createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    executionId = await recordCommandStart(metaSequelize, {
      command: 'data:dry-run',
      mode: 'dry-run',
      argsJson: JSON.stringify({}),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });

    const runScope = DEFAULT_RUN_SCOPE;
    const { entries, summary, tenant_coverage } = await runDryRunTransformations({
      config,
      metaSequelize,
      targets,
      runScope
    });
    const reportSafeEntries = entries.map((entry) => redactTargetPayload(entry));

    const report = {
      generated_at: new Date().toISOString(),
      command: 'data:dry-run',
      mode: 'dry-run',
      run_scope: runScope,
      // Scalar-only (D-16 buildSummaryLine() convention) — detailed
      // per-tenant/entity evidence lives in tenant_coverage/results below,
      // not nested under summary.
      summary: {
        planned_inserts: summary.planned_inserts,
        planned_updates: summary.planned_updates,
        planned_skips: summary.planned_skips,
        planned_conflicts: summary.planned_conflicts,
        orphan_records: summary.orphan_records,
        tenant_coverage_count: summary.tenant_coverage_count
      },
      tenant_coverage,
      results: reportSafeEntries
    };

    const reportJsonPath = await writeJsonReport(config.reportDir, 'data:dry-run', report);
    const reportSummaryPath = await writeSummaryReport(config.reportDir, 'data:dry-run', report, 'success');

    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'success',
      reportJsonPath,
      reportSummaryPath
    });

    return report;
  } catch (error) {
    // executionId can legitimately be 0 — do not treat it as falsy (WR-02).
    if (metaSequelize && executionId !== undefined && executionId !== null) {
      await recordCommandComplete(metaSequelize, executionId, {
        exitStatus: 'failed',
        errorMessage: error.message
      });
    }
    throw error;
  }
}

/**
 * Phase 03 Plan 04 (MIG-03, MIG-04, T-03-04-02): real checkpointed apply
 * orchestration. Always destructive (D-09) — assertDestructiveAllowed is
 * unconditional and runs before any connection factory call, and it is
 * checked before the migration target manifest is even loaded, so a run
 * without `--confirm-destructive` never reads the manifest file or opens
 * any connection. Ordering preserved from the Phase 1 contract stub and
 * mirrored from `runDataDryRun()`: validateEnv() ->
 * assertTargetDbNameAllowed() -> assertDestructiveAllowed() -> load+validate
 * migration target manifest -> create target/meta connections ->
 * ensureMetadataSchema() -> recordCommandStart() -> runApplyTransformations()
 * (which opens its own legacy source + per-tenant business connections) ->
 * write JSON+summary reports -> recordCommandComplete().
 *
 * The apply report and `argsJson` never include `target_payload` or raw
 * mapper output (threat model: "Secret leakage in reports") — only
 * sanitized manifest target identifiers and the report-safe result rows
 * `runApplyTransformations()` itself returns.
 *
 * @param {{ confirmDestructive?: boolean }} params
 */
export async function runDataApply({ confirmDestructive = false } = {}) {
  const { valid, errors, config } = validateEnv(process.env, { requireMigrationManifest: true });
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);
  assertDestructiveAllowed({ isDestructive: true, confirmDestructive, runtimeMode: config.runtimeMode });

  const manifestResult = await loadMigrationTargetManifest(config.migrationTargetManifestPath);
  if (!manifestResult.valid) {
    throw new EnvValidationError(manifestResult.errors.join('; '));
  }
  const targets = manifestResult.targets;

  let metaSequelize;
  let executionId;

  try {
    const coreSequelize = createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    executionId = await recordCommandStart(metaSequelize, {
      command: 'data:apply',
      mode: 'apply',
      // Sanitized manifest identifiers only — never db credentials or
      // company_token.
      argsJson: JSON.stringify({
        confirmDestructive,
        legacy_tenant_ids: targets.map((target) => target.legacy_tenant_id),
        target_business_db_names: targets.map((target) => target.target_business_db_name)
      }),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });

    const runScope = DEFAULT_RUN_SCOPE;
    const { summary, results } = await runApplyTransformations({
      config,
      metaSequelize,
      coreSequelize,
      targets,
      runScope
    });

    const report = {
      generated_at: new Date().toISOString(),
      command: 'data:apply',
      mode: 'apply',
      run_scope: runScope,
      summary,
      results
    };

    const reportJsonPath = await writeJsonReport(config.reportDir, 'data:apply', report);
    const reportSummaryPath = await writeSummaryReport(config.reportDir, 'data:apply', report, 'success');

    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'success',
      reportJsonPath,
      reportSummaryPath
    });

    return report;
  } catch (error) {
    // executionId can legitimately be 0 — do not treat it as falsy (WR-02).
    if (metaSequelize && executionId !== undefined && executionId !== null) {
      await recordCommandComplete(metaSequelize, executionId, {
        exitStatus: 'failed',
        errorMessage: error.message
      });
    }
    throw error;
  }
}
