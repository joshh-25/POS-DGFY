import { jest } from '@jest/globals';
import { MAPPING_REASON_CODES } from '../src/data/mappings.js';

const mockCreateSourceConnection = jest.fn();
const mockCreateLegacyTenantSourceConnection = jest.fn();
const mockCreateBusinessTargetConnection = jest.fn();
const mockListOpenDataQualityFindings = jest.fn();

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: mockCreateSourceConnection,
  createLegacyTenantSourceConnection: mockCreateLegacyTenantSourceConnection,
  createBusinessTargetConnection: mockCreateBusinessTargetConnection
}));

jest.unstable_mockModule('../src/metadata/dataState.js', () => ({
  listOpenDataQualityFindings: mockListOpenDataQualityFindings,
  recordDataQualityFinding: jest.fn().mockResolvedValue(undefined)
}));

const {
  checkOpenFindings,
  buildDataVerificationSections
} = await import('../src/data/verifyData.js');

function fakeConnection({ queryImpl }) {
  return { query: queryImpl };
}

const target = {
  legacy_tenant_id: 't1',
  legacy_tenant_db_name: 'sku_tenant_1',
  target_business_db_name: 'dgfy_business_alpha',
  expected_business_id: 'biz-1',
  expected_owner_account_id: 'acct-1'
};

function legacyTenantConnection() {
  return fakeConnection({
    queryImpl: (sql) => {
      if (sql.includes('FROM users')) return Promise.resolve([[]]);
      if (sql.includes('FROM tenant_locations')) return Promise.resolve([[]]);
      if (sql.includes('FROM user_location_grants')) return Promise.resolve([[]]);
      if (sql.includes('FROM system_settings')) return Promise.resolve([[]]);
      if (sql.includes('FROM items')) return Promise.resolve([[
        { item_id: 101, name: 'Coffee', current_stock: '7.000000000000' },
        { item_id: 102, name: 'Tea', current_stock: '0.000000000000' }
      ]]);
      if (sql.includes('FROM item_folders')) return Promise.resolve([[
        { folder_id: 201, name: 'Drinks' }
      ]]);
      if (sql.includes('FROM stock_movements')) return Promise.resolve([[
        { movement_id: 301, movement_type: 'adjustment', item_id: 101, quantity: '2.000000000000' },
        { movement_id: 302, movement_type: 'transfer', item_id: 102, quantity: '1.000000000000' }
      ]]);
      if (sql.includes('FROM item_embeddings')) return Promise.resolve([[
        { embedding_id: 401, item_id: 101 },
        { embedding_id: 402, item_id: 102 }
      ]]);
      return Promise.resolve([[]]);
    }
  });
}

function metaSequelizeWithMappedProductKeys() {
  return {
    query: jest.fn((sql) => {
      if (typeof sql === 'string' && sql.includes('legacy_id_map')) {
        return Promise.resolve([[
          { legacy_source: 'sku_tenant_1', legacy_table: 'items', legacy_id: '101' },
          { legacy_source: 'sku_tenant_1', legacy_table: 'items', legacy_id: '102' },
          { legacy_source: 'sku_tenant_1', legacy_table: 'item_folders', legacy_id: '201' }
        ]]);
      }
      return Promise.resolve([[]]);
    })
  };
}

function targetSequelize() {
  return fakeConnection({
    queryImpl: (sql) => {
      if (sql.includes('business_memberships')) return Promise.resolve([[]]);
      if (sql.includes('storefront_discovery_index')) return Promise.resolve([[]]);
      return Promise.resolve([[]]);
    }
  });
}

function businessConnection({ duplicateEmbedding = false, stockMismatch = false } = {}) {
  return fakeConnection({
    queryImpl: (sql) => {
      if (sql.includes('FROM staff_accounts')) return Promise.resolve([[]]);
      if (sql.includes('FROM account_staff_assignments')) return Promise.resolve([[]]);
      if (sql.includes('FROM locations')) return Promise.resolve([[]]);
      if (sql.includes('FROM terminal_identities')) return Promise.resolve([[]]);
      if (sql.includes('FROM product_folders')) return Promise.resolve([[{ id: 1, name: 'Drinks' }]]);
      if (sql.includes('FROM products')) {
        return Promise.resolve([[
          { id: 11, category: 'retail', stock_count: stockMismatch ? '6.000000000000' : '7.000000000000' },
          { id: 12, category: 'retail', stock_count: null }
        ]]);
      }
      if (sql.includes('FROM inventory_movements')) {
        return Promise.resolve([[
          { id: 21, product_id: 11, movement_type: 'adjustment', quantity: '7.000000000000', reference_type: 'legacy_opening_balance' },
          { id: 22, product_id: 11, movement_type: 'adjustment', quantity: '2.000000000000', reference_type: 'legacy_stock_movement' }
        ]]);
      }
      if (sql.includes('FROM product_embeddings')) {
        return Promise.resolve([duplicateEmbedding
          ? [
            { id: 31, product_id: 11 },
            { id: 32, product_id: 11 },
            { id: 33, product_id: 12 }
          ]
          : [
            { id: 31, product_id: 11 },
            { id: 32, product_id: 12 }
          ]]);
      }
      return Promise.resolve([[]]);
    }
  });
}

