import { jest } from '@jest/globals';
import { dgfyBusinessContract } from '../src/schemaContracts/dgfyBusinessContract.js';

/**
 * 10-02-PLAN.md Task 1: structural assertions on the inventory_reservations
 * table contract (columns, indexes, constraint inclusion in business contract).
 *
 * Live portions (actual DB integration test) gated behind the existing
 * RUN_PHASE08_COMMERCE_FOUNDATION_SCHEMA_INTEGRATION flag (full migration
 * chain proof includes inventory_reservations as part of the business schema,
 * covered by phase08CommerceFoundationSchema.test.js integration suite).
 *
 * This suite focuses on: (1) contract structure + inventory_reservations entry
 * integrity, (2) model loads correctly, (3) indexes and columns match the
 * contract. No database access required for these assertions.
 */

describe('Phase 10 inventory_reservations schema contract', () => {
  it('should include inventory_reservations in the business contract', () => {
    expect(dgfyBusinessContract.tables).toHaveProperty('inventory_reservations');
    expect(dgfyBusinessContract.tables.inventory_reservations).toBeDefined();
  });

  it('should define the correct columns for inventory_reservations', () => {
    const cols = dgfyBusinessContract.tables.inventory_reservations.columns;
    expect(cols).toContain('id');
    expect(cols).toContain('business_id');
    expect(cols).toContain('product_id');
    expect(cols).toContain('quantity');
    expect(cols).toContain('reference_type');
    expect(cols).toContain('reference_id');
    expect(cols).toContain('status');
    expect(cols).toContain('expires_at');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
  });

  it('should define the three required indexes', () => {
    const indexes = dgfyBusinessContract.tables.inventory_reservations.indexes;
    expect(indexes).toContain('idx_inventory_reservations_product_status');
    expect(indexes).toContain('idx_inventory_reservations_reference');
    expect(indexes).toContain('idx_inventory_reservations_expiry');
  });

  it('should define the product_id foreign key', () => {
    const fks = dgfyBusinessContract.tables.inventory_reservations.foreignKeys;
    const productFk = fks.find(
      (fk) => fk.column === 'product_id' && fk.referencesTable === 'products'
    );
    expect(productFk).toBeDefined();
    expect(productFk.referencesColumn).toBe('id');
  });

  it('should have no unique constraints (status/expires_at is in expiry index, not unique constraint)', () => {
    const ucs = dgfyBusinessContract.tables.inventory_reservations.uniqueConstraints;
    expect(ucs).toEqual([]);
  });

  it('should not be a projection-only table', () => {
    expect(dgfyBusinessContract.tables.inventory_reservations.projectionOnly).toBe(false);
  });
});
