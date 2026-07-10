import { readdirSync } from 'fs';
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
 * Lists every `.cjs` migration file under MIGRATIONS_DIR via a plain
 * filesystem read (no Umzug, no DB). This is used to compute the D-09
 * destructive-op gate BEFORE any DB connection factory is called — Umzug's
 * own `pending()` can't be used for that check because its storage is
 * backed by the meta DB connection, which must not be created yet.
 */
function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.cjs'))
    .sort()
    .map((file) => join(MIGRATIONS_DIR, file));
}

function resolveMigration({ name, path, context }) {
  const migration = requireCjs(path);
  return {
    name,
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

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  // Per-migration-file destructive check (D-09): computed from the files on
  // disk, before any target/meta connection factory is invoked.
  const isDestructive = listMigrationFiles().some((path) => requireCjs(path).meta?.destructive === true);
  assertDestructiveAllowed({ isDestructive, confirmDestructive, runtimeMode: config.runtimeMode });

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