async function buildVerification(options = {}) {
  mockCreateSourceConnection.mockReturnValue(fakeConnection({
    queryImpl: (sql) => {
      if (sql.includes('FROM tenants')) return Promise.resolve([[]]);
      if (sql.includes('FROM dgfy_account_tenant_memberships')) return Promise.resolve([[]]);
      if (sql.includes('FROM dgfy_accounts')) return Promise.resolve([[]]);
      return Promise.resolve([[]]);
    }
  }));
  mockCreateLegacyTenantSourceConnection.mockReturnValue(legacyTenantConnection());
  mockCreateBusinessTargetConnection.mockReturnValue(businessConnection(options));

  return buildDataVerificationSections({
    config: {},
    targetSequelize: targetSequelize(),
    metaSequelize: metaSequelizeWithMappedProductKeys(),
    targets: [target]
  });
}

describe('product expected-lossy open findings (13-05 Task 1)', () => {
  beforeEach(() => {
    mockCreateSourceConnection.mockReset();
    mockCreateLegacyTenantSourceConnection.mockReset();
    mockCreateBusinessTargetConnection.mockReset();
    mockListOpenDataQualityFindings.mockReset().mockResolvedValue([]);
  });

  test('keeps lossy category collapse and folder flatten findings visible without blocking ok', () => {
    const result = checkOpenFindings([
      { severity: 'skip', reason_code: MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE },
      { severity: 'skip', reason_code: MAPPING_REASON_CODES.FOLDER_NESTING_FLATTENED }
    ]);

    expect(result.ok).toBe(true);
    expect(result.open_count).toBe(2);
    expect(result.expected_lossy_count).toBe(2);
    expect(result.expected_lossy_findings).toHaveLength(2);
    expect(result.blocking_findings).toEqual([]);
  });

  test('keeps unresolved ingredient orphans blocking', () => {
    const result = checkOpenFindings([
      { severity: 'skip', reason_code: MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE },
      { severity: 'orphan', reason_code: MAPPING_REASON_CODES.UNRESOLVED_INGREDIENT }
    ]);

    expect(result.ok).toBe(false);
    expect(result.blocking_count).toBe(1);
    expect(result.blocking_findings[0].reason_code).toBe(MAPPING_REASON_CODES.UNRESOLVED_INGREDIENT);
  });

  test('keeps unrelated conflicts blocking', () => {
    const result = checkOpenFindings([
      { severity: 'conflict', reason_code: MAPPING_REASON_CODES.MISSING_REQUIRED_FIELD }
    ]);

    expect(result.ok).toBe(false);
    expect(result.blocking_count).toBe(1);
  });
});

describe('product-domain target verification (13-05 Task 2)', () => {
  beforeEach(() => {
    mockCreateSourceConnection.mockReset();
    mockCreateLegacyTenantSourceConnection.mockReset();
    mockCreateBusinessTargetConnection.mockReset();
    mockListOpenDataQualityFindings.mockReset().mockResolvedValue([
      {
        legacy_tenant_id: 't1',
        entity_type: 'inventory_movement',
        severity: 'skip',
        reason_code: MAPPING_REASON_CODES.LOSSY_CATEGORY_COLLAPSE
      }
    ]);
  });

  test('reconciles product counts net of a transfer skip and reports movement/category distributions', async () => {
    const result = await buildVerification();
    const verification = result.data_migration.targets[0];

    expect(verification.ok).toBe(true);
    expect(verification.data_counts.ok).toBe(true);
    expect(verification.data_counts.mismatches).toEqual([]);
    expect(verification.product_reconciliation.movement_type_totals).toEqual([
      { movement_type: 'adjustment', total_quantity: '9.000000000000' }
    ]);
    expect(verification.product_reconciliation.product_category_distribution).toEqual([
      { category: 'retail', count: 2 }
    ]);
  });

  test('fails when a product has more than one product_embeddings row', async () => {
    const result = await buildVerification({ duplicateEmbedding: true });

    expect(result.data_migration.targets[0].product_reconciliation.embedding_coverage.ok).toBe(false);
    expect(result.data_migration.targets[0].ok).toBe(false);
    expect(result.data_migration.ok).toBe(false);
  });

  test('fails when stock_count does not equal the legacy_opening_balance sum', async () => {
    const result = await buildVerification({ stockMismatch: true });

    expect(result.data_migration.targets[0].product_reconciliation.stock_opening_balance.ok).toBe(false);
    expect(result.data_migration.targets[0].ok).toBe(false);
    expect(result.data_migration.ok).toBe(false);
  });

  test('reconciles products with additional adjustment rows because only legacy_opening_balance rows count for stock', async () => {
    const result = await buildVerification();

    expect(result.data_migration.targets[0].product_reconciliation.stock_opening_balance.ok).toBe(true);
    expect(result.data_migration.targets[0].product_reconciliation.stock_opening_balance.checked_reference_type).toBe('legacy_opening_balance');
    expect(result.data_migration.targets[0].ok).toBe(true);
  });
});
