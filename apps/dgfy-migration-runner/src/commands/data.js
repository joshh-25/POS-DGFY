import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { assertDestructiveAllowed } from '../safety/destructiveGate.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';

/**
 * Phase 1 contract stub proving dry-run gating/reporting only — real
 * source-to-target transformation logic ships in Phase 3. Never destructive
 * (D-09), so assertDestructiveAllowed is not called here.
 *
 * @param {{}} params
 */
export async function runDataDryRun({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

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

    const report = {
      generated_at: new Date().toISOString(),
      command: 'data:dry-run',
      mode: 'dry-run',
      summary: {
        planned_inserts: 0,
        planned_updates: 0,
        planned_skips: 0,
        planned_conflicts: 0,
        orphan_records: 0,
        tenant_coverage: []
      },
      results: [],
      note: 'Phase 1 contract stub proving dry-run gating/reporting only — real source-to-target transformation logic ships in Phase 3'
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
 * Phase 1 contract stub proving apply gating/reporting only — real data
 * writes ship in Phase 3. Always destructive (D-09) — assertDestructiveAllowed
 * is unconditional and runs before any connection factory call.
 *
 * @param {{ confirmDestructive?: boolean }} params
 */
export async function runDataApply({ confirmDestructive = false } = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);
  assertDestructiveAllowed({ isDestructive: true, confirmDestructive, runtimeMode: config.runtimeMode });

  let metaSequelize;
  let executionId;

  try {
    createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    executionId = await recordCommandStart(metaSequelize, {
      command: 'data:apply',
      mode: 'apply',
      argsJson: JSON.stringify({ confirmDestructive }),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });

    const report = {
      generated_at: new Date().toISOString(),
      command: 'data:apply',
      mode: 'apply',
      summary: {
        rows_written: 0
      },
      results: [],
      note: 'Phase 1 contract stub proving apply gating/reporting only — real data writes ship in Phase 3'
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
