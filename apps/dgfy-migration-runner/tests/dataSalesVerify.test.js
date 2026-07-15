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
  recordDataQualityFinding: jest.fn().mockResolvedValue(undefined),
  syncDataQualityFindings: jest.fn().mockResolvedValue(undefined)
}));

const {
  SALES_ATTRIBUTION_REASON_CODES,
  buildDataVerificationSections,
  buildSalesReconciliation,
  decimal4ToUnits,
  summarizeSalesStatusTotals
} = await import('../src/data/verifyData.js');

const target = {
  legacy_tenant_id: 't1',
  legacy_tenant_db_name: 'sku_tenant_1',
  target_business_db_name: 'dgfy_business_alpha',
  expected_business_id: 'biz-1',
  expected_owner_account_id: 'acct-1'
};

function fakeConnection(queryImpl) {
  return { query: queryImpl, close: jest.fn().mockResolvedValue(undefined) };
}

function baseLegacyRows({ unsupportedStatus = false } = {}) {
  return {
    users: [],
    locations: [],
    terminalRegistry: [],
    items: [
      { item_id: 101, name: 'Coffee', current_stock: '2.000000000000' }
    ],
    itemFolders: [],
    stockMovements: [],
    itemEmbeddings: [],
    posTransactions: [
      { pos_transaction_id: 9101, invoice_number: 'INV-1', status: 'completed', total_amount: '1.2345' },
      { pos_transaction_id: 9102, invoice_number: 'INV-2', status: 'voided', total_amount: '-0.5000' },
      ...(unsupportedStatus
        ? [{ pos_transaction_id: 9103, invoice_number: 'INV-3', status: 'draft', total_amount: '9.0000' }]
        : [])
    ],
    posTransactionLines: [
      { line_id: 9201, pos_transaction_id: 9101, item_id: 101 },
      { line_id: 9202, pos_transaction_id: 9102, item_id: 101 }
    ]
  };
}

function baseTargetRows({
  totalMismatch = false,
  headerCountMismatch = false,
  statusMismatch = false,
  missingHeaderProvenance = false,
  missingLineProvenance = false,
  badParent = false,
  badProduct = false,
  voidMismatch = false
} = {}) {
  const availments = [
    {
      id: 7001,
      source_system: missingHeaderProvenance ? null : 'legacy_migration',
      source_reference: missingHeaderProvenance ? null : 'legacy_pos:INV-1',
      status: statusMismatch ? 'voided' : 'finalized',
      total_amount: totalMismatch ? '1.2344' : '1.2345'
    },
    ...(!headerCountMismatch
      ? [{
        id: 7002,
        source_system: 'legacy_migration',
        source_reference: 'legacy_pos:INV-2',
        status: voidMismatch ? 'finalized' : 'voided',
        total_amount: '-0.5000'
      }]
      : [])
  ];

  return {
    staffAccounts: [],
    staffCredentials: [],
    accountStaffAssignments: [],
    locations: [],
    terminalIdentities: [],
    productFolders: [],
    products: [{ id: 8801, category: 'retail', stock_count: '2.000000000000' }],
    inventoryMovements: [
      { id: 5001, product_id: 8801, movement_type: 'adjustment', quantity: '2.000000000000', reference_type: 'legacy_opening_balance' }
    ],
    productEmbeddings: [],
    availments,
    availmentItems: [
      {
        id: 8001,
        availment_id: badParent ? 9999 : 7001,
        product_id: badProduct ? 9999 : 8801,
        source_system: missingLineProvenance ? null : 'legacy_migration',
        source_reference: missingLineProvenance ? null : 'legacy_pos_line:9201'
      },
      {
        id: 8002,
        availment_id: 7002,
        product_id: 8801,
        source_system: 'legacy_migration',
        source_reference: 'legacy_pos_line:9202'
      }
    ]
  };
}

