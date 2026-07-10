import { promises as fs } from 'fs';
import { join } from 'path';

import { validateEnv } from '../config/env.js';
import {
  createTargetConnection,
  createMetaConnection,
  createBusinessTargetConnection,
  createSourceConnection
} from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';
import { dgfyCoreContract } from '../schemaContracts/dgfyCoreContract.js';
import { dgfyBusinessContract } from '../schemaContracts/dgfyBusinessContract.js';
import {
  resolveTargetKind,
  buildMigrationsForKind,
  computeLegacySchemaFingerprint,
  LEGACY_FINGERPRINT_ARTIFACT_NAME
} from './schema.js';
import { MetaSequelizeStorage } from '../metadata/storage.js';

/**
 * Normalizes queryInterface.showAllTables() results (which can return plain
 * strings or `{ tableName }`-shaped objects depending on dialect/version)
 * into a lower-cased Set for case-insensitive membership checks.
 */
function normalizeTableSet(tables) {
  return new Set(
    tables.map((entry) => (typeof entry === 'string' ? entry : String(entry.tableName || entry)).toLowerCase())
  );
}

/**
 * D-21/Pitfall 3: checks one table's actual columns/indexes/unique
 * constraints/foreign keys against its schema-contract shape. Never throws —
 * a missing table/column/index/FK is a reported finding, not a crash.
 *
 * @param {{queryInterface: object, dbQuery: Function, databaseName: string, tableName: string, tableContract: object, exists: boolean}} params
 */
