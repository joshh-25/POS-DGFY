import { validatePhase14RehearsalEvidence } from '../scripts/validate-phase14-rehearsal-evidence.js';

/** A schema-exact, contract-clean evidence object used as the mutation base. */
function validEvidence() {
  return {
    schema_version: 1,
    final_verdict: 'pass',
    exemptions: [
      { entity: 'product_embedding', kind: 'source_zero', reason: 'Snapshot has zero item_embeddings across tenants.' }
    ],
    data_migration_ok: true,
    exact_sales_totals_match: true,
    provenance_ok: true,
    relationships_ok: true,
    void_fidelity_ok: true,
    connections_closed: true,
    source_volume: 2025,
    retry_rows_written: 0,
    blocking_findings: 0,
    commands: ['schema:migrate', 'data:dry-run', 'data:apply', 'data:apply:retry', 'verify'],
    runtime: {
      docker_context: 'dgfy-temp-local-docker',
      source_tenant: '26 sku_tenant_* manifest tenants',
      target_databases: ['dgfy_business_r0001', 'dgfy_business_r0002']
    },
    entity_counts: {
      product_folder: { source_rows: 266, target_rows: 266, first_rows_written: 266, retry_rows_written: 0 },
      product: { source_rows: 609, target_rows: 609, first_rows_written: 609, retry_rows_written: 0 },
      inventory_movement: { source_rows: 1053, target_rows: 1053, first_rows_written: 1053, retry_rows_written: 0 },
      product_embedding: { source_rows: 0, target_rows: 0, first_rows_written: 0, retry_rows_written: 0 },
      availment: { source_rows: 42, target_rows: 42, first_rows_written: 42, retry_rows_written: 0 },
      availment_item: { source_rows: 55, target_rows: 55, first_rows_written: 55, retry_rows_written: 0 }
    },
    sales_totals_by_status: {
      finalized: { source_total: '6734.7400', target_total: '6734.7400' },
      voided: { source_total: '414.1000', target_total: '414.1000' }
    },
    open_findings: [{ reason_code: 'SALE_TERMINAL_NOT_MAPPED', blocking: false, count: 31 }],
    reports: [
      { command: 'verify', path: 'reports/2026-07-15-verify.json', sha256: 'a'.repeat(64) }
    ]
  };
}

describe('validatePhase14RehearsalEvidence — contract', () => {
  test('accepts a schema-exact, contract-clean evidence object', () => {
    const { ok, errors } = validatePhase14RehearsalEvidence(validEvidence());
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  test('rejects a non-object', () => {
    expect(validatePhase14RehearsalEvidence(null).ok).toBe(false);
    expect(validatePhase14RehearsalEvidence('nope').ok).toBe(false);
  });

  test.each([
    'schema_version',
    'data_migration_ok',
    'exact_sales_totals_match',
    'provenance_ok',
    'relationships_ok',
    'void_fidelity_ok',
    'connections_closed'
  ])('rejects wrong/absent %s', (key) => {
    const e = validEvidence();
    delete e[key];
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects final_verdict other than "pass"', () => {
    const e = validEvidence();
    e.final_verdict = 'blocked_source_zero_product_embedding';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a missing entity_counts key', () => {
    const e = validEvidence();
    delete e.entity_counts.availment_item;
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects an unexpected extra entity_counts key', () => {
    const e = validEvidence();
    e.entity_counts.mystery = { source_rows: 1, target_rows: 1, first_rows_written: 1, retry_rows_written: 0 };
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects source/target count mismatch', () => {
    const e = validEvidence();
    e.entity_counts.product.target_rows = 608;
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects nonzero retry writes (and the derived sum mismatch)', () => {
    const e = validEvidence();
    e.entity_counts.availment.retry_rows_written = 1;
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects source_volume that does not equal the source-row sum', () => {
    const e = validEvidence();
    e.source_volume = 2024;
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a source-zero entity that lacks a documented exemption', () => {
    const e = validEvidence();
    e.exemptions = [];
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a source-zero entity whose other counters are nonzero', () => {
    const e = validEvidence();
    e.entity_counts.product_embedding.target_rows = 3;
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects mismatched per-status sales totals', () => {
    const e = validEvidence();
    e.sales_totals_by_status.finalized.target_total = '6734.7300';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a non-fixed-four-decimal sales total', () => {
    const e = validEvidence();
    e.sales_totals_by_status.finalized.source_total = '6734.74';
    e.sales_totals_by_status.finalized.target_total = '6734.74';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a blocking finding (and the derived blocking-count mismatch)', () => {
    const e = validEvidence();
    e.open_findings.push({ reason_code: 'AVAILMENT_PARENT_NOT_MAPPED', blocking: true, count: 2 });
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a permitted attribution code marked blocking', () => {
    const e = validEvidence();
    e.open_findings = [{ reason_code: 'SALE_TERMINAL_NOT_MAPPED', blocking: true, count: 1 }];
    e.blocking_findings = 1;
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('allows CREDENTIAL_RESET_REQUIRED as a non-blocking reason code', () => {
    const e = validEvidence();
    e.open_findings.push({ reason_code: 'STAFF_CREDENTIAL_RESET_REQUIRED', blocking: false, count: 1 });
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(true);
  });

  test('rejects a report path traversal', () => {
    const e = validEvidence();
    e.reports[0].path = '../secrets/report.json';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a non-64-hex sha256', () => {
    const e = validEvidence();
    e.reports[0].sha256 = 'ABC123';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('allows a valid reports[].sha256 without treating it as a secret', () => {
    const e = validEvidence();
    e.reports[0].sha256 = 'f'.repeat(64);
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(true);
  });
});

describe('validatePhase14RehearsalEvidence — redaction', () => {
  test('rejects a sensitive field name anywhere in the tree', () => {
    const e = validEvidence();
    e.runtime.password_hash = 'whatever';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a bcrypt-shaped value', () => {
    const e = validEvidence();
    e.runtime.source_tenant = '$2b$10$abcdefghijklmnopqrstuv';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a connection URI value', () => {
    const e = validEvidence();
    e.runtime.source_tenant = 'mysql://user:pw@host:3306/db';
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });

  test('rejects a forbidden seeded sentinel value', () => {
    const e = validEvidence();
    e.notes = ['SEEDED_CREDENTIAL_SENTINEL'];
    expect(validatePhase14RehearsalEvidence(e).ok).toBe(false);
  });
});