function rowsFor(sql, legacyRows, targetRows) {
  if (sql.includes('FROM users')) return legacyRows.users;
  if (sql.includes('FROM tenant_locations')) return legacyRows.locations;
  if (sql.includes('FROM user_location_grants')) return [];
  if (sql.includes('FROM system_settings')) return [];
  if (sql.includes('FROM item_nutrition')) return [];
  if (sql.includes('FROM item_allergens')) return [];
  if (sql.includes('FROM item_physical_properties')) return [];
  if (sql.includes('FROM item_shelf_life')) return [];
  if (sql.includes('FROM item_packaging')) return [];
  if (sql.includes('FROM item_quality_control')) return [];
  if (sql.includes('FROM item_regulatory_compliance')) return [];
  if (sql.includes('FROM item_cost_breakdown')) return [];
  if (sql.includes('FROM item_barcodes')) return [];
  if (sql.includes('FROM product_composition')) return [];
  if (sql.includes('FROM item_location_stocks')) return [];
  if (sql.includes('FROM items')) return legacyRows.items;
  if (sql.includes('FROM item_folders')) return legacyRows.itemFolders;
  if (sql.includes('FROM stock_movements')) return legacyRows.stockMovements;
  if (sql.includes('FROM item_embeddings')) return legacyRows.itemEmbeddings;
  if (sql.includes('FROM pos_transactions')) return legacyRows.posTransactions;
  if (sql.includes('FROM pos_transaction_lines')) return legacyRows.posTransactionLines;
  if (sql.includes('FROM staff_accounts')) return targetRows.staffAccounts;
  if (sql.includes('FROM staff_credentials')) return targetRows.staffCredentials;
  if (sql.includes('FROM account_staff_assignments')) return targetRows.accountStaffAssignments;
  if (sql.includes('FROM locations')) return targetRows.locations;
  if (sql.includes('FROM terminal_identities')) return targetRows.terminalIdentities;
  if (sql.includes('FROM product_folders')) return targetRows.productFolders;
  if (sql.includes('FROM product_embeddings')) return targetRows.productEmbeddings;
  if (sql.includes("WHERE reference_type = 'legacy_opening_balance'")) {
    return [{ product_id: 8801, stock_count: '2.000000000000', opening_balance_quantity: '2.000000000000' }];
  }
  if (sql.includes('SUM(quantity) AS total_quantity')) {
    return [{ movement_type: 'adjustment', total_quantity: '2.000000000000' }];
  }
  if (sql.includes('COUNT(*) AS count') && sql.includes('FROM products')) {
    return [{ category: 'retail', count: '1' }];
  }
  if (sql.includes('FROM products')) return targetRows.products;
  if (sql.includes('FROM inventory_movements')) return targetRows.inventoryMovements;
  if (sql.includes('FROM availment_items')) return targetRows.availmentItems;
  if (sql.includes('FROM availments')) return targetRows.availments;
  return [];
}

function metaSequelizeWithCompleteMaps({ missingHeaderMap = false, missingLineMap = false } = {}) {
  const mapped = [
    { legacy_source: 'sku_tenant_1', legacy_table: 'items', legacy_id: '101' },
    ...(!missingHeaderMap
      ? [
        { legacy_source: 'sku_tenant_1', legacy_table: 'pos_transactions', legacy_id: '9101' },
        { legacy_source: 'sku_tenant_1', legacy_table: 'pos_transactions', legacy_id: '9102' }
      ]
      : []),
    ...(!missingLineMap
      ? [
        { legacy_source: 'sku_tenant_1', legacy_table: 'pos_transaction_lines', legacy_id: '9201' },
        { legacy_source: 'sku_tenant_1', legacy_table: 'pos_transaction_lines', legacy_id: '9202' }
      ]
      : [])
  ];

  return {
    query: jest.fn((sql) => {
      if (typeof sql === 'string' && sql.includes('legacy_id_map')) {
        return Promise.resolve([mapped]);
      }
      return Promise.resolve([[]]);
    })
  };
}

