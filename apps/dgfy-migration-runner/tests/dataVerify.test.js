import { jest } from '@jest/globals';

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
  checkDataCounts,
  checkRequiredRelationships,
  checkMapCompleteness,
  checkOpenFindings,
  summarizeStorefrontDiscoveryProjection,
  buildDataVerificationSections
} = await import('../src/data/verifyData.js');

describe('verifyData.js pure comparison functions (03-05 Task 2)', () => {
  describe('checkDataCounts', () => {
    test('reports ok:true when target counts match every entity\'s expected_target_count', () => {
      const result = checkDataCounts([
        { entity: 'staff_accounts', source_count: 5, expected_target_count: 5, target_count: 5 },
        { entity: 'locations', source_count: 2, expected_target_count: 2, target_count: 2 }
      ]);

      expect(result.ok).toBe(true);
      expect(result.mismatches).toEqual([]);
    });

    test('reports ok:false with a mismatch entry when target_count differs from expected_target_count', () => {
      const result = checkDataCounts([
        { entity: 'staff_accounts', source_count: 5, expected_target_count: 5, target_count: 3 }
      ]);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toEqual([
        { entity: 'staff_accounts', source_count: 5, expected_target_count: 5, target_count: 3 }
      ]);
    });

    test('does not fail when target_count is lower than raw source_count due to a legitimate skip (expected_target_count already net of skips)', () => {
      const result = checkDataCounts([
        { entity: 'staff_accounts', source_count: 5, expected_target_count: 4, target_count: 4 }
      ]);

      expect(result.ok).toBe(true);
    });
  });

  describe('checkRequiredRelationships', () => {
    test('reports ok:true when every account_staff_assignment has an accepted business_membership and every terminal resolves to a migrated location', () => {
      const result = checkRequiredRelationships({
        businessId: 'biz-1',
        accountStaffAssignments: [{ id: 1, dgfy_account_id: 'acct-1' }],
        businessMemberships: [{ account_id: 'acct-1', business_id: 'biz-1' }],
        terminalIdentities: [{ id: 1, location_id: 'loc-1' }],
        locationIds: ['loc-1']
      });

      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });

    test('reports a violation when an account_staff_assignment has no corresponding accepted business_membership (ADR 0028)', () => {
      const result = checkRequiredRelationships({
        businessId: 'biz-1',
        accountStaffAssignments: [{ id: 1, dgfy_account_id: 'acct-orphaned' }],
        businessMemberships: [{ account_id: 'acct-1', business_id: 'biz-1' }],
        terminalIdentities: [],
        locationIds: []
      });

      expect(result.ok).toBe(false);
      expect(result.violations).toEqual([
        expect.objectContaining({ entity_type: 'account_staff_assignment', target_id: 1 })
      ]);
    });

    test('reports a violation when a terminal_identity location_id does not resolve to a migrated location', () => {
      const result = checkRequiredRelationships({
        businessId: 'biz-1',
        accountStaffAssignments: [],
        businessMemberships: [],
        terminalIdentities: [{ id: 7, location_id: 'loc-missing' }],
        locationIds: ['loc-1', 'loc-2']
      });

      expect(result.ok).toBe(false);
      expect(result.violations).toEqual([
        expect.objectContaining({ entity_type: 'terminal_identity', target_id: 7 })
      ]);
    });

    test('reports a violation when a terminal_identity has no location_id at all', () => {
      const result = checkRequiredRelationships({
        businessId: 'biz-1',
        terminalIdentities: [{ id: 9, location_id: null }],
        locationIds: ['loc-1']
      });

      expect(result.ok).toBe(false);
      expect(result.violations[0].entity_type).toBe('terminal_identity');
    });
  });

  describe('checkMapCompleteness', () => {
    test('reports ok:true when every expected legacy key has a durable legacy_id_map row', () => {
      const result = checkMapCompleteness({
        expectedLegacyKeys: ['legacy_tenant|users|1', 'legacy_tenant|users|2'],
        mappedLegacyKeys: new Set(['legacy_tenant|users|1', 'legacy_tenant|users|2'])
      });

      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    test('reports ok:false with the missing keys when an expected legacy record has no legacy_id_map row', () => {
      const result = checkMapCompleteness({
        expectedLegacyKeys: ['legacy_tenant|users|1', 'legacy_tenant|users|2'],
        mappedLegacyKeys: new Set(['legacy_tenant|users|1'])
      });

      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(['legacy_tenant|users|2']);
      expect(result.expected_count).toBe(2);
      expect(result.mapped_count).toBe(1);
    });
  });

  describe('checkOpenFindings', () => {
    test('reports ok:true when there are no open findings', () => {
      const result = checkOpenFindings([]);

      expect(result.ok).toBe(true);
      expect(result.open_count).toBe(0);
    });

    test('reports ok:false when an open conflict finding exists (missing accepted membership must never be treated as clean)', () => {
      const result = checkOpenFindings([
        { severity: 'conflict', reason_code: 'MISSING_ACCEPTED_MEMBERSHIP' }
      ]);

      expect(result.ok).toBe(false);
      expect(result.open_count).toBe(1);
      expect(result.by_severity.conflict).toBe(1);
    });

    test('reports ok:false when an open skip finding exists', () => {
      const result = checkOpenFindings([{ severity: 'skip' }]);

      expect(result.ok).toBe(false);
      expect(result.by_severity.skip).toBe(1);
    });

    test('reports ok:false when an open orphan finding exists', () => {
      const result = checkOpenFindings([{ severity: 'orphan' }]);

      expect(result.ok).toBe(false);
      expect(result.by_severity.orphan).toBe(1);
    });
  });

  describe('summarizeStorefrontDiscoveryProjection', () => {
    test('is always blocking:false regardless of row count, so it never controls data_migration_ok', () => {
      expect(summarizeStorefrontDiscoveryProjection([]).blocking).toBe(false);
      expect(summarizeStorefrontDiscoveryProjection([{ id: 1 }, { id: 2 }]).blocking).toBe(false);
    });

    test('reports row_count matching the input length', () => {
      expect(summarizeStorefrontDiscoveryProjection([{ id: 1 }]).row_count).toBe(1);
    });
  });
});

describe('buildDataVerificationSections orchestration (03-05 Task 2)', () => {
  function fakeConnection({ queryImpl }) {
    return { query: queryImpl };
  }

  const target = {
    legacy_tenant_id: 't1',
    legacy_tenant_db_name: 'legacy_tenant_1',
    target_business_db_name: 'dgfy_business_alpha',
    expected_business_id: 'biz-1',
    expected_owner_account_id: 'acct-1'
  };

  beforeEach(() => {
    mockCreateSourceConnection.mockReset().mockReturnValue(fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('FROM tenants')) return Promise.resolve([[]]);
        if (sql.includes('FROM dgfy_account_tenant_memberships')) return Promise.resolve([[]]);
        if (sql.includes('FROM dgfy_accounts')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    }));

    mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('FROM users')) return Promise.resolve([[{ user_id: 1, email: 'a@x.com' }]]);
        if (sql.includes('FROM tenant_locations')) return Promise.resolve([[{ location_id: 1 }]]);
        if (sql.includes('FROM user_location_grants')) return Promise.resolve([[]]);
        if (sql.includes('FROM system_settings')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    }));

    mockListOpenDataQualityFindings.mockReset().mockResolvedValue([]);
  });

  test('a source/target count mismatch makes the target and overall data_migration section ok:false', async () => {
    mockCreateBusinessTargetConnection.mockReset().mockReturnValue(fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('FROM staff_accounts')) return Promise.resolve([[]]); // 0 rows vs 1 legacy user -> mismatch
        if (sql.includes('FROM account_staff_assignments')) return Promise.resolve([[]]);
        if (sql.includes('FROM locations')) return Promise.resolve([[{ id: 'loc-1' }]]);
        if (sql.includes('FROM terminal_identities')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    }));

    const metaSequelize = { query: jest.fn().mockResolvedValue([[]]) };
    const targetSequelize = fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('business_memberships')) return Promise.resolve([[]]);
        if (sql.includes('storefront_discovery_index')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    });

    const result = await buildDataVerificationSections({
      config: {},
      targetSequelize,
      metaSequelize,
      targets: [target]
    });

    expect(result.data_migration.targets[0].data_counts.ok).toBe(false);
    expect(result.data_migration.targets[0].ok).toBe(false);
    expect(result.data_migration.ok).toBe(false);
  });

  test('an open high-severity conflict finding makes data_migration_ok=false even when counts/relationships are otherwise clean', async () => {
    mockCreateBusinessTargetConnection.mockReset().mockReturnValue(fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('FROM staff_accounts')) return Promise.resolve([[{ id: 's1' }]]);
        if (sql.includes('FROM account_staff_assignments')) return Promise.resolve([[]]);
        if (sql.includes('FROM locations')) return Promise.resolve([[{ id: 'loc-1' }]]);
        if (sql.includes('FROM terminal_identities')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    }));
    mockListOpenDataQualityFindings.mockResolvedValue([
      { legacy_tenant_id: 't1', entity_type: 'business_membership', severity: 'conflict', reason_code: 'MISSING_ACCEPTED_MEMBERSHIP' }
    ]);

    const metaSequelize = { query: jest.fn().mockResolvedValue([[]]) };
    const targetSequelize = fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('business_memberships')) return Promise.resolve([[]]);
        if (sql.includes('storefront_discovery_index')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    });

    const result = await buildDataVerificationSections({
      config: {},
      targetSequelize,
      metaSequelize,
      targets: [target]
    });

    expect(result.data_migration.open_findings.ok).toBe(false);
    expect(result.data_migration.ok).toBe(false);
  });

  test('storefront_discovery_index rows never flip data_migration_ok to false (informational only)', async () => {
    mockCreateBusinessTargetConnection.mockReset().mockReturnValue(fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('FROM staff_accounts')) return Promise.resolve([[{ id: 's1' }]]);
        if (sql.includes('FROM account_staff_assignments')) return Promise.resolve([[]]);
        if (sql.includes('FROM locations')) return Promise.resolve([[{ id: 'loc-1' }]]);
        if (sql.includes('FROM terminal_identities')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }
    }));

    const metaSequelize = {
      query: jest.fn((sql) => {
        if (typeof sql === 'string' && sql.includes('legacy_id_map')) {
          return Promise.resolve([[
            { legacy_source: 'legacy_tenant', legacy_table: 'users', legacy_id: '1' },
            { legacy_source: 'legacy_tenant', legacy_table: 'tenant_locations', legacy_id: '1' }
          ]]);
        }
        return Promise.resolve([[]]);
      })
    };
    const targetSequelize = fakeConnection({
      queryImpl: (sql) => {
        if (sql.includes('business_memberships')) return Promise.resolve([[]]);
        if (sql.includes('storefront_discovery_index')) return Promise.resolve([[{ id: 1 }, { id: 2 }]]);
        return Promise.resolve([[]]);
      }
    });

    const result = await buildDataVerificationSections({
      config: {},
      targetSequelize,
      metaSequelize,
      targets: [target]
    });

    expect(result.data_migration.storefront_discovery_projection.row_count).toBe(2);
    expect(result.data_migration.storefront_discovery_projection.blocking).toBe(false);
    expect(result.data_migration.ok).toBe(true);
  });
});
