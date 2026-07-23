import { dgfyBusinessContract } from '../src/schemaContracts/dgfyBusinessContract.js';

/**
 * 10-07-PLAN.md Task 1: structural assertions on the availments.source_reference
 * cross-DB idempotency column (RESEARCH Pitfall 2, T-10-07-01) and the
 * payments.payment_reference gateway-reference column (T-10-07-04).
 *
 * This suite focuses on: (1) contract structure + `availments`/`payments`
 * entry integrity (both entries were backfilled here — see
 * dgfyBusinessContract.js's `availments` comment for the pre-existing Phase 9
 * gap this discovered), (2) the new columns/unique index are documented.
 * No database access required for these assertions (mirrors
 * phase10InventoryReservationSchema.test.js's no-DB structural-only pattern).
 */

describe('Phase 10 availments.source_reference schema contract', () => {
  it('should include an availments entry in the business contract', () => {
    expect(dgfyBusinessContract.tables).toHaveProperty('availments');
    expect(dgfyBusinessContract.tables.availments).toBeDefined();
  });

  it('should define source_reference as a column on availments', () => {
    const cols = dgfyBusinessContract.tables.availments.columns;
    expect(cols).toContain('source_reference');
    // Sanity: the rest of the Phase 9 shape is still documented too.
    expect(cols).toContain('id');
    expect(cols).toContain('business_id');
    expect(cols).toContain('status');
    expect(cols).toContain('shift_id');
    expect(cols).toContain('terminal_id');
    expect(cols).toContain('cashier_account_id');
  });

  it('should define unique_availments_source_reference as a unique index', () => {
    const { indexes, uniqueConstraints } = dgfyBusinessContract.tables.availments;
    expect(indexes).toContain('unique_availments_source_reference');
    expect(uniqueConstraints).toContain('unique_availments_source_reference');
  });

  it('should not reject availments (it is a legitimate tenant table)', () => {
    expect(dgfyBusinessContract.rejectedTables).not.toContain('availments');
  });

  it('should not be a projection-only table', () => {
    expect(dgfyBusinessContract.tables.availments.projectionOnly).toBe(false);
  });
});

describe('Phase 10 payments.payment_reference schema contract', () => {
  it('should include a payments entry in the business contract', () => {
    expect(dgfyBusinessContract.tables).toHaveProperty('payments');
    expect(dgfyBusinessContract.tables.payments).toBeDefined();
  });

  it('should define payment_reference as a column on payments', () => {
    const cols = dgfyBusinessContract.tables.payments.columns;
    expect(cols).toContain('payment_reference');
    expect(cols).toContain('payment_method');
    expect(cols).toContain('availment_id');
  });

  it('should define the availment_id foreign key', () => {
    const fks = dgfyBusinessContract.tables.payments.foreignKeys;
    const availmentFk = fks.find(
      (fk) => fk.column === 'availment_id' && fk.referencesTable === 'availments'
    );
    expect(availmentFk).toBeDefined();
    expect(availmentFk.referencesColumn).toBe('id');
  });

  it('should not reject payments (it is a legitimate tenant table)', () => {
    expect(dgfyBusinessContract.rejectedTables).not.toContain('payments');
  });
});