async function buildVerification({ legacyOptions = {}, targetOptions = {}, mapOptions = {}, findings = [] } = {}) {
  const legacyRows = baseLegacyRows(legacyOptions);
  const targetRows = baseTargetRows(targetOptions);

  mockCreateSourceConnection.mockReturnValue(fakeConnection((sql) => {
    if (sql.includes('FROM tenants')) return Promise.resolve([[]]);
    if (sql.includes('FROM dgfy_account_tenant_memberships')) return Promise.resolve([[]]);
    if (sql.includes('FROM dgfy_accounts')) return Promise.resolve([[]]);
    return Promise.resolve([[]]);
  }));
  mockCreateLegacyTenantSourceConnection.mockReturnValue(fakeConnection((sql) => Promise.resolve([rowsFor(sql, legacyRows, targetRows)])));
  mockCreateBusinessTargetConnection.mockReturnValue(fakeConnection((sql) => Promise.resolve([rowsFor(sql, legacyRows, targetRows)])));
  mockListOpenDataQualityFindings.mockResolvedValue(findings);

  const targetSequelize = fakeConnection((sql) => {
    if (sql.includes('business_memberships')) return Promise.resolve([[]]);
    if (sql.includes('storefront_discovery_index')) return Promise.resolve([[]]);
    return Promise.resolve([[]]);
  });

  return buildDataVerificationSections({
    config: {},
    targetSequelize,
    metaSequelize: metaSequelizeWithCompleteMaps(mapOptions),
    targets: [target]
  });
}

describe('decimal4ToUnits (14-06 RED)', () => {
  test.each([
    ['0', 0n],
    ['1.2', 12000n],
    ['1.2345', 12345n],
    ['-0.5000', -5000n],
    ['-42', -420000n]
  ])('converts canonical DECIMAL(14,4) string %s exactly', (input, expected) => {
    expect(decimal4ToUnits(input)).toBe(expected);
  });

  test.each(['', ' ', 'abc', '1.23456', '1.', '.1000', '1,000.0000'])('rejects malformed DECIMAL input %s', (input) => {
    expect(() => decimal4ToUnits(input)).toThrow(/DECIMAL\(14,4\)/);
  });
});

describe('sales reconciliation helpers (14-06 RED)', () => {
  test('summarizes status/source-system totals without floating-point coercion', () => {
    expect(summarizeSalesStatusTotals([
      { status: 'finalized', source_system: 'legacy_migration', count: '1', total_amount: '9007199254740991.0001' }
    ])).toEqual([
      {
        status: 'finalized',
        source_system: 'legacy_migration',
        count: 1,
        total_amount: '9007199254740991.0001',
        total_amount_units: '90071992547409910001'
      }
    ]);
  });

  test('buildSalesReconciliation fails exact amount mismatches at four decimal places', () => {
    const reconciliation = buildSalesReconciliation({
      sourceStatusTotals: [{ status: 'finalized', source_system: 'legacy_migration', count: 1, total_amount: '1.2345' }],
      targetStatusTotals: [{ status: 'finalized', source_system: 'legacy_migration', count: 1, total_amount: '1.2344' }]
    });

    expect(reconciliation.status_totals.ok).toBe(false);
    expect(reconciliation.status_totals.mismatches[0]).toMatchObject({
      status: 'finalized',
      source_system: 'legacy_migration',
      source_total_amount: '1.2345',
      target_total_amount: '1.2344'
    });
  });
});

