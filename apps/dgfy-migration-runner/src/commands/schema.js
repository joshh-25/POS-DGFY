import { createRequire } from 'module';
import { readdirSync, promises as fsPromises } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import { Umzug } from 'umzug';

import { validateEnv, BUSINESS_DB_NAME_PATTERN } from '../config/env.js';
import {
  createTargetConnection,
  createMetaConnection,
  createBusinessTargetConnection,
  createSourceConnection
} from '../config/db.js';
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
 * D-23: filename of the durable pre-migration legacy/current sku_* schema
 * fingerprint baseline artifact, written once under config.reportDir by
 * ensureLegacyFingerprintBaseline() and read back by verify.js's
 * legacy_non_mutation check. A fixed, well-known filename (rather than a
 * timestamped report-style name) so verify.js can locate it deterministically
 * without scanning the report directory.
 */
export const LEGACY_FINGERPRINT_ARTIFACT_NAME = 'legacy-fingerprint-baseline.json';

/**
 * D-23: computes an information_schema-based structural fingerprint (tables/
 * columns/indexes/constraints) of the legacy/current schema `legacyDbName` on
 * the given (read-only use) Sequelize connection. Exported so verify.js can
 * compute the exact same shape for baseline-vs-current comparison — the
 * fingerprint shape must match exactly on both sides for the comparison to
 * mean anything.
 */
export async function computeLegacySchemaFingerprint(sourceSequelize, legacyDbName) {
  const [columns] = await sourceSequelize.query(
    `SELECT table_name, column_name, column_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = ?
     ORDER BY table_name, ordinal_position`,
    { replacements: [legacyDbName] }
  );
  const [indexes] = await sourceSequelize.query(
    `SELECT table_name, index_name, non_unique, column_name, seq_in_index
     FROM information_schema.statistics
     WHERE table_schema = ?
     ORDER BY table_name, index_name, seq_in_index`,
    { replacements: [legacyDbName] }
  );
  const [constraints] = await sourceSequelize.query(
    `SELECT table_name, constraint_name, constraint_type
     FROM information_schema.table_constraints
     WHERE table_schema = ?
     ORDER BY table_name, constraint_name`,
    { replacements: [legacyDbName] }
  );
  return { columns, indexes, constraints };
}

/**
 * D-23: captures a durable pre-migration information_schema fingerprint of
 * the legacy/current schema (config.sourceDb.name) the FIRST time schema
 * migrate ever runs, and persists it as a JSON artifact under
 * config.reportDir. Never overwrites an existing baseline on later reruns —
 * D-23's non-mutation proof depends on comparing against the original
 * pre-any-DGFY-migration state, not a moving snapshot. Read-only against the
 * source connection; never mutates legacy schemas.
 */
export async function ensureLegacyFingerprintBaseline(config) {
  const baselinePath = join(config.reportDir, LEGACY_FINGERPRINT_ARTIFACT_NAME);

  try {
    await fsPromises.access(baselinePath);
    return { path: baselinePath, captured: false };
  } catch (error) {
    // Missing (or otherwise unreadable) — fall through and capture it now.
  }

  const sourceSequelize = createSourceConnection(config);
  const fingerprint = await computeLegacySchemaFingerprint(sourceSequelize, config.sourceDb.name);
  const payload = {
    captured_at: new Date().toISOString(),
    legacy_database: config.sourceDb.name,
    fingerprint
  };

  await fsPromises.mkdir(dirname(baselinePath), { recursive: true });
  await fsPromises.writeFile(baselinePath, JSON.stringify(payload, null, 2), 'utf8');
  return { path: baselinePath, captured: true };
}

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
export function resolveTargetKind(databaseName) {
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
export function buildMigrationsForKind(kind, context) {
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
    // D-23: capture (or confirm already-captured) the durable pre-migration
    // legacy/current sku_* schema fingerprint baseline BEFORE any target
    // schema mutation below. Read-only against the source connection.
    const legacyBaseline = await ensureLegacyFingerprintBaseline(config);

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
      // D-23: path to the durable pre-migration legacy fingerprint baseline
      // artifact — verify.js reads this same well-known path to compare
      // against a freshly computed post-migration fingerprint.
      legacy_fingerprint_baseline_path: legacyBaseline.path,
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
