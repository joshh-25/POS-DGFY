import { jest } from '@jest/globals';
import { Sequelize } from 'sequelize';

import { runDataDryRun, runDataApply } from '../src/commands/data.js';
import { runVerify } from '../src/commands/verify.js';
import { loadMigrationTargetManifest } from '../src/data/targetManifest.js';

const RUN_REHEARSAL = process.env.RUN_PHASE14_MILESTONE_REHEARSAL === 'true';
const APPROVED_DOCKER_CONTEXT = 'lima-dgfy-dev';

const REQUIRED_ENV = [
  'SOURCE_DB_HOST',
  'SOURCE_DB_USER',
  'SOURCE_DB_PASSWORD',
  'SOURCE_DB_NAME',
  'TARGET_DB_HOST',
  'TARGET_DB_USER',
  'TARGET_DB_PASSWORD',
  'TARGET_DB_NAME',
  'DGFY_MIGRATION_TARGET_MANIFEST',
  'DGFY_BUSINESS_DB_NAMES',
  'DOCKER_CONTEXT',
  'MIGRATION_ACTOR',
  'REPORT_DIR'
];

const SIX_ENTITY_TYPES = [
  'product_folder',
  'product',
  'inventory_movement',
  'product_embedding',
  'availment',
  'availment_item'
];

