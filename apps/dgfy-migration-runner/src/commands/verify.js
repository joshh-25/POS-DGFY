import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';

/**
 * Runs metadata schema and target DB connectivity checks. Unlike the other
 * command handlers, verify() always completes and reports findings — a
 * failed check flips the corresponding summary boolean to false instead of
 * throwing.
 *
 * @param {{}} params
 */
export async function runVerify({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  const targetSequelize = createTargetConnection(config);
  const metaSequelize = createMetaConnection(config);

  let metadataSchemaOk = true;
  try {
    await ensureMetadataSchema(metaSequelize);
  } catch (error) {
    metadataSchemaOk = false;
  }

  let targetDbReachable = true;
  try {
    await targetSequelize.authenticate();
  } catch (error) {
    targetDbReachable = false;
  }

  const executionId = await recordCommandStart(metaSequelize, {
    command: 'verify',
    mode: 'verify',
    argsJson: JSON.stringify({}),
    actor: config.actor,
    runtimeMode: config.runtimeMode
  });

  const report = {
    generated_at: new Date().toISOString(),
    command: 'verify',
    summary: {
      metadata_schema_ok: metadataSchemaOk,
      target_db_reachable: targetDbReachable,
      target_db_name: config.targetDb.name
    }
  };

  const reportJsonPath = await writeJsonReport(config.reportDir, 'verify', report);
  const reportSummaryPath = await writeSummaryReport(config.reportDir, 'verify', report);

  await recordCommandComplete(metaSequelize, executionId, {
    exitStatus: 'success',
    reportJsonPath,
    reportSummaryPath
  });

  return report;
}
