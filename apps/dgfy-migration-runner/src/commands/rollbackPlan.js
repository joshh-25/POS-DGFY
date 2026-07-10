import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { validateEnv } from '../config/env.js';
import { createMetaConnection } from '../config/db.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { MetaSequelizeStorage } from '../metadata/storage.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';

const requireCjs = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations', 'schema');

/**
 * Generates a rollback-plan report artifact (D-14) — reads each executed
 * migration's static meta.rollbackDescription/meta.estimatedRisk fields.
 * Per D-14, this function must NEVER call any migration's down().
 *
 * @param {{}} params
 */
export async function runRollbackPlan({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  const metaSequelize = createMetaConnection(config);
  await ensureMetadataSchema(metaSequelize);

  const executionId = await recordCommandStart(metaSequelize, {
    command: 'rollback-plan',
    mode: 'report',
    argsJson: JSON.stringify({}),
    actor: config.actor,
    runtimeMode: config.runtimeMode
  });

  try {
    const storage = new MetaSequelizeStorage({ sequelize: metaSequelize });
    const executedNames = await storage.executed();

    const entries = executedNames.map((name) => {
      const migrationPath = join(MIGRATIONS_DIR, name);
      const migration = requireCjs(migrationPath);
      return {
        name,
        rollbackDescription: migration.meta?.rollbackDescription || null,
        estimatedRisk: migration.meta?.estimatedRisk || null
      };
    });

    const report = {
      generated_at: new Date().toISOString(),
      command: 'rollback-plan',
      summary: {
        migrations_covered: entries.length
      },
      results: entries.map((entry) => ({
        migration: entry.name,
        rollback_description: entry.rollbackDescription,
        estimated_risk: entry.estimatedRisk
      }))
    };

    const reportJsonPath = await writeJsonReport(config.reportDir, 'rollback-plan', report);
    const reportSummaryPath = await writeSummaryReport(config.reportDir, 'rollback-plan', report, 'success');

    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'success',
      reportJsonPath,
      reportSummaryPath
    });

    return report;
  } catch (error) {
    // executionId can legitimately be 0 — do not treat it as falsy (WR-02).
    if (executionId !== undefined && executionId !== null) {
      await recordCommandComplete(metaSequelize, executionId, {
        exitStatus: 'failed',
        errorMessage: error.message
      });
    }
    throw error;
  }
}