const PHASE13_ENTITY_TYPES = [
  'product_folder',
  'product',
  'inventory_movement',
  'product_embedding'
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
const describeIfRehearsal = RUN_REHEARSAL && missingEnv.length === 0 ? describe : describe.skip;

if (!RUN_REHEARSAL || missingEnv.length > 0) {
  // eslint-disable-next-line no-console
  console.log(
    '[dataMilestoneRehearsal.test.js] SKIPPED — set RUN_PHASE14_MILESTONE_REHEARSAL=true ' +
    'with SOURCE_DB_*, TARGET_DB_*, DGFY_MIGRATION_TARGET_MANIFEST, DGFY_BUSINESS_DB_NAMES, ' +
    `DOCKER_CONTEXT=${APPROVED_DOCKER_CONTEXT}, MIGRATION_ACTOR, and REPORT_DIR to run the real ` +
    'Phase 14 six-entity dry-run/apply/retry/verify rehearsal.'
  );
  if (RUN_REHEARSAL && missingEnv.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[dataMilestoneRehearsal.test.js] Missing env: ${missingEnv.join(', ')}`);
  }
}

function createBusinessConnection(databaseName) {
  return new Sequelize(databaseName, process.env.TARGET_DB_USER, process.env.TARGET_DB_PASSWORD, {
    host: process.env.TARGET_DB_HOST,
    port: Number(process.env.TARGET_DB_PORT || 3306),
    dialect: 'mysql',
    logging: false
  });
}

async function loadConfiguredTargets() {
  const result = await loadMigrationTargetManifest(process.env.DGFY_MIGRATION_TARGET_MANIFEST);
  if (!result.valid) {
    throw new Error(`Invalid migration target manifest: ${result.errors.join('; ')}`);
  }

  const configuredTargets = new Set(
    String(process.env.DGFY_BUSINESS_DB_NAMES || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  return result.targets.filter((target) => configuredTargets.has(target.target_business_db_name));
}

function countEntityEntries(entries = [], entityType, statuses = null) {
  return entries.filter((entry) => {
    if (entry.entity_type !== entityType) return false;
    return !statuses || statuses.includes(entry.status || entry.operation);
  }).length;
}

function firstEntityIndex(entries = [], entityType) {
  return entries.findIndex((entry) => entry.entity_type === entityType);
}

function assertDryRunEntityCoverage(report) {
  expect(report.summary.planned_inserts + report.summary.planned_updates).toBeGreaterThan(0);
  SIX_ENTITY_TYPES.forEach((entityType) => {
    expect(countEntityEntries(report.results, entityType, ['insert', 'update'])).toBeGreaterThan(0);
  });

  const availmentIndex = firstEntityIndex(report.results, 'availment');
  const availmentItemIndex = firstEntityIndex(report.results, 'availment_item');
  expect(availmentIndex).toBeGreaterThan(-1);
  expect(availmentItemIndex).toBeGreaterThan(availmentIndex);
  PHASE13_ENTITY_TYPES.forEach((entityType) => {
    expect(firstEntityIndex(report.results, entityType)).toBeGreaterThan(-1);
    expect(firstEntityIndex(report.results, entityType)).toBeLessThan(availmentIndex);
  });
}

function assertFirstApplyEntityWrites(report) {
  expect(report.summary.rows_written).toBeGreaterThan(0);
  SIX_ENTITY_TYPES.forEach((entityType) => {
    expect(countEntityEntries(report.results, entityType, ['inserted'])).toBeGreaterThan(0);
  });
}

function assertRetryInsertedNoMilestoneRows(report) {
  SIX_ENTITY_TYPES.forEach((entityType) => {
    expect(countEntityEntries(report.results, entityType, ['inserted'])).toBe(0);
  });
}

function assertNoRawSensitiveFields(value, path = '$') {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      expect(value).not.toMatch(/\$2[aby]\$\d{2}\$/);
      expect(value).not.toMatch(/legacy_snapshot\s*[:=]\s*[{[]/i);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawSensitiveFields(entry, `${path}[${index}]`));
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    expect(key).not.toBe('password_hash');
    expect(key).not.toBe('pos_approval_pin_hash');
    expect(key).not.toBe('legacy_snapshot');
    assertNoRawSensitiveFields(nestedValue, `${path}.${key}`);
  });
}

async function fetchTargetEvidence(target) {
  const connection = createBusinessConnection(target.target_business_db_name);
  try {
    const [rowCounts] = await connection.query(`
      SELECT 'product_folders' AS entity, COUNT(*) AS count FROM product_folders
      UNION ALL SELECT 'products', COUNT(*) FROM products
      UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
      UNION ALL SELECT 'product_embeddings', COUNT(*) FROM product_embeddings
      UNION ALL SELECT 'availments', COUNT(*) FROM availments WHERE source_system = 'legacy_migration'
      UNION ALL SELECT 'availment_items', COUNT(*) FROM availment_items WHERE source_system = 'legacy_migration'
    `);
    const [salesTotals] = await connection.query(`
      SELECT status, source_system, COUNT(*) AS header_count, COALESCE(SUM(total_amount), 0) AS total_amount
      FROM availments
      WHERE source_system = 'legacy_migration'
      GROUP BY status, source_system
      ORDER BY status, source_system
    `);
    const [lineCounts] = await connection.query(`
      SELECT COUNT(*) AS line_count
      FROM availment_items
      WHERE source_system = 'legacy_migration'
    `);
    return { rowCounts, salesTotals, lineCount: Number(lineCounts[0]?.line_count || 0) };
  } finally {
    await connection.close();
  }
}

function assertVerifyTargetProof(targetVerification) {
  expect(targetVerification.ok).toBe(true);
  expect(targetVerification.data_counts.ok).toBe(true);
  SIX_ENTITY_TYPES.map((entityType) => `${entityType}s`).forEach((entityName) => {
    expect(targetVerification.data_counts.checked_entities).toContain(entityName);
  });
  expect(targetVerification.product_reconciliation.ok).toBe(true);
  expect(targetVerification.product_reconciliation.embedding_coverage.ok).toBe(true);
  expect(targetVerification.product_reconciliation.stock_opening_balance.ok).toBe(true);
  expect(targetVerification.product_reconciliation.movement_type_totals.length).toBeGreaterThan(0);
  expect(targetVerification.sales_reconciliation.ok).toBe(true);
  expect(targetVerification.sales_reconciliation.status_totals.ok).toBe(true);
  expect(targetVerification.sales_reconciliation.status_totals.source.length).toBeGreaterThan(0);
  expect(targetVerification.sales_reconciliation.status_totals.target.length).toBeGreaterThan(0);
  expect(targetVerification.sales_reconciliation.line_counts.ok).toBe(true);
  expect(targetVerification.sales_reconciliation.line_counts.target_count).toBeGreaterThan(0);
  expect(targetVerification.sales_reconciliation.map_completeness.ok).toBe(true);
  expect(targetVerification.sales_reconciliation.provenance.ok).toBe(true);
  expect(targetVerification.sales_reconciliation.relationships.ok).toBe(true);
  expect(targetVerification.sales_reconciliation.void_fidelity.ok).toBe(true);
}

describeIfRehearsal('Phase 14 real milestone-wide data migration rehearsal', () => {
  jest.setTimeout(600000);

  test('dry-run, apply, retry-apply, and verify prove all six milestone entities', async () => {
    expect(process.env.DOCKER_CONTEXT).toBe(APPROVED_DOCKER_CONTEXT);

    const targets = await loadConfiguredTargets();
    expect(targets.length).toBeGreaterThan(0);

    const dryRunReport = await runDataDryRun({});
    assertDryRunEntityCoverage(dryRunReport);
    assertNoRawSensitiveFields(dryRunReport.results);

    const firstApplyReport = await runDataApply({ confirmDestructive: true });
    assertFirstApplyEntityWrites(firstApplyReport);
    assertNoRawSensitiveFields(firstApplyReport);

    const retryApplyReport = await runDataApply({ confirmDestructive: true });
    assertRetryInsertedNoMilestoneRows(retryApplyReport);
    assertNoRawSensitiveFields(retryApplyReport);

    const verifyReport = await runVerify({});
    expect(verifyReport.data_migration.skipped).not.toBe(true);
    expect(verifyReport.data_migration.ok).toBe(true);
    expect(verifyReport.data_migration.open_findings.blocking_count).toBe(0);
    expect(verifyReport.summary.data_migration_ok).toBe(true);

    const verifiedTargets = verifyReport.data_migration.targets || [];
    expect(verifiedTargets.length).toBeGreaterThan(0);
    verifiedTargets.forEach((targetVerification) => assertVerifyTargetProof(targetVerification));

    const evidenceTarget = targets.find(
      (target) => verifiedTargets.some(
        (targetVerification) => targetVerification.target_business_db_name === target.target_business_db_name
      )
    ) || targets[0];
    const evidence = await fetchTargetEvidence(evidenceTarget);
    SIX_ENTITY_TYPES.map((entityType) => `${entityType}s`).forEach((entityName) => {
      const row = evidence.rowCounts.find((entry) => entry.entity === entityName);
      expect(Number(row?.count || 0)).toBeGreaterThan(0);
    });
    expect(evidence.salesTotals.length).toBeGreaterThan(0);
    expect(evidence.lineCount).toBeGreaterThan(0);
  });
});
