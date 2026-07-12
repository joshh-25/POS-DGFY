import { validateEnv } from '../config/env.js';
import { createSourceConnection } from '../config/db.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { EnvValidationError } from '../utils/errors.js';

// @compat-seam id=db-continuity-legacy-backup
//
// D-02: the ONE concrete reference compatibility seam for this phase — a
// non-destructive DB-level continuity probe proving the legacy backup's
// (SOURCE_DB) POS/Storefront domain tables remain intact beside the new
// dgfy_* foundation (CMP-01). This id is registered as the FIRST entry in
// docs/architecture/compatibility-seams.json; the Plan 01 validator
// (scripts/check-compat-seams.js) bidirectionally reconciles this marker
// against that manifest entry — do not rename this id in one place without
// the other.
//
// EXPECTED_LEGACY_DOMAIN_TABLES is defined against the legacy backup's own
// table names (backend/src/models — Item.js/PurchaseOrder.js/JobOrder.js/
// StockMovement.js/Supplier.js/User.js `tableName` values) and cross-checked
// against schemaContracts/dgfyCoreContract.js's `rejectedTables` list: these
// exact names are explicitly out of scope for `dgfy_core` (ADR 0029) because
// they are still owned by the legacy backup this seam verifies stays intact
// (05-RESEARCH.md Assumption A3).
export const EXPECTED_LEGACY_DOMAIN_TABLES = [
  'items',
  'purchase_orders',
  'job_orders',
  'stock_movements',
  'suppliers',
  'users'
];

// Defensive identifier validation (mirrors config/db.js's
// createLegacyTenantSourceConnection blank/prefix rejection): every entry in
// the allowlist above must itself look like a safe bare SQL identifier
// before it is ever used to build a query string. EXPECTED_LEGACY_DOMAIN_TABLES
// is a hardcoded in-file constant, never caller/config/manifest-supplied —
// this keeps the safety property structurally enforced rather than merely
// conventional (T-05-06).
const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

function assertSafeIdentifier(name) {
  if (typeof name !== 'string' || !SAFE_IDENTIFIER_PATTERN.test(name)) {
    throw new Error(`verifyContinuity: refusing unsafe table identifier "${name}"`);
  }
  return name;
}

/**
 * Normalizes queryInterface.showAllTables() results (plain strings or
 * `{ tableName }`-shaped objects depending on dialect/version) into a
 * lower-cased Set for case-insensitive membership checks. Mirrors verify.js's
 * normalizeTableSet.
 */
function normalizeTableSet(tables) {
  return new Set(
    tables.map((entry) => (typeof entry === 'string' ? entry : String(entry.tableName || entry)).toLowerCase())
  );
}

/**
 * Pure report builder — no I/O. Takes already-fetched raw probe data
 * (the discovered table set and a table->row-count map for tables that
 * exist) and produces the findings/report shape. Kept separate from the
 * DB-touching probe below (probeSourceTables) so the report shape is
 * unit-testable without a real or mocked Sequelize connection, mirroring
 * verify.js's pure/impure split.
 *
 * @param {{ existingTables: Set<string>, rowCountByTable: Record<string, number>, sourceDbName: string }} params
 */
export function buildContinuityReport({ existingTables, rowCountByTable, sourceDbName }) {
  const findings = EXPECTED_LEGACY_DOMAIN_TABLES.map((table) => {
    const exists = existingTables.has(table.toLowerCase());
    if (!exists) {
      return { table, exists: false, ok: false, row_count: null };
    }
    return { table, exists: true, ok: true, row_count: rowCountByTable[table] ?? null };
  });

  return {
    generated_at: new Date().toISOString(),
    command: 'verify-continuity',
    findings,
    ok: findings.every((finding) => finding.ok),
    summary: {
      source_db_name: sourceDbName,
      expected_table_count: EXPECTED_LEGACY_DOMAIN_TABLES.length,
      missing_tables: findings.filter((finding) => !finding.ok).map((finding) => finding.table)
    }
  };
}

/**
 * Impure probe: read-only SHOW TABLES + per-existing-table COUNT(*) against
 * the already-open legacy (SOURCE_DB) connection. Strictly non-destructive —
 * no INSERT/UPDATE/DELETE/DDL statement is ever issued here, and no
 * SELECT * is ever run (only an aggregate COUNT), so no raw legacy row data
 * is read into process memory or the report (T-05-07). Table identifiers
 * used to build each COUNT(*) query come exclusively from the validated
 * EXPECTED_LEGACY_DOMAIN_TABLES allowlist above — never from the database's
 * own SHOW TABLES output or any external/config-supplied string (T-05-06).
 *
 * @param {import('sequelize').Sequelize} legacy
 */
async function probeSourceTables(legacy) {
  const queryInterface = legacy.getQueryInterface();
  const existingTables = normalizeTableSet(await queryInterface.showAllTables());

  const rowCountByTable = {};
  for (const table of EXPECTED_LEGACY_DOMAIN_TABLES) {
    if (!existingTables.has(table.toLowerCase())) continue;
    const safeTable = assertSafeIdentifier(table);
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await legacy.query(`SELECT COUNT(*) AS count FROM \`${safeTable}\``);
    rowCountByTable[table] = Number(rows?.[0]?.count ?? 0);
  }

  return { existingTables, rowCountByTable };
}

/**
 * D-02: the reference compatibility seam. Non-destructively verifies the
 * legacy backup's (SOURCE_DB) domain tables remain intact, proving legacy
 * POS/Storefront behavior stays available beside the new dgfy_* foundation
 * (CMP-01). Strictly read-only on SOURCE_DB. Any future write MUST route
 * through the runner's assertDestructiveAllowed() gate (safety/destructiveGate.js)
 * — never bypass it from this command (T-05-05).
 *
 * Follows the runner's env-validate-before-connect ordering (RUN-03):
 * validateEnv() first (no DB touch), then createSourceConnection() opens the
 * SOURCE_DB (legacy backup) connection only — never TARGET_DB, never
 * backend/'s TenantConnector.js.
 *
 * @param {{}} params
 */
export async function runVerifyContinuity({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  const legacy = createSourceConnection(config);

  try {
    const { existingTables, rowCountByTable } = await probeSourceTables(legacy);
    const report = buildContinuityReport({
      existingTables,
      rowCountByTable,
      sourceDbName: config.sourceDb.name
    });

    await writeJsonReport(config.reportDir, 'verify-continuity', report);

    return report;
  } finally {
    await legacy.close();
  }
}
