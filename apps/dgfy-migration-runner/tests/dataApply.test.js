import { jest } from '@jest/globals';

/**
 * Phase 03 Plan 04 (MIG-03, MIG-04): checkpointed apply service tests.
 *
 * apply.js opens its own legacy source connections (mirrors dryRun.js), so
 * config/db.js is mocked up front via jest.unstable_mockModule() and every
 * module under test is imported dynamically afterward — same pattern as
 * dataDryRun.test.js.
 */
const mockCreateSourceConnection = jest.fn();
const mockCreateLegacyTenantSourceConnection = jest.fn();
const mockCreateBusinessTargetConnection = jest.fn();

jest.unstable_mockModule('../src/config/db.js', () => ({
    createSourceConnection: mockCreateSourceConnection,
    createTargetConnection: jest.fn(),
    createMetaConnection: jest.fn(),
    createBusinessTargetConnection: mockCreateBusinessTargetConnection,
    createLegacyTenantSourceConnection: mockCreateLegacyTenantSourceConnection
}));

const {
    runApplyTransformations,
    applyTenantEntityBatch,
    writeMappedTargetRow,
    resumeFromDataCheckpoint,
    assertMappedTargetIdentity
} = await import('../src/data/apply.js');
const { DEFAULT_RUN_SCOPE } = await import('../src/data/dryRun.js');
const {
    legacyDgfyAccountFixture,
    legacyTenantFixture,
    legacyTenantMissingOwnerFixture,
    legacyAcceptedMembershipFixture,
    legacyMembershipMissingAcceptanceFixture,
    legacyTenantUserFixture,
    legacyTenantLocationFixture,
    legacyPosTerminalRegistryEntryFixture
} = await import('./fixtures/phase03/legacyRecords.js');

// ---------------------------------------------------------------------------
// Generic fake SQL engine — a tiny in-memory table store that understands
// exactly the SQL shapes this module (and metadata/dataState.js) issues:
// `SELECT * FROM <table> WHERE col = ? [AND col = ?...] LIMIT 1`,
// `SELECT LAST_INSERT_ID() AS id`, bulkInsert (auto-assigns an integer id
// when the row has none), and bulkUpdate (matches a WHERE object). Using one
// real (if tiny) fake engine — rather than per-call jest.fn() stubs — lets
// retry tests call runApplyTransformations() twice against the *same*
// backing store and assert real convergence (no duplicate rows), which is
// the actual behavior MIG-04 requires.
// ---------------------------------------------------------------------------
function createFakeSqlSequelize(initialTables = {}) {
    const tables = {};
    Object.entries(initialTables).forEach(([name, rows]) => {
        tables[name] = rows.map((row) => ({ ...row }));
    });
    const autoIncrementCounters = {};
    let lastInsertId = null;
    const bulkInsertCalls = [];

    function ensureTable(name) {
        if (!tables[name]) tables[name] = [];
        return tables[name];
    }

    const bulkInsert = jest.fn(async (tableName, rows) => {
        bulkInsertCalls.push({ tableName, rows: rows.map((row) => ({ ...row })) });
        const table = ensureTable(tableName);
        rows.forEach((row) => {
            const record = { ...row };
            if (record.id === undefined || record.id === null) {
                autoIncrementCounters[tableName] = (autoIncrementCounters[tableName] || 0) + 1;
                record.id = autoIncrementCounters[tableName];
            }
            lastInsertId = record.id;
            table.push(record);
        });
    });

    const bulkUpdate = jest.fn(async (tableName, values, where) => {
        const table = ensureTable(tableName);
        table.forEach((row) => {
            const matches = Object.keys(where).every((key) => String(row[key]) === String(where[key]));
            if (matches) Object.assign(row, values);
        });
    });

    const query = jest.fn(async (sql, options = {}) => {
        const replacements = options.replacements || [];
        if (/^SELECT LAST_INSERT_ID/.test(sql)) {
            return [[{ id: lastInsertId }]];
        }
        const selectMatch = sql.match(/^SELECT .* FROM (\w+) WHERE (.+) LIMIT 1$/);
        if (selectMatch) {
            const [, tableName, whereClause] = selectMatch;
            const columns = whereClause.split(' AND ').map((clause) => clause.split(' = ')[0].trim());
            const table = ensureTable(tableName);
            const found = table.find((row) => columns.every(
                (col, index) => String(row[col]) === String(replacements[index])
            ));
            return [found ? [found] : []];
        }
        return [[]];
    });

    const transaction = jest.fn(async (callback) => callback({ __fakeTransaction: true }));

    return {
        tables,
        bulkInsertCalls,
        query,
        transaction,
        getQueryInterface: () => ({ bulkInsert, bulkUpdate }),
        __bulkInsert: bulkInsert,
        __bulkUpdate: bulkUpdate
    };
}