describe('sales verification orchestration (14-06 RED)', () => {
  beforeEach(() => {
    mockCreateSourceConnection.mockReset();
    mockCreateLegacyTenantSourceConnection.mockReset();
    mockCreateBusinessTargetConnection.mockReset();
    mockListOpenDataQualityFindings.mockReset();
  });

  test('successful fixture reports all six migration entity types and data_migration_ok=true', async () => {
    const result = await buildVerification();
    const verification = result.data_migration.targets[0];

    expect(result.data_migration.ok).toBe(true);
    expect(verification.ok).toBe(true);
    expect(verification.data_counts.checked_entities).toEqual(expect.arrayContaining([
      'product_folders',
      'products',
      'inventory_movements',
      'product_embeddings',
      'availments',
      'availment_items'
    ]));
    expect(verification.sales_reconciliation.ok).toBe(true);
    expect(verification.sales_reconciliation.status_totals.ok).toBe(true);
    expect(verification.sales_reconciliation.map_completeness.ok).toBe(true);
    expect(verification.sales_reconciliation.provenance.ok).toBe(true);
    expect(verification.sales_reconciliation.relationships.ok).toBe(true);
    expect(verification.sales_reconciliation.void_fidelity.ok).toBe(true);
  });

  test.each([
    ['header count', { targetOptions: { headerCountMismatch: true }, path: 'data_counts' }],
    ['exact totals', { targetOptions: { totalMismatch: true }, path: 'sales_reconciliation.status_totals' }],
    ['mapped status', { targetOptions: { statusMismatch: true }, path: 'sales_reconciliation.status_totals' }],
    ['header provenance', { targetOptions: { missingHeaderProvenance: true }, path: 'sales_reconciliation.provenance' }],
    ['line provenance', { targetOptions: { missingLineProvenance: true }, path: 'sales_reconciliation.provenance' }],
    ['parent FK', { targetOptions: { badParent: true }, path: 'sales_reconciliation.relationships' }],
    ['product FK', { targetOptions: { badProduct: true }, path: 'sales_reconciliation.relationships' }],
    ['map coverage', { mapOptions: { missingHeaderMap: true }, path: 'sales_reconciliation.map_completeness' }],
    ['void status', { targetOptions: { voidMismatch: true }, path: 'sales_reconciliation.void_fidelity' }]
  ])('fails on %s mismatch', async (_name, options) => {
    const result = await buildVerification(options);
    const verification = result.data_migration.targets[0];
    const failedSection = options.path.split('.').reduce((value, key) => value[key], verification);

    expect(failedSection.ok).toBe(false);
    expect(verification.ok).toBe(false);
    expect(result.data_migration.ok).toBe(false);
  });

  test('keeps only sales header attribution findings visible and non-blocking', async () => {
    expect([...SALES_ATTRIBUTION_REASON_CODES].sort()).toEqual([
      'sale_cashier_not_mapped',
      'sale_location_not_mapped',
      'sale_terminal_not_mapped'
    ]);

    const duplicateAttributionFindings = [
      {
        legacy_tenant_id: 't1',
        entity_type: 'availment',
        legacy_table: 'pos_transactions',
        legacy_id: '9101',
        severity: 'orphan',
        reason_code: MAPPING_REASON_CODES.SALE_TERMINAL_NOT_MAPPED
      },
      {
        legacy_tenant_id: 't1',
        entity_type: 'availment',
        legacy_table: 'pos_transactions',
        legacy_id: '9101',
        severity: 'orphan',
        reason_code: MAPPING_REASON_CODES.SALE_TERMINAL_NOT_MAPPED
      }
    ];
    const result = await buildVerification({ findings: duplicateAttributionFindings });

    expect(result.data_migration.ok).toBe(true);
    expect(result.data_migration.open_findings.ok).toBe(true);
    expect(result.data_migration.open_findings.sales_attribution_count).toBe(2);
    expect(result.data_migration.targets[0].data_counts.ok).toBe(true);
  });

  test('unsupported statuses and missing parent/product findings remain blocking', async () => {
    const result = await buildVerification({
      legacyOptions: { unsupportedStatus: true },
      findings: [
        {
          legacy_tenant_id: 't1',
          entity_type: 'availment',
          legacy_table: 'pos_transactions',
          legacy_id: '9103',
          severity: 'skip',
          reason_code: MAPPING_REASON_CODES.UNSUPPORTED_SALE_STATUS
        },
        {
          legacy_tenant_id: 't1',
          entity_type: 'availment_item',
          legacy_table: 'pos_transaction_lines',
          legacy_id: '9203',
          severity: 'orphan',
          reason_code: MAPPING_REASON_CODES.AVAILMENT_PARENT_NOT_MAPPED
        },
        {
          legacy_tenant_id: 't1',
          entity_type: 'availment_item',
          legacy_table: 'pos_transaction_lines',
          legacy_id: '9204',
          severity: 'orphan',
          reason_code: MAPPING_REASON_CODES.SALE_PRODUCT_NOT_MAPPED
        }
      ]
    });

    expect(result.data_migration.open_findings.ok).toBe(false);
    expect(result.data_migration.open_findings.blocking_findings.map((finding) => finding.reason_code)).toEqual([
      MAPPING_REASON_CODES.UNSUPPORTED_SALE_STATUS,
      MAPPING_REASON_CODES.AVAILMENT_PARENT_NOT_MAPPED,
      MAPPING_REASON_CODES.SALE_PRODUCT_NOT_MAPPED
    ]);
    expect(result.data_migration.ok).toBe(false);
  });
});
