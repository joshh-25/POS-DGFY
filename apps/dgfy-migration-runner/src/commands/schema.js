import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import { Umzug } from 'umzug';

import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { assertDestructiveAllowed } from '../safety/destructiveGate.js';
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
 * D-17: destructive classification is pending-only. Rather than re-scanning
 * the filesystem (the WR-04 all-file scan this replaces), the `meta` field
 * each migration module exports is carried through from `resolveMigration`
 * onto the object Umzug returns from `pending()` — so this check only ever
 * looks at migrations that are actually pending, using the modules Umzug
 * already loaded. A historical migration that has already executed (and is
 * therefore absent from `pending()`) can never force --confirm-destructive
 * for unrelated future additive work.
 */
function isPendingMigrationDestructive(pendingMigrations) {
  return pendingMigrations.some((migration) => migration.meta?.destructive === true);
}

function resolveMigration({ name, path, context }) {
  const migration = requireCjs(path);
  return {
    name,
    meta: migration.meta,
    up: async () => migration.up(context, Sequelize),
    down: async () => migration.down(context, Sequelize)
  };
}

/**
 * Drives the placeholder schema migration through Umzug end-to-end.
 * Follows validate -> guard -> connect -> bootstrap -> record -> report.
 *
 * @param {{ confirmDestructive?: boolean }} params
 */
export async function runSchemaMigrate({ confirmDestructive = false } = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  // D-16/D-17: target DB name validation still happens before any connection
  // and before any target mutation, regardless of destructive classification.
  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  let metaSequelize;
  let executionId;

  try {
    const targetSequelize = createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    const umzug = new Umzug({
      migrations: {
        glob: join(MIGRATIONS_DIR, '*.cjs'),
        resolve: resolveMigration
      },
      context: targetSequelize.getQueryInterface(),
      storage: new MetaSequelizeStorage({ sequelize: metaSequelize }),
      logger: undefined
    });

    const pendingMigrations = await umzug.pending();

    // D-17: pending-only destructive gate — computed after metadata
    // bootstrap and Umzug pending resolution, using only pending migration
    // modules, and still enforced before any target mutation (umzug.up()).
    const isDestructive = isPendingMigrationDestructive(pendingMigrations);
    assertDestructiveAllowed({ isDestructive, confirmDestructive, runtimeMode: config.runtimeMode });

    const mode = confirmDestructive ? 'apply-destructive' : 'apply';
    executionId = await recordCommandStart(metaSequelize, {
      command: 'schema:migrate',
      mode,
      argsJson: JSON.stringify({ confirmDestructive }),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });

    const executed = await umzug.up();

    const report = {
      generated_at: new Date().toISOString(),
      command: 'schema:migrate',
      mode,
      migrations_executed: executed.map((migration) => migration.name),
      summary: {
        total_pending: pendingMigrations.length,
        executed: executed.length
      }
    };

    const reportJsonPath = await writeJsonReport(config.reportDir, 'schema:migrate', report);
    const reportSummaryPath = await writeSummaryReport(config.reportDir, 'schema:migrate', report, 'success');

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