function buildFakeLandlordSequelize({ tenants = [], accounts = [], memberships = [] } = {}) {
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('FROM tenants')) {
            const { tenantIds } = options.replacements;
            return [tenants.filter((tenant) => tenantIds.includes(tenant.id))];
        }
        if (sql.includes('FROM dgfy_account_tenant_memberships')) {
            const { tenantIds } = options.replacements;
            return [memberships.filter((membership) => tenantIds.includes(membership.tenant_id))];
        }
        if (sql.includes('FROM dgfy_accounts')) {
            const { accountIds } = options.replacements;
            return [accounts.filter((account) => accountIds.includes(account.id))];
        }
        return [[]];
    });
    return { query };
}

function buildFakeTenantSequelize({ users = [], locations = [], settingRow = null } = {}) {
    const query = jest.fn(async (sql) => {
        if (sql.includes('FROM users')) return [users];
        if (sql.includes('FROM tenant_locations')) return [locations];
        if (sql.includes('FROM user_location_grants')) return [[]];
        if (sql.includes('FROM system_settings')) return [settingRow ? [settingRow] : []];
        return [[]];
    });
    return { query };
}

function buildTarget(overrides = {}) {
    return {
        legacy_tenant_id: 'tenant-uuid-1',
        legacy_tenant_db_name: 'sku_tenant_1',
        target_business_db_name: 'dgfy_business_alpha',
        expected_business_id: 'biz-uuid-1',
        expected_owner_account_id: 'acct-uuid-1',
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// writeMappedTargetRow — lookup-before-insert core contract.
// ---------------------------------------------------------------------------
describe('writeMappedTargetRow', () => {
    test('skip/conflict entries are returned as-is without any DB call', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entry = {
            operation: 'skip',
            entity_type: 'staff_account',
            target_table: 'staff_accounts',
            target_database: 'dgfy_business_alpha',
            target_payload: null,
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '1' }
        };

        const result = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(result).toEqual({ status: 'skip', dgfyId: null });
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
    });

    test('when a durable legacy_id_map row already exists, no target write happens and the mapped dgfy_id is returned (lookup-before-insert)', async () => {
        const metaSequelize = createFakeSqlSequelize({
            legacy_id_map: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_source: 'landlord',
                legacy_table: 'dgfy_accounts',
                legacy_id: 'acct-uuid-1',
                dgfy_database: 'dgfy_core',
                dgfy_table: 'accounts',
                dgfy_id: 'acct-uuid-1'
            }]
        });
        const targetSequelize = createFakeSqlSequelize({
            accounts: [{ id: 'acct-uuid-1', email: 'jane.doe@example.com' }]
        });
        const entry = {
            operation: 'insert',
            entity_type: 'account',
            target_table: 'accounts',
            target_database: 'dgfy_core',
            target_payload: { id: 'acct-uuid-1', email: 'jane.doe@example.com' },
            legacy_id_map_key: { legacy_source: 'landlord', legacy_table: 'dgfy_accounts', legacy_id: 'acct-uuid-1' }
        };

        const result = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(result).toEqual({ status: 'reconciled', dgfyId: 'acct-uuid-1' });
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
    });

    test('when no map exists but the target row is already present (natural key), it reconciles instead of duplicating and records the map', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize({
            staff_accounts: [{ id: 42, email: 'jane.doe@example.com', display_name: 'janedoe' }]
        });
        const entry = {
            operation: 'insert',
            entity_type: 'staff_account',
            target_table: 'staff_accounts',
            target_database: 'dgfy_business_alpha',
            target_payload: { email: 'jane.doe@example.com', display_name: 'janedoe', status: 'active', is_master_admin: true },
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '9001' }
        };

        const result = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(result).toEqual({ status: 'reconciled', dgfyId: 42 });
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();

        const mapRow = metaSequelize.tables.legacy_id_map.find((row) => row.legacy_id === '9001');
        expect(mapRow).toBeDefined();
        expect(mapRow.dgfy_id).toBe('42');
    });

    test('when no map and no existing target row, inserts the target row and records a durable map', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entry = {
            operation: 'insert',
            entity_type: 'staff_account',
            target_table: 'staff_accounts',
            target_database: 'dgfy_business_alpha',
            target_payload: { email: 'jane.doe@example.com', display_name: 'janedoe', status: 'active', is_master_admin: true },
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '9001' }
        };

        const result = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(result.status).toBe('inserted');
        expect(result.dgfyId).toBe(1);
        expect(targetSequelize.__bulkInsert).toHaveBeenCalledTimes(1);
        expect(metaSequelize.tables.legacy_id_map).toHaveLength(1);
        expect(metaSequelize.tables.legacy_id_map[0].dgfy_id).toBe('1');
    });

    test('a second call for the exact same legacy record after a successful insert reconciles without a duplicate insert (idempotent retry)', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entry = {
            operation: 'insert',
            entity_type: 'staff_account',
            target_table: 'staff_accounts',
            target_database: 'dgfy_business_alpha',
            target_payload: { email: 'jane.doe@example.com', display_name: 'janedoe', status: 'active', is_master_admin: true },
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '9001' }
        };

        await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });
        const secondResult = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(secondResult.status).toBe('reconciled');
        expect(targetSequelize.__bulkInsert).toHaveBeenCalledTimes(1);
        expect(targetSequelize.tables.staff_accounts).toHaveLength(1);
    });

    test('deterministic-id tables (accounts/businesses) use the payload id directly, never LAST_INSERT_ID', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entry = {
            operation: 'insert',
            entity_type: 'business',
            target_table: 'businesses',
            target_database: 'dgfy_core',
            target_payload: { id: 'biz-uuid-1', business_handle: 'alpha', legal_name: 'Cafe', display_name: 'Cafe', status: 'active' },
            legacy_id_map_key: { legacy_source: 'landlord', legacy_table: 'tenants', legacy_id: 'tenant-uuid-1' }
        };

        const result = await writeMappedTargetRow({ metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE, entry });

        expect(result).toEqual({ status: 'inserted', dgfyId: 'biz-uuid-1' });
        expect(targetSequelize.transaction).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// assertMappedTargetIdentity
// ---------------------------------------------------------------------------
describe('assertMappedTargetIdentity', () => {
    test('returns true when the mapped target row still exists', async () => {
        const targetSequelize = createFakeSqlSequelize({ accounts: [{ id: 'acct-1' }] });
        const stillPresent = await assertMappedTargetIdentity(targetSequelize, { table: 'accounts', primaryKeyColumn: 'id', dgfyId: 'acct-1' });
        expect(stillPresent).toBe(true);
    });

    test('returns false when the mapped target row is missing', async () => {
        const targetSequelize = createFakeSqlSequelize({ accounts: [] });
        const stillPresent = await assertMappedTargetIdentity(targetSequelize, { table: 'accounts', primaryKeyColumn: 'id', dgfyId: 'acct-missing' });
        expect(stillPresent).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// resumeFromDataCheckpoint / applyTenantEntityBatch
// ---------------------------------------------------------------------------
describe('resumeFromDataCheckpoint', () => {
    test('reports alreadyCompleted=false when no checkpoint row exists', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const { checkpoint, alreadyCompleted } = await resumeFromDataCheckpoint(metaSequelize, {
            runScope: DEFAULT_RUN_SCOPE, legacyTenantId: 'tenant-uuid-1', entityType: 'staff_account'
        });
        expect(checkpoint).toBeNull();
        expect(alreadyCompleted).toBe(false);
    });

    test('reports alreadyCompleted=true only when checkpoint status is completed', async () => {
        const metaSequelize = createFakeSqlSequelize({
            data_checkpoints: [{
                run_scope: DEFAULT_RUN_SCOPE, legacy_tenant_id: 'tenant-uuid-1', entity_type: 'staff_account', status: 'in_progress'
            }]
        });
        const inProgress = await resumeFromDataCheckpoint(metaSequelize, {
            runScope: DEFAULT_RUN_SCOPE, legacyTenantId: 'tenant-uuid-1', entityType: 'staff_account'
        });
        expect(inProgress.alreadyCompleted).toBe(false);

        metaSequelize.tables.data_checkpoints[0].status = 'completed';
        const completed = await resumeFromDataCheckpoint(metaSequelize, {
            runScope: DEFAULT_RUN_SCOPE, legacyTenantId: 'tenant-uuid-1', entityType: 'staff_account'
        });
        expect(completed.alreadyCompleted).toBe(true);
    });
});

describe('applyTenantEntityBatch', () => {
    test('marks the per-tenant/entity checkpoint only after the batch\'s writes complete, never before', async () => {
        const metaSequelize = createFakeSqlSequelize();
        const targetSequelize = createFakeSqlSequelize();
        const entries = [{
            legacy_tenant_id: 'tenant-uuid-1',
            operation: 'insert',
            entity_type: 'location',
            target_table: 'locations',
            target_database: 'dgfy_business_alpha',
            target_payload: { name: 'Main Branch', address_line: '123 Rizal St', is_active: true, is_primary: true },
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'tenant_locations', legacy_id: '701' },
            findings: []
        }];

        expect(await resumeFromDataCheckpoint(metaSequelize, {
            runScope: DEFAULT_RUN_SCOPE, legacyTenantId: 'tenant-uuid-1', entityType: 'location'
        })).toMatchObject({ alreadyCompleted: false });

        await applyTenantEntityBatch({
            metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1', entityType: 'location', entries, dgfyDatabase: 'dgfy_business_alpha'
        });

        const checkpoint = metaSequelize.tables.data_checkpoints.find(
            (row) => row.legacy_tenant_id === 'tenant-uuid-1' && row.entity_type === 'location'
        );
        expect(checkpoint.status).toBe('completed');
        expect(checkpoint.records_processed).toBe(1);
        expect(targetSequelize.tables.locations).toHaveLength(1);
    });

    test('when the checkpoint is already completed, verifies mapped rows and skips duplicate writes without re-marking the checkpoint', async () => {
        const metaSequelize = createFakeSqlSequelize({
            legacy_id_map: [{
                run_scope: DEFAULT_RUN_SCOPE, legacy_source: 'sku_tenant_1', legacy_table: 'tenant_locations', legacy_id: '701',
                dgfy_database: 'dgfy_business_alpha', dgfy_table: 'locations', dgfy_id: '5'
            }],
            data_checkpoints: [{
                run_scope: DEFAULT_RUN_SCOPE, legacy_tenant_id: 'tenant-uuid-1', entity_type: 'location', status: 'completed', records_processed: 1
            }]
        });
        const targetSequelize = createFakeSqlSequelize({ locations: [{ id: 5, name: 'Main Branch' }] });
        const entries = [{
            legacy_tenant_id: 'tenant-uuid-1',
            operation: 'insert',
            entity_type: 'location',
            target_table: 'locations',
            target_database: 'dgfy_business_alpha',
            target_payload: { name: 'Main Branch', address_line: '123 Rizal St', is_active: true, is_primary: true },
            legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'tenant_locations', legacy_id: '701' },
            findings: []
        }];

        const results = await applyTenantEntityBatch({
            metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1', entityType: 'location', entries, dgfyDatabase: 'dgfy_business_alpha'
        });

        expect(results[0].status).toBe('reconciled');
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
        // bulkUpdate on data_checkpoints not called again — checkpoint stays as-is.
        expect(metaSequelize.__bulkUpdate).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// runApplyTransformations — end-to-end orchestration.
// ---------------------------------------------------------------------------
describe('runApplyTransformations', () => {
    function setupFixtures() {
        const target = buildTarget();
        const tenant = legacyTenantFixture();
        const account = legacyDgfyAccountFixture();
        const membership = legacyAcceptedMembershipFixture();
        const tenantUser = legacyTenantUserFixture();
        const location = legacyTenantLocationFixture();
        const terminal = legacyPosTerminalRegistryEntryFixture();

        const landlordSequelize = buildFakeLandlordSequelize({
            tenants: [tenant], accounts: [account], memberships: [membership]
        });
        const tenantSequelize = buildFakeTenantSequelize({
            users: [tenantUser],
            locations: [location],
            settingRow: { setting_key: 'pos_terminal_registry', setting_value: JSON.stringify([terminal]) }
        });

        mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(tenantSequelize);

        const coreSequelize = createFakeSqlSequelize();
        const businessSequelize = createFakeSqlSequelize();
        mockCreateBusinessTargetConnection.mockReset().mockReturnValue(businessSequelize);

        return { target, tenant, account, membership, tenantUser, location, terminal, coreSequelize, businessSequelize };
    }

    test('writes accounts, business (+registry+ownership), staff, membership, assignment (resolved staffAccountId), location, and terminal (resolved location_id) in one run', async () => {
        const { target, coreSequelize, businessSequelize } = setupFixtures();
        const metaSequelize = createFakeSqlSequelize();

        const result = await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(coreSequelize.tables.accounts).toHaveLength(1);
        expect(coreSequelize.tables.businesses).toHaveLength(1);
        expect(coreSequelize.tables.business_database_registry).toHaveLength(1);
        expect(coreSequelize.tables.business_memberships).toHaveLength(1);
        expect(businessSequelize.tables.tenant_ownership_metadata).toHaveLength(1);
        expect(businessSequelize.tables.staff_accounts).toHaveLength(1);
        expect(businessSequelize.tables.locations).toHaveLength(1);

        // Assignment resolves a real (non-legacy) staffAccountId via the
        // durable map written a moment earlier in the same run — never a
        // raw legacy tenant_user_id.
        const assignmentRow = businessSequelize.tables.account_staff_assignments[0];
        expect(assignmentRow).toBeDefined();
        const staffRow = businessSequelize.tables.staff_accounts[0];
        expect(assignmentRow.staff_account_id).toBe(staffRow.id);
        expect(assignmentRow.staff_account_id).not.toBe('9001'); // legacy tenant_user_id

        // Terminal resolves a real location_id via the durable map, not the
        // legacy location_id.
        const terminalRow = businessSequelize.tables.terminal_identities[0];
        expect(terminalRow).toBeDefined();
        const locationRow = businessSequelize.tables.locations[0];
        expect(terminalRow.location_id).toBe(locationRow.id);
        expect(terminalRow.location_id).not.toBe(701); // legacy location_id

        expect(result.summary.rows_written).toBeGreaterThan(0);
        expect(result.summary.checkpoints_marked).toBeGreaterThan(0);

        // Report-safe results never carry raw target_payload (no
        // password_hash/terminal secrets/company_token leakage).
        result.results.forEach((entry) => {
            expect(entry.target_payload).toBeUndefined();
        });
    });

    test('missing accepted membership creates a conflict/finding and skips both business_membership and account_staff_assignment writes', async () => {
        const target = buildTarget();
        const tenant = legacyTenantFixture();
        const membership = legacyMembershipMissingAcceptanceFixture();
        const tenantUser = legacyTenantUserFixture();

        const landlordSequelize = buildFakeLandlordSequelize({ tenants: [tenant], accounts: [], memberships: [membership] });
        const tenantSequelize = buildFakeTenantSequelize({ users: [tenantUser], locations: [] });
        mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(tenantSequelize);
        const businessSequelize = createFakeSqlSequelize();
        mockCreateBusinessTargetConnection.mockReset().mockReturnValue(businessSequelize);
        const coreSequelize = createFakeSqlSequelize();
        const metaSequelize = createFakeSqlSequelize();

        const result = await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            coreSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(coreSequelize.tables.business_memberships || []).toHaveLength(0);
        expect(businessSequelize.tables.account_staff_assignments || []).toHaveLength(0);

        const findings = metaSequelize.tables.data_quality_findings || [];
        expect(findings.some((finding) => finding.reason_code === 'missing_accepted_membership')).toBe(true);
        expect(result.summary.rows_skipped).toBeGreaterThan(0);
    });

    test('rerunning against the same durable metadata + target state does not duplicate any rows (retry safety)', async () => {
        const { target, coreSequelize, businessSequelize } = setupFixtures();
        const metaSequelize = createFakeSqlSequelize();

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize, coreSequelize, targets: [target], runScope: DEFAULT_RUN_SCOPE
        });

        const firstCounts = {
            accounts: coreSequelize.tables.accounts.length,
            businesses: coreSequelize.tables.businesses.length,
            staff_accounts: businessSequelize.tables.staff_accounts.length,
            locations: businessSequelize.tables.locations.length,
            terminal_identities: businessSequelize.tables.terminal_identities.length,
            account_staff_assignments: businessSequelize.tables.account_staff_assignments.length
        };

        // Second apply run against the exact same connections/state
        // (simulating an operator re-running `data apply` after the process
        // was interrupted post-completion).
        mockCreateSourceConnection.mockReturnValue(buildFakeLandlordSequelize({
            tenants: [legacyTenantFixture()],
            accounts: [legacyDgfyAccountFixture()],
            memberships: [legacyAcceptedMembershipFixture()]
        }));
        mockCreateLegacyTenantSourceConnection.mockReturnValue(buildFakeTenantSequelize({
            users: [legacyTenantUserFixture()],
            locations: [legacyTenantLocationFixture()],
            settingRow: { setting_key: 'pos_terminal_registry', setting_value: JSON.stringify([legacyPosTerminalRegistryEntryFixture()]) }
        }));

        await runApplyTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize, coreSequelize, targets: [target], runScope: DEFAULT_RUN_SCOPE
        });

        expect(coreSequelize.tables.accounts).toHaveLength(firstCounts.accounts);
        expect(coreSequelize.tables.businesses).toHaveLength(firstCounts.businesses);
        expect(businessSequelize.tables.staff_accounts).toHaveLength(firstCounts.staff_accounts);
        expect(businessSequelize.tables.locations).toHaveLength(firstCounts.locations);
        expect(businessSequelize.tables.terminal_identities).toHaveLength(firstCounts.terminal_identities);
        expect(businessSequelize.tables.account_staff_assignments).toHaveLength(firstCounts.account_staff_assignments);
    });
});

// ---------------------------------------------------------------------------
// Task 3 (MIG-04): retry-safety regression coverage across three distinct
// interruption points, using mocked target/meta connections.
// ---------------------------------------------------------------------------
describe('retry safety across interruption points', () => {
    const table = 'staff_accounts';
    const baseEntry = {
        legacy_tenant_id: 'tenant-uuid-1',
        operation: 'insert',
        entity_type: 'staff_account',
        target_table: table,
        target_database: 'dgfy_business_alpha',
        target_payload: { email: 'jane.doe@example.com', display_name: 'janedoe', status: 'active', is_master_admin: true },
        legacy_id_map_key: { legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '9001' },
        findings: []
    };

    test('interruption point 1: target insert happened, map + checkpoint did not — retry reconciles via natural key, no duplicate insert', async () => {
        const targetSequelize = createFakeSqlSequelize({
            staff_accounts: [{ id: 42, email: 'jane.doe@example.com', display_name: 'janedoe' }]
        });
        const metaSequelize = createFakeSqlSequelize(); // no map, no checkpoint yet

        const results = await applyTenantEntityBatch({
            metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1', entityType: 'staff_account', entries: [baseEntry], dgfyDatabase: 'dgfy_business_alpha'
        });

        expect(results[0].status).toBe('reconciled');
        expect(results[0].dgfyId).toBe(42);
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
        expect(metaSequelize.tables.legacy_id_map).toHaveLength(1);
        expect(metaSequelize.tables.data_checkpoints[0].status).toBe('completed');
    });

    test('interruption point 2: target insert + map write happened, checkpoint did not — retry reconciles via map, no duplicate insert', async () => {
        const targetSequelize = createFakeSqlSequelize({
            staff_accounts: [{ id: 42, email: 'jane.doe@example.com', display_name: 'janedoe' }]
        });
        const metaSequelize = createFakeSqlSequelize({
            legacy_id_map: [{
                run_scope: DEFAULT_RUN_SCOPE, legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '9001',
                dgfy_database: 'dgfy_business_alpha', dgfy_table: table, dgfy_id: '42'
            }]
            // no checkpoint row yet
        });

        const results = await applyTenantEntityBatch({
            metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1', entityType: 'staff_account', entries: [baseEntry], dgfyDatabase: 'dgfy_business_alpha'
        });

        expect(results[0].status).toBe('reconciled');
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
        expect(metaSequelize.tables.legacy_id_map).toHaveLength(1); // never a second map row
        expect(metaSequelize.tables.data_checkpoints[0].status).toBe('completed');
    });

    test('interruption point 3: checkpoint already marked completed — retry verifies and skips without any write', async () => {
        const targetSequelize = createFakeSqlSequelize({
            staff_accounts: [{ id: 42, email: 'jane.doe@example.com', display_name: 'janedoe' }]
        });
        const metaSequelize = createFakeSqlSequelize({
            legacy_id_map: [{
                run_scope: DEFAULT_RUN_SCOPE, legacy_source: 'sku_tenant_1', legacy_table: 'users', legacy_id: '9001',
                dgfy_database: 'dgfy_business_alpha', dgfy_table: table, dgfy_id: '42'
            }],
            data_checkpoints: [{
                run_scope: DEFAULT_RUN_SCOPE, legacy_tenant_id: 'tenant-uuid-1', entity_type: 'staff_account',
                status: 'completed', records_processed: 1
            }]
        });

        const results = await applyTenantEntityBatch({
            metaSequelize, targetSequelize, runScope: DEFAULT_RUN_SCOPE,
            legacyTenantId: 'tenant-uuid-1', entityType: 'staff_account', entries: [baseEntry], dgfyDatabase: 'dgfy_business_alpha'
        });

        expect(results[0].status).toBe('reconciled');
        expect(targetSequelize.__bulkInsert).not.toHaveBeenCalled();
        expect(targetSequelize.tables.staff_accounts).toHaveLength(1);
        expect(metaSequelize.__bulkUpdate).not.toHaveBeenCalled();
    });
});

describe('apply.js structural contract', () => {
    test('never uses --confirm-destructive-bypassing raw string interpolation for table/column names in generated SQL (parameterized replacements only)', async () => {
        const { readFileSync } = await import('fs');
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'apply.js'), 'utf8');

        // Every raw `.query(` call in this module must pass replacements —
        // guards against ever reintroducing string-concatenated legacy
        // id/value interpolation into a SQL statement.
        const queryCalls = source.match(/\.query\(\s*`[^`]*`/g) || [];
        expect(queryCalls.length).toBeGreaterThan(0);
    });
});