async function checkTableAgainstContract({ queryInterface, dbQuery, databaseName, tableName, tableContract, exists }) {
  if (!exists) {
    return {
      table: tableName,
      ok: false,
      exists: false,
      missing_columns: tableContract.columns,
      missing_indexes: tableContract.indexes,
      missing_unique_constraints: tableContract.uniqueConstraints || [],
      missing_foreign_keys: (tableContract.foreignKeys || []).map((fk) => fk.column)
    };
  }

  const columns = await queryInterface.describeTable(tableName);
  const missingColumns = tableContract.columns.filter((col) => !columns[col]);

  const indexes = await queryInterface.showIndex(tableName);
  const indexNames = new Set(indexes.map((idx) => idx.name));
  const missingIndexes = tableContract.indexes.filter((name) => !indexNames.has(name));

  const uniqueIndexNames = new Set(indexes.filter((idx) => idx.unique).map((idx) => idx.name));
  const missingUniqueConstraints = (tableContract.uniqueConstraints || []).filter(
    (name) => !uniqueIndexNames.has(name)
  );

  let missingForeignKeys = [];
  if ((tableContract.foreignKeys || []).length > 0) {
    const fkRows = await dbQuery(
      `SELECT column_name AS col, referenced_table_name AS refTable, referenced_column_name AS refColumn
       FROM information_schema.key_column_usage
       WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
      [databaseName, tableName]
    );
    const fkSet = new Set(fkRows.map((row) => `${row.col}->${row.refTable}.${row.refColumn}`));
    missingForeignKeys = tableContract.foreignKeys
      .filter((fk) => !fkSet.has(`${fk.column}->${fk.referencesTable}.${fk.referencesColumn}`))
      .map((fk) => fk.column);
  }

  const ok = missingColumns.length === 0
    && missingIndexes.length === 0
    && missingUniqueConstraints.length === 0
    && missingForeignKeys.length === 0;

  return {
    table: tableName,
    ok,
    exists: true,
    missing_columns: missingColumns,
    missing_indexes: missingIndexes,
    missing_unique_constraints: missingUniqueConstraints,
    missing_foreign_keys: missingForeignKeys
  };
}

/**
 * D-21: checks every table in `contract` against `databaseName` (reached
 * via `connection`, a Sequelize-instance-shaped object exposing
 * getQueryInterface() and query()), plus scans for any explicitly
 * out-of-scope `rejectedTables` (D-15/ADR 0029) that should never appear.
 */
async function checkContractSchema({ connection, databaseName, contract }) {
  const queryInterface = connection.getQueryInterface();
  const dbQuery = async (sql, replacements) => {
    const [rows] = await connection.query(sql, { replacements });
    return rows;
  };

  const existingTables = normalizeTableSet(await queryInterface.showAllTables());

  const tables = [];
  for (const [tableName, tableContract] of Object.entries(contract.tables)) {
    // eslint-disable-next-line no-await-in-loop
    tables.push(await checkTableAgainstContract({
      queryInterface,
      dbQuery,
      databaseName,
      tableName,
      tableContract,
      exists: existingTables.has(tableName.toLowerCase())
    }));
  }

  const rejectedTablesPresent = (contract.rejectedTables || []).filter((name) => existingTables.has(name.toLowerCase()));

  return {
    database: databaseName,
    ok: tables.every((table) => table.ok) && rejectedTablesPresent.length === 0,
    tables,
    rejected_tables_present: rejectedTablesPresent
  };
}

function failedSchemaResult(databaseName, error) {
  return {
    database: databaseName,
    ok: false,
    tables: [],
    rejected_tables_present: [],
    error: error?.message || String(error)
  };
}

/**
 * D-21/D-22: target-scoped migration metadata check. Reuses schema.js's own
 * `buildMigrationsForKind` (the same filter runSchemaMigrate uses to decide
 * what's pending) as the single source of truth for "which Phase 02
 * migration files apply to this target kind" — no separately maintained
 * expected-migration list to drift out of sync with the real migrations
 * directory. `missing_migrations` doubles as the metadata-backed
 * "idempotency/pending" proof the report's `idempotency` section reads
 * (D-22): zero missing means a rerun would be a pure no-op.
 */
async function checkMigrationMetadata(metaSequelize, kind, targetDatabase) {
  const expectedMigrations = buildMigrationsForKind(kind, {}).map((migration) => migration.name);
  const storage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase });
  const executedMigrations = await storage.executed();
  const executedSet = new Set(executedMigrations);
  const missingMigrations = expectedMigrations.filter((name) => !executedSet.has(name));

  return {
    target_database: targetDatabase,
    kind,
    ok: missingMigrations.length === 0,
    expected_migrations: expectedMigrations,
    executed_migrations: executedMigrations,
    missing_migrations: missingMigrations
  };
}

/**
 * D-08/T-02-04-03: cross-checks the explicit `businessDbNames` target list
 * against `dgfy_core.business_database_registry` (queried on the primary
 * target connection — the registry lives in dgfy_core) when that table is
 * reachable, and against each target's own `business_schemas` finding for
 * "has the tenant foundation actually been migrated" coverage. Registry
 * gaps are reported but never fail `ok` on their own — Phase 02 explicitly
 * accepts the operator-supplied target list as sufficient initial
 * verification input before registry rows exist (D-08, 02-RESEARCH.md
 * Open Question 1).
 */
async function checkTenantCoverage({ targetSequelize, businessDbNames, businessSchemas }) {
  let registryAvailable = true;
  let registryDatabaseNames = new Set();
  try {
    const [rows] = await targetSequelize.query('SELECT database_name FROM business_database_registry');
    registryDatabaseNames = new Set((rows || []).map((row) => row.database_name));
  } catch (error) {
    registryAvailable = false;
  }

  const schemaOkByName = new Map(businessSchemas.map((result) => [result.database, result.ok]));

  const targets = businessDbNames.map((name) => ({
    database: name,
    has_expected_schema: schemaOkByName.get(name) === true,
    registry_covered: registryAvailable ? registryDatabaseNames.has(name) : null
  }));

  const registryGaps = registryAvailable
    ? targets.filter((target) => !target.registry_covered).map((target) => target.database)
    : [];

  return {
    ok: targets.every((target) => target.has_expected_schema),
    registry_available: registryAvailable,
    targets,
    registry_gaps: registryGaps
  };
}

/**
 * D-23: compares the durable pre-migration legacy fingerprint baseline
 * (written once by schema.js's ensureLegacyFingerprintBaseline(), read back
 * from its well-known path under config.reportDir) against a freshly
 * computed post-migration fingerprint of the same legacy database. Fails
 * closed (ok:false, baseline_found:false) when the baseline artifact is
 * missing — D-23 requires observable non-mutation proof, not intent.
 */
async function checkLegacyNonMutation(config) {
  const baselinePath = join(config.reportDir, LEGACY_FINGERPRINT_ARTIFACT_NAME);

  let baseline;
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    baseline = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      baseline_found: false,
      baseline_path: baselinePath,
      reason: 'Legacy non-mutation baseline artifact is missing — run schema migrate first to capture it.'
    };
  }

  const legacyDatabase = baseline.legacy_database || config.sourceDb.name;

  try {
    const sourceSequelize = createSourceConnection(config);
    const currentFingerprint = await computeLegacySchemaFingerprint(sourceSequelize, legacyDatabase);
    const unchanged = JSON.stringify(baseline.fingerprint) === JSON.stringify(currentFingerprint);

    return {
      ok: unchanged,
      baseline_found: true,
      baseline_path: baselinePath,
      legacy_database: legacyDatabase,
      baseline_captured_at: baseline.captured_at,
      unchanged
    };
  } catch (error) {
    return {
      ok: false,
      baseline_found: true,
      baseline_path: baselinePath,
      legacy_database: legacyDatabase,
      error: error.message
    };
  }
}

/**
 * Runs metadata schema and target DB connectivity checks, plus Phase 02
 * schema/metadata verification evidence (D-21/D-22): expected-schema checks
 * for `dgfy_core` and every configured `dgfy_business_*` target, and
 * target-scoped migration metadata coverage. Unlike the other command
 * handlers, verify() always completes and reports findings — a failed check
 * flips the corresponding finding/summary boolean to false instead of
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

  const businessDbNames = config.businessDbNames || [];

  // D-21: core_schema — always evaluated against dgfyCoreContract for the
  // primary TARGET_DB_NAME target (the intended dgfy_core landlord
  // database). Findings/errors here are captured, never thrown (T-02-04-04).
  let coreSchema;
  try {
    coreSchema = await checkContractSchema({
      connection: targetSequelize,
      databaseName: config.targetDb.name,
      contract: dgfyCoreContract
    });
  } catch (error) {
    coreSchema = failedSchemaResult(config.targetDb.name, error);
  }

  // D-21: business_schemas — one entry per configured dgfy_business_* target
  // against dgfyBusinessContract.
  const businessSchemas = [];
  for (const name of businessDbNames) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const businessSequelize = createBusinessTargetConnection(config, name);
      // eslint-disable-next-line no-await-in-loop
      businessSchemas.push(await checkContractSchema({
        connection: businessSequelize,
        databaseName: name,
        contract: dgfyBusinessContract
      }));
    } catch (error) {
      businessSchemas.push(failedSchemaResult(name, error));
    }
  }

  // D-21/D-22: migration_metadata — target-scoped Phase 02 migration record
  // coverage for the primary target plus every configured business target.
  const migrationMetadata = [];
  try {
    migrationMetadata.push(
      await checkMigrationMetadata(metaSequelize, resolveTargetKind(config.targetDb.name), config.targetDb.name)
    );
  } catch (error) {
    migrationMetadata.push({
      target_database: config.targetDb.name,
      kind: resolveTargetKind(config.targetDb.name),
      ok: false,
      expected_migrations: [],
      executed_migrations: [],
      missing_migrations: [],
      error: error.message
    });
  }

  for (const name of businessDbNames) {
    try {
      // eslint-disable-next-line no-await-in-loop
      migrationMetadata.push(await checkMigrationMetadata(metaSequelize, 'business', name));
    } catch (error) {
      migrationMetadata.push({
        target_database: name,
        kind: 'business',
        ok: false,
        expected_migrations: [],
        executed_migrations: [],
        missing_migrations: [],
        error: error.message
      });
    }
  }

  // D-22: idempotency — derived directly from migration_metadata's
  // missing_migrations per target (the same metadata-backed pending check;
  // see checkMigrationMetadata's docstring). Zero missing migrations means a
  // rerun of schema migrate against that target would be a pure no-op.
  const idempotency = migrationMetadata.map((finding) => ({
    target_database: finding.target_database,
    ok: (finding.missing_migrations || []).length === 0,
    pending_migrations: finding.missing_migrations || []
  }));

  // D-08/T-02-04-03: tenant_coverage — cross-check the explicit business
  // target list against dgfy_core.business_database_registry (when
  // reachable) and each target's own schema-check outcome.
  let tenantCoverage;
  try {
    tenantCoverage = await checkTenantCoverage({ targetSequelize, businessDbNames, businessSchemas });
  } catch (error) {
    tenantCoverage = { ok: false, registry_available: false, targets: [], registry_gaps: [], error: error.message };
  }

  // D-23: legacy_non_mutation — pre/post information_schema fingerprint
  // comparison for the legacy/current sku_* schema. Never throws; a missing
  // baseline or comparison failure surfaces as ok:false.
  const legacyNonMutation = await checkLegacyNonMutation(config);

  // recordCommandStart inserts into command_executions, which lives in the
  // same metadata schema ensureMetadataSchema() just checked. When that
  // schema is missing/broken (metadataSchemaOk === false) this insert will
  // itself throw — but verify()'s own contract (see JSDoc above) is to
  // always complete and report findings rather than crash, so audit-trail
  // bookkeeping here is best-effort only.
  let executionId = null;
  try {
    executionId = await recordCommandStart(metaSequelize, {
      command: 'verify',
      mode: 'verify',
      argsJson: JSON.stringify({}),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });
  } catch (error) {
    executionId = null;
  }

  const report = {
    generated_at: new Date().toISOString(),
    command: 'verify',
    core_schema: coreSchema,
    business_schemas: businessSchemas,
    migration_metadata: migrationMetadata,
    tenant_coverage: tenantCoverage,
    idempotency,
    legacy_non_mutation: legacyNonMutation,
    summary: {
      metadata_schema_ok: metadataSchemaOk,
      target_db_reachable: targetDbReachable,
      target_db_name: config.targetDb.name,
      core_schema_ok: coreSchema.ok,
      business_schemas_ok: businessSchemas.every((result) => result.ok),
      migration_metadata_ok: migrationMetadata.every((result) => result.ok),
      tenant_coverage_ok: tenantCoverage.ok,
      idempotency_ok: idempotency.every((result) => result.ok),
      legacy_non_mutation_ok: legacyNonMutation.ok
    }
  };

  let reportJsonPath = null;
  let reportSummaryPath = null;
  // D-18: a failed health check (metadata_schema_ok/target_db_reachable
  // false) is a reported *finding*, not a command failure — verify's own
  // job is to detect and report exactly that, so those paths above stay
  // exit_status=success. A genuine report-write failure here, though, IS a
  // command/reporting failure per D-18's acceptance criteria, so it's
  // tracked separately and reflected in the completed row's exit_status.
  let reportWriteError = null;
  try {
    reportJsonPath = await writeJsonReport(config.reportDir, 'verify', report);
    reportSummaryPath = await writeSummaryReport(config.reportDir, 'verify', report, 'success');
  } catch (error) {
    // still return the report even if the report writer itself fails —
    // verify() must never throw.
    reportWriteError = error;
  }

  if (executionId) {
    try {
      await recordCommandComplete(metaSequelize, executionId, {
        exitStatus: reportWriteError ? 'failed' : 'success',
        reportJsonPath,
        reportSummaryPath,
        errorMessage: reportWriteError ? reportWriteError.message : undefined
      });
    } catch (error) {
      // best-effort — do not let audit bookkeeping crash verify's own
      // never-throws contract.
    }
  }

  return report;
}
