import { dgfyCoreContract } from '../src/schemaContracts/dgfyCoreContract.js';

const CORE_TABLE_NAMES = [
  'accounts',
  'businesses',
  'business_memberships',
  'business_database_registry',
  'business_audit_logs',
  'storefront_discovery_index'
];

const OUT_OF_SCOPE_TABLE_NAMES = [
  'items',
  'products',
  'purchase_orders',
  'job_orders',
  'stock_movements',
  'pos_transactions',
  'promos',
  'promotions',
  'discounts',
  'fiscal_receipts',
  'branches',
  'locations'
];

describe('dgfyCoreContract', () => {
  test('D-01: exports databaseName dgfy_core', () => {
    expect(dgfyCoreContract.databaseName).toBe('dgfy_core');
  });

  test('D-06: includes all required core landlord tables', () => {
    CORE_TABLE_NAMES.forEach((name) => {
      expect(dgfyCoreContract.tables).toHaveProperty(name);
    });
  });

  test('D-05: no core table name is redundantly prefixed with dgfy_', () => {
    Object.keys(dgfyCoreContract.tables).forEach((name) => {
      expect(name.startsWith('dgfy_')).toBe(false);
    });
    dgfyCoreContract.rejectedTables.forEach((name) => {
      // rejected/out-of-scope names are also plain per D-05, but more
      // importantly must never collide with an in-scope core table name.
      expect(dgfyCoreContract.tables).not.toHaveProperty(name);
    });
  });

  test('D-08: business_database_registry stores database_name and stable_opaque_suffix', () => {
    const registry = dgfyCoreContract.tables.business_database_registry;
    expect(registry.columns).toEqual(
      expect.arrayContaining(['database_name', 'stable_opaque_suffix'])
    );
  });

  test('D-08: business_database_registry enforces uniqueness on suffix and database_name', () => {
    const registry = dgfyCoreContract.tables.business_database_registry;
    expect(registry.uniqueConstraints).toEqual(
      expect.arrayContaining([
        'unique_business_database_registry_suffix',
        'unique_business_database_registry_database_name'
      ])
    );
  });

  test('D-07: business_memberships supports role and status fields for owner/manager/member', () => {
    const memberships = dgfyCoreContract.tables.business_memberships;
    expect(memberships.columns).toEqual(expect.arrayContaining(['role', 'status']));
  });

  test('D-11/D-13: storefront_discovery_index is marked projection-only', () => {
    expect(dgfyCoreContract.tables.storefront_discovery_index.projectionOnly).toBe(true);
  });

  test('D-06/D-09: business_audit_logs supports minimal audit fields', () => {
    const auditLogs = dgfyCoreContract.tables.business_audit_logs;
    expect(auditLogs.columns).toEqual(
      expect.arrayContaining(['audit_log_id', 'business_id', 'account_id', 'action'])
    );
  });

  test('D-10/Pitfall 1: no canonical branches/locations table exists in dgfy_core, and both are rejected', () => {
    expect(dgfyCoreContract.tables).not.toHaveProperty('branches');
    expect(dgfyCoreContract.tables).not.toHaveProperty('locations');
    expect(dgfyCoreContract.rejectedTables).toEqual(
      expect.arrayContaining(['branches', 'locations'])
    );
  });

  test('D-15/ADR 0029: product/POS/inventory/fiscal/promo tables are absent and explicitly rejected', () => {
    OUT_OF_SCOPE_TABLE_NAMES.forEach((name) => {
      expect(dgfyCoreContract.tables).not.toHaveProperty(name);
      expect(dgfyCoreContract.rejectedTables).toContain(name);
    });
  });

  test('every table entry declares columns, indexes, and a projectionOnly flag', () => {
    Object.entries(dgfyCoreContract.tables).forEach(([name, table]) => {
      expect(Array.isArray(table.columns)).toBe(true);
      expect(table.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(table.indexes)).toBe(true);
      expect(typeof table.projectionOnly).toBe('boolean');
      expect(name).toBe(name.toLowerCase());
    });
  });
});
