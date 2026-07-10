import { createRequire } from 'module';
import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import { Umzug } from 'umzug';

import { validateEnv, BUSINESS_DB_NAME_PATTERN } from '../config/env.js';
import { createTargetConnection, createMetaConnection, createBusinessTargetConnection } from '../config/db.js';
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

/**
 * Plan 03 (D-02/D-15, Task 2): every schema migration file under
 * src/migrations/schema declares (or implicitly defaults to) which target
 * kind it belongs to via `meta.targetKind` — 'core' (dgfy_core and any
 * non-business target; the default when a migration module omits the
 * field, preserving Phase 1/Plan 02 migrations unchanged) or 'business'
 * (dgfy_business_* foundation migrations). This keeps core and business
 * foundation migrations physically alongside each other in the same
 * directory (matching the plan's file layout) while guaranteeing a
 * business-only migration can never run against dgfy_core, and vice versa.
 */
function resolveTargetKind(databaseName) {
  return BUSINESS_DB_NAME_PATTERN.test(databaseName) ? 'business' : 'core';
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.cjs'))
    .sort();
}

/**
 * Builds the Umzug-ready migration list for exactly one target kind,
 * resolved against the given context (the target database's QueryInterface).
 * Filtering happens here — before any migration is even considered pending —
 * so a dgfy_business_* foundation migration is structurally excluded from a
 * dgfy_core run's pending/executed state, and vice versa.
 */
function buildMigrationsForKind(kind, context) {
  return listMigrationFiles()
    .map((file) => {
      const path = join(MIGRATIONS_DIR, file);
      const migration = requireCjs(path);
      return { file, migration };
    })
    .filter(({ migration }) => (migration.meta?.targetKind || 'core') === kind)
    .map(({ file, migration }) => ({
      name: file,
      meta: migration.meta,
      up: async () => migration.up(context, Sequelize),
      down: async () => migration.down(context, Sequelize)
    }));
}

function buildUmzugForTarget({ kind, context, metaSequelize, targetDatabase }) {
  return new Umzug({
    migrations: buildMigrationsForKind(kind, context),
    context,
    storage: new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase }),
    logger: undefined
  });
}

/**
 * Drives schema migrations through Umzug end-to-end for the primary
 * TARGET_DB_NAME target and, when configured, every explicit
 * DGFY_BUSINESS_DB_NAMES business database target (Plan 03 D-02/D-08).
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
  const businessDbNames = config.businessDbNames || [];
  businessDbNames.forEach((name) => assertTargetDbNameAllowed(name, config.runtimeMode));

  let metaSequelize;
  let executionId;

  try {
    const primaryTargetSequelize = createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    const primaryUmzug = buildUmzugForTarget({
      kind: resolveTargetKind(config.targetDb.name),
      context: primaryTargetSequelize.getQueryInterface(),
      metaSequelize,
      targetDatabase: config.targetDb.name
    });
    const primaryPending = await primaryUmzug.pending();

    // Plan 03 (D-02/D-08): deterministic order — the order names were
    // declared in DGFY_BUSINESS_DB_NAMES — and skip a name that duplicates
    // the primary target (already handled above).
    const businessRuns = businessDbNames
      .filter((name) => name !== config.targetDb.name)
      .map((name) => {
        const businessSequelize = createBusinessTargetConnection(config, name);
        const umzug = buildUmzugForTarget({
          kind: 'business',
          context: businessSequelize.getQueryInterface(),
          metaSequelize,
          targetDatabase: name
        });
        return { name, umzug };
      });

    const businessPendingByName = [];
    for (const run of businessRuns) {
      // eslint-disable-next-line no-await-in-loop
      businessPendingByName.push({ name: run.name, pending: await run.umzug.pending() });
    }

    // D-17: pending-only destructive gate — computed after metadata
    // bootstrap and Umzug pending resolution across every target (primary
    // plus every business target), and still enforced before any target
    // mutation (before any umzug.up() call).
    const isDestructive = isPendingMigrationDestructive(primaryPending)
      || businessPendingByName.some(({ pending }) => isPendingMigrationDestructive(pending));
    assertDestructiveAllowed({ isDestructive, confirmDestructive, runtimeMode: config.runtimeMode });

    const mode = confirmDestructive ? 'apply-destructive' : 'apply';
    executionId = await recordCommandStart(metaSequelize, {
      command: 'schema:migrate',
      mode,
      argsJson: JSON.stringify({ confirmDestructive, businessDbNames }),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });

    const primaryExecuted = await primaryUmzug.up();

    const businessTargets = [];
    for (const run of businessRuns) {
      // eslint-disable-next-line no-await-in-loop
      const executed = await run.umzug.up();
      businessTargets.push({
        database: run.name,
        migrations_executed: executed.map((migration) => migration.name)
      });
    }

    const totalBusinessPending = businessPendingByName.reduce((sum, { pending }) => sum + pending.length, 0);
    const totalBusinessExecuted = businessTargets.reduce((sum, target) => sum + target.migrations_executed.length, 0);

    const report = {
      generated_at: new Date().toISOString(),
      command: 'schema:migrate',
      mode,
      // Information disclosure (T-02-03-05): database names only, never
      // credentials.
      target_database: config.targetDb.name,
      migrations_executed: primaryExecuted.map((migration) => migration.name),
      business_targets: businessTargets,
      summary: {
        total_pending: primaryPending.length + totalBusinessPending,
        executed: primaryExecuted.length + totalBusinessExecuted
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
