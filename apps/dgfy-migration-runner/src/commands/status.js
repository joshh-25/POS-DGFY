import { validateEnv } from '../config/env.js';
import { createMetaConnection } from '../config/db.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { MetaSequelizeStorage } from '../metadata/storage.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';

/**
 * Shows recent command execution history and schema migration status.
 *
 * @param {{}} params
 */
export async function runStatus({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  const metaSequelize = createMetaConnection(config);
  await ensureMetadataSchema(metaSequelize);

  const executionId = await recordCommandStart(metaSequelize, {
    command: 'status',
    mode: 'status',
    argsJson: JSON.stringify({}),
    actor: config.actor,
    runtimeMode: config.runtimeMode
  });

  const [rows] = await metaSequelize.query(
    'SELECT command, mode, actor, runtime_mode, started_at, completed_at, exit_status FROM command_executions ORDER BY started_at DESC LIMIT 20'
  );

  const storage = new MetaSequelizeStorage({ sequelize: metaSequelize });
  const executedNames = await storage.executed();

  const report = {
    generated_at: new Date().toISOString(),
    command: 'status',
    summary: {
      recent_commands: rows.length,
      schema_migrations_executed: executedNames.length
    },
    results: rows
  };

  const reportJsonPath = await writeJsonReport(config.reportDir, 'status', report);
  const reportSummaryPath = await writeSummaryReport(config.reportDir, 'status', report, 'success');

  await recordCommandComplete(metaSequelize, executionId, {
    exitStatus: 'success',
    reportJsonPath,
    reportSummaryPath
  });

  return report;
}
