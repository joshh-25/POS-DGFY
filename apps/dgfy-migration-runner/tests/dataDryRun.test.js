import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// dryRun.js imports createSourceConnection/createLegacyTenantSourceConnection
// from ../config/db.js at module load time. ESM named exports are read-only
// bindings — jest.spyOn() cannot reassign them — so config/db.js is mocked
// up front via jest.unstable_mockModule() (same pattern as
// dataCommand.test.js) and every module under test is imported dynamically
// afterward so it resolves against the mock.
const mockCreateSourceConnection = jest.fn();
const mockCreateLegacyTenantSourceConnection = jest.fn();

jest.unstable_mockModule('../src/config/db.js', () => ({
    createSourceConnection: mockCreateSourceConnection,
    createTargetConnection: jest.fn(),
    createMetaConnection: jest.fn(),
    createBusinessTargetConnection: jest.fn(),
    createLegacyTenantSourceConnection: mockCreateLegacyTenantSourceConnection
}));

const { readLegacyLandlordSnapshot, readLegacyTenantSnapshot } = await import('../src/data/legacySource.js');
const { buildDryRunPlan, summarizeDryRunReport, runDryRunTransformations, DEFAULT_RUN_SCOPE, redactTargetPayload } = await import('../src/data/dryRun.js');
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
// legacySource.js — read-only, scoped-to-manifest source readers.
// ---------------------------------------------------------------------------

function buildFakeLandlordSequelize({ tenants = [], accounts = [], memberships = [] } = {}) {
    const calls = [];
    const query = jest.fn(async (sql, options = {}) => {
        calls.push({ sql, options });

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

    return { query, __calls: calls };
}

function buildFakeTenantSequelize({ users = [], locations = [], userLocationGrants = [], settingRow = null } = {}) {
    const calls = [];
    const query = jest.fn(async (sql, options = {}) => {
        calls.push({ sql, options });

        if (sql.includes('FROM users')) return [users];
        if (sql.includes('FROM tenant_locations')) return [locations];
        if (sql.includes('FROM user_location_grants')) return [userLocationGrants];
        if (sql.includes('FROM system_settings')) return [settingRow ? [settingRow] : []];
        return [[]];
    });

    return { query, __calls: calls };
}

describe('readLegacyLandlordSnapshot', () => {
    test('scopes tenants/memberships/accounts to exactly the manifest-listed legacy_tenant_id targets, never enumerating every tenant', async () => {
        const tenants = [
            { id: 'tenant-1', owner_dgfy_account_id: 'acct-1' },
            { id: 'tenant-2', owner_dgfy_account_id: 'acct-2' }
        ];
        const memberships = [{ id: 501, tenant_id: 'tenant-1', dgfy_account_id: 'acct-3' }];
        const accounts = [{ id: 'acct-1' }, { id: 'acct-2' }, { id: 'acct-3' }];
        const landlordSequelize = buildFakeLandlordSequelize({ tenants, memberships, accounts });

        const result = await readLegacyLandlordSnapshot(landlordSequelize, [{ legacy_tenant_id: 'tenant-1' }]);

        expect(result.tenants).toEqual([tenants[0]]);
        expect(result.memberships).toEqual([memberships[0]]);
        // Scoped to owner (acct-1) + membership account (acct-3) only —
        // never acct-2, tenant-2's owner, which is out of manifest scope.
        expect(result.accounts.map((account) => account.id).sort()).toEqual(['acct-1', 'acct-3']);
    });

    test('tenants query uses a WHERE id IN (...) filter, never an unscoped SELECT *', async () => {
        const landlordSequelize = buildFakeLandlordSequelize({});
        await readLegacyLandlordSnapshot(landlordSequelize, [{ legacy_tenant_id: 'tenant-1' }]);

        const tenantsQuery = landlordSequelize.__calls.find((call) => call.sql.includes('FROM tenants'));
        expect(tenantsQuery.sql).toMatch(/WHERE id IN/);
        expect(tenantsQuery.options.replacements.tenantIds).toEqual(['tenant-1']);
    });

    test('issues zero queries and returns empty arrays when targets is empty (D-01: never auto-discovers)', async () => {
        const landlordSequelize = buildFakeLandlordSequelize({});

        const result = await readLegacyLandlordSnapshot(landlordSequelize, []);

        expect(result).toEqual({ tenants: [], accounts: [], memberships: [] });
        expect(landlordSequelize.query).not.toHaveBeenCalled();
    });

    test('never queries an excluded POS/product/inventory/fiscal table', async () => {
        const landlordSequelize = buildFakeLandlordSequelize({});
        await readLegacyLandlordSnapshot(landlordSequelize, [{ legacy_tenant_id: 'tenant-1' }]);

        const excludedPattern = /pos_transactions|pos_terminal_shifts|fiscal_receipts|fiscal_compliance_logs|\bitems\b|\bproducts\b|purchase_orders|job_orders|stock_movements/i;
        landlordSequelize.__calls.forEach((call) => {
            expect(call.sql).not.toMatch(excludedPattern);
        });
    });
});

describe('readLegacyTenantSnapshot', () => {
    test('reads users, tenant_locations, user_location_grants, and only the pos_terminal_registry system_setting', async () => {
        const settingRow = {
            setting_key: 'pos_terminal_registry',
            setting_value: JSON.stringify([{ terminal_id: 'TERM-1', label: 'Front', location_id: 701, is_active: true }])
        };
        const tenantSequelize = buildFakeTenantSequelize({
            users: [{ user_id: 1 }],
            locations: [{ location_id: 701 }],
            userLocationGrants: [{ user_id: 1, location_id: 701 }],
            settingRow
        });

        const snapshot = await readLegacyTenantSnapshot(tenantSequelize);

        expect(snapshot.users).toEqual([{ user_id: 1 }]);
        expect(snapshot.locations).toEqual([{ location_id: 701 }]);
        expect(snapshot.userLocationGrants).toEqual([{ user_id: 1, location_id: 701 }]);
        expect(snapshot.terminalRegistry).toEqual([
            { terminal_id: 'TERM-1', label: 'Front', location_id: 701, is_active: true }
        ]);

        const settingCall = tenantSequelize.__calls.find((call) => call.sql.includes('FROM system_settings'));
        expect(settingCall.sql).toContain('WHERE setting_key = ?');
        expect(settingCall.options.replacements).toEqual(['pos_terminal_registry']);
    });

    test('returns an empty terminal registry array when no pos_terminal_registry row exists', async () => {
        const tenantSequelize = buildFakeTenantSequelize({});

        const snapshot = await readLegacyTenantSnapshot(tenantSequelize);

        expect(snapshot.terminalRegistry).toEqual([]);
    });

    test('returns an empty terminal registry array (never throws) when setting_value is malformed JSON', async () => {
        const tenantSequelize = buildFakeTenantSequelize({
            settingRow: { setting_key: 'pos_terminal_registry', setting_value: '{ not valid json' }
        });

        const snapshot = await readLegacyTenantSnapshot(tenantSequelize);

        expect(snapshot.terminalRegistry).toEqual([]);
    });

    test('never issues a query against an excluded POS/product/inventory/fiscal table', async () => {
        const tenantSequelize = buildFakeTenantSequelize({});
        await readLegacyTenantSnapshot(tenantSequelize);

        const excludedPattern = /pos_transactions|pos_terminal_shifts|cashier_sessions|terminal_sessions|fiscal_receipts|fiscal_compliance_logs|\bitems\b|\bproducts\b|purchase_orders|job_orders|stock_movements/i;
        tenantSequelize.__calls.forEach((call) => {
            expect(call.sql).not.toMatch(excludedPattern);
        });
    });
});

describe('legacySource.js import contract', () => {
    test('has zero backend runtime imports (no backend/src/* module specifiers)', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'legacySource.js'), 'utf8');
        const matches = source.match(/from ['"][^'"]*backend\/src[^'"]*['"]/g) || [];

        expect(matches.length).toBe(0);
    });

    test('has zero Sequelize/mysql2 import (only issues raw SQL against a connection the caller supplies)', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'legacySource.js'), 'utf8');
        const matches = source.match(/from ['"]sequelize['"]|from ['"]mysql2['"]/g) || [];

        expect(matches.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// dryRun.js — buildDryRunPlan() / summarizeDryRunReport() (pure).
// ---------------------------------------------------------------------------

describe('buildDryRunPlan', () => {
    test('happy path: account + business (+ registry + ownership metadata) + accepted membership/assignment + location + terminal all plan as inserts', () => {
        const target = {
            legacy_tenant_id: 'tenant-uuid-1',
            legacy_tenant_db_name: 'sku_tenant_1',
            target_business_db_name: 'dgfy_business_alpha',
            expected_business_id: 'biz-uuid-1',
            expected_owner_account_id: 'acct-uuid-1'
        };
        const landlordSnapshot = {
            tenants: [legacyTenantFixture()],
            accounts: [legacyDgfyAccountFixture()],
            memberships: [legacyAcceptedMembershipFixture()]
        };
        const tenantSnapshots = new Map([[target.legacy_tenant_id, {
            users: [legacyTenantUserFixture()],
            locations: [legacyTenantLocationFixture()],
            terminalRegistry: [legacyPosTerminalRegistryEntryFixture()]
        }]]);

        const entries = buildDryRunPlan({ targets: [target], landlordSnapshot, tenantSnapshots });

        const byEntityType = (entityType) => entries.filter((entry) => entry.entity_type === entityType);

        expect(byEntityType('account')[0].operation).toBe('insert');
        expect(byEntityType('business')[0].operation).toBe('insert');
        expect(byEntityType('business_database_registry')[0].operation).toBe('insert');
        expect(byEntityType('tenant_ownership_metadata')[0].operation).toBe('insert');
        expect(byEntityType('business_membership')[0].operation).toBe('insert');
        expect(byEntityType('staff_account')[0].operation).toBe('insert');
        expect(byEntityType('location')[0].operation).toBe('insert');
        // Terminal is inserted with location_id null on the first-ever dry-run
        // (no prior apply has migrated the location yet -> no resolved id),
        // with an orphan finding attached (location_not_mapped) — not a skip.
        const terminalEntry = byEntityType('terminal_identity')[0];
        expect(terminalEntry.operation).toBe('insert');
        expect(terminalEntry.target_payload.location_id).toBeNull();
        expect(terminalEntry.findings.some((finding) => finding.reason_code === 'location_not_mapped')).toBe(true);

        // Account-staff assignment cannot resolve a staff_account_id on a
        // first-ever dry-run either (no prior apply) -> orphan skip.
        const assignmentEntry = byEntityType('account_staff_assignment')[0];
        expect(assignmentEntry.operation).toBe('skip');
        expect(assignmentEntry.findings[0].reason_code).toBe('orphan_tenant_user_link');
    });

    test('reclassifies insert -> update when the legacy record already has a legacy_id_map row for this run scope (current target state probe)', () => {
        const account = legacyDgfyAccountFixture();
        const resolvedIdMap = new Map([[`landlord|dgfy_accounts|${account.id}`, account.id]]);

        const entries = buildDryRunPlan({
            targets: [],
            landlordSnapshot: { tenants: [], accounts: [account], memberships: [] },
            tenantSnapshots: new Map(),
            resolvedIdMap
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].operation).toBe('update');
    });

    test('resolves a staff_account_id from resolvedIdMap so an accepted membership plans a real account_staff_assignment insert', () => {
        const target = {
            legacy_tenant_id: 'tenant-uuid-1',
            legacy_tenant_db_name: 'sku_tenant_1',
            target_business_db_name: 'dgfy_business_alpha',
            expected_business_id: 'biz-uuid-1',
            expected_owner_account_id: 'acct-uuid-1'
        };
        const membership = legacyAcceptedMembershipFixture();
        const tenantUser = legacyTenantUserFixture();
        const resolvedIdMap = new Map([
            [`sku_tenant_1|users|${tenantUser.user_id}`, 'staff-uuid-resolved']
        ]);

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [legacyTenantFixture()], accounts: [], memberships: [membership] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, { users: [tenantUser], locations: [], terminalRegistry: [] }]]),
            resolvedIdMap
        });

        const assignmentEntry = entries.find((entry) => entry.entity_type === 'account_staff_assignment');
        expect(assignmentEntry.operation).toBe('insert');
        expect(assignmentEntry.target_payload.staff_account_id).toBe('staff-uuid-resolved');
    });

    test('emits a conflict finding when the manifest references a legacy_tenant_id absent from the landlord tenants snapshot', () => {
        const target = {
            legacy_tenant_id: 'tenant-does-not-exist',
            legacy_tenant_db_name: 'sku_tenant_missing',
            target_business_db_name: 'dgfy_business_alpha',
            expected_business_id: 'biz-uuid-1',
            expected_owner_account_id: 'acct-uuid-1'
        };

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [], accounts: [], memberships: [] },
            tenantSnapshots: new Map()
        });

        const businessEntry = entries.find((entry) => entry.entity_type === 'business');
        expect(businessEntry.operation).toBe('conflict');
        expect(businessEntry.findings[0].reason_code).toBe('missing_required_field');
    });

    test('tenant with no owner_dgfy_account_id plans the business row but attaches a missing_owner_evidence conflict, and skips tenant_ownership_metadata', () => {
        const target = {
            legacy_tenant_id: 'tenant-uuid-1',
            legacy_tenant_db_name: 'sku_tenant_1',
            target_business_db_name: 'dgfy_business_alpha',
            expected_business_id: 'biz-uuid-1',
            expected_owner_account_id: 'acct-uuid-1'
        };

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [legacyTenantMissingOwnerFixture()], accounts: [], memberships: [] },
            tenantSnapshots: new Map()
        });

        const businessEntry = entries.find((entry) => entry.entity_type === 'business');
        expect(businessEntry.operation).toBe('insert');
        expect(businessEntry.findings[0].reason_code).toBe('missing_owner_evidence');
        expect(entries.some((entry) => entry.entity_type === 'tenant_ownership_metadata')).toBe(false);
    });

    test('membership not yet accepted plans a skip for both business_membership and account_staff_assignment, never inferred from email', () => {
        const target = {
            legacy_tenant_id: 'tenant-uuid-1',
            legacy_tenant_db_name: 'sku_tenant_1',
            target_business_db_name: 'dgfy_business_alpha',
            expected_business_id: 'biz-uuid-1',
            expected_owner_account_id: 'acct-uuid-1'
        };
        const membership = legacyMembershipMissingAcceptanceFixture();

        const entries = buildDryRunPlan({
            targets: [target],
            landlordSnapshot: { tenants: [legacyTenantFixture()], accounts: [], memberships: [membership] },
            tenantSnapshots: new Map([[target.legacy_tenant_id, { users: [legacyTenantUserFixture()], locations: [], terminalRegistry: [] }]])
        });

        const membershipEntry = entries.find((entry) => entry.entity_type === 'business_membership');
        const assignmentEntry = entries.find((entry) => entry.entity_type === 'account_staff_assignment');
        expect(membershipEntry.operation).toBe('skip');
        expect(membershipEntry.findings[0].reason_code).toBe('missing_accepted_membership');
        expect(assignmentEntry.operation).toBe('skip');
        expect(assignmentEntry.findings[0].reason_code).toBe('missing_accepted_membership');
    });
});

describe('summarizeDryRunReport', () => {
    test('produces scalar-only summary counters plus a separate per-tenant tenant_coverage array', () => {
        const targets = [
            { legacy_tenant_id: 'tenant-1', legacy_tenant_db_name: 'sku_tenant_1', target_business_db_name: 'dgfy_business_alpha' },
            { legacy_tenant_id: 'tenant-2', legacy_tenant_db_name: 'sku_tenant_2', target_business_db_name: 'dgfy_business_beta' }
        ];
        const entries = [
            { legacy_tenant_id: 'tenant-1', operation: 'insert', findings: [] },
            { legacy_tenant_id: 'tenant-1', operation: 'update', findings: [] },
            { legacy_tenant_id: 'tenant-1', operation: 'skip', findings: [{ severity: 'skip', reason_code: 'missing_required_field' }] },
            { legacy_tenant_id: 'tenant-2', operation: 'conflict', findings: [{ severity: 'conflict', reason_code: 'owner_mismatch' }] },
            { legacy_tenant_id: 'tenant-2', operation: 'insert', findings: [{ severity: 'orphan', reason_code: 'location_not_mapped' }] },
            { legacy_tenant_id: null, operation: 'insert', findings: [] } // account row, not tenant-scoped
        ];

        const { summary, tenant_coverage } = summarizeDryRunReport(entries, targets);

        expect(summary).toEqual({
            planned_inserts: 3,
            planned_updates: 1,
            planned_skips: 1,
            planned_conflicts: 1,
            orphan_records: 1,
            tenant_coverage_count: 2
        });
        Object.values(summary).forEach((value) => {
            expect(typeof value).toBe('number');
        });

        expect(tenant_coverage).toEqual([
            { legacy_tenant_id: 'tenant-1', legacy_tenant_db_name: 'sku_tenant_1', target_business_db_name: 'dgfy_business_alpha', entities_planned: 3 },
            { legacy_tenant_id: 'tenant-2', legacy_tenant_db_name: 'sku_tenant_2', target_business_db_name: 'dgfy_business_beta', entities_planned: 2 }
        ]);
    });
});

describe('redactTargetPayload', () => {
    test('removes bcrypt password and POS PIN hashes from account and staff credential report entries while preserving non-secret fields', () => {
        const accountEntry = {
            legacy_tenant_id: null,
            operation: 'insert',
            entity_type: 'account',
            target_table: 'accounts',
            target_database: 'dgfy_core',
            target_payload: {
                id: 'acct-uuid-1',
                email: 'owner@example.com',
                display_name: 'Owner',
                password_hash: '$2a$10$accountbcryptfixture',
                status: 'active'
            },
            findings: []
        };
        const credentialEntry = {
            legacy_tenant_id: 'tenant-1',
            operation: 'insert',
            entity_type: 'staff_credential',
            target_table: 'staff_credentials',
            target_database: 'dgfy_business_alpha',
            target_payload: {
                staff_account_id: 42,
                password_hash: '$2b$10$staffbcryptfixture',
                pos_approval_pin_hash: '$2y$10$pinbcryptfixture',
                credential_status: 'active'
            },
            findings: [{ reason_code: 'staff_credential_reset_required', message: 'Reset required' }]
        };

        const redactedAccount = redactTargetPayload(accountEntry);
        const redactedCredential = redactTargetPayload(credentialEntry);
        const serialized = JSON.stringify([redactedAccount, redactedCredential]);

        expect(serialized).not.toMatch(/\$2[abxy]\$/);
        expect(redactedAccount.target_payload).toEqual({
            id: 'acct-uuid-1',
            email: 'owner@example.com',
            display_name: 'Owner',
            status: 'active',
            has_password_hash: true
        });
        expect(redactedCredential.target_payload).toEqual({
            staff_account_id: 42,
            credential_status: 'active',
            has_password_hash: true,
            has_pos_approval_pin_hash: true
        });
        expect(redactedCredential.findings).toEqual(credentialEntry.findings);
    });

    test('adds false evidence flags for credential-bearing tables when hash fields are null or absent', () => {
        const redactedAccount = redactTargetPayload({
            entity_type: 'account',
            target_table: 'accounts',
            target_payload: {
                email: 'owner@example.com',
                password_hash: null
            }
        });
        const redactedCredential = redactTargetPayload({
            entity_type: 'staff_credential',
            target_table: 'staff_credentials',
            target_payload: {
                credential_status: 'reset_required',
                password_hash: null
            }
        });

        expect(redactedAccount.target_payload).toEqual({
            email: 'owner@example.com',
            has_password_hash: false
        });
        expect(redactedCredential.target_payload).toEqual({
            credential_status: 'reset_required',
            has_password_hash: false,
            has_pos_approval_pin_hash: false
        });
    });
});

// ---------------------------------------------------------------------------
// runDryRunTransformations() — orchestrator (mocked connections/metadata).
// ---------------------------------------------------------------------------

describe('runDryRunTransformations', () => {
    function buildFakeMetaSequelize({ existingIdMapRows = [] } = {}) {
        const insertedFindings = [];
        const query = jest.fn(async (sql, options = {}) => {
            if (sql.includes('FROM legacy_id_map')) {
                const [runScope] = options.replacements;
                return [existingIdMapRows.filter((row) => row.run_scope === runScope)];
            }
            return [[]];
        });
        const bulkInsert = jest.fn(async (tableName, rows) => {
            if (tableName === 'data_quality_findings') {
                insertedFindings.push(...rows);
            }
        });
        return {
            query,
            getQueryInterface: () => ({ bulkInsert, bulkUpdate: jest.fn() }),
            __insertedFindings: insertedFindings
        };
    }

    test('persists every finding via recordDataQualityFinding and returns scalar summary + tenant_coverage + entries, without any target mutation or checkpoint call', async () => {
        const target = {
            legacy_tenant_id: 'tenant-uuid-1',
            legacy_tenant_db_name: 'sku_tenant_1',
            target_business_db_name: 'dgfy_business_alpha',
            expected_business_id: 'biz-uuid-1',
            expected_owner_account_id: 'acct-uuid-1'
        };

        const landlordSequelize = buildFakeLandlordSequelize({
            tenants: [legacyTenantFixture()],
            accounts: [legacyDgfyAccountFixture()],
            memberships: [legacyAcceptedMembershipFixture()]
        });
        const tenantSequelize = buildFakeTenantSequelize({
            users: [legacyTenantUserFixture()],
            locations: [legacyTenantLocationFixture()],
            settingRow: {
                setting_key: 'pos_terminal_registry',
                setting_value: JSON.stringify([legacyPosTerminalRegistryEntryFixture()])
            }
        });

        mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(tenantSequelize);

        const metaSequelize = buildFakeMetaSequelize();

        const result = await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [target],
            runScope: DEFAULT_RUN_SCOPE
        });

        expect(result.run_scope).toBe(DEFAULT_RUN_SCOPE);
        expect(typeof result.summary.planned_inserts).toBe('number');
        expect(Array.isArray(result.tenant_coverage)).toBe(true);
        expect(Array.isArray(result.entries)).toBe(true);

        // At least the orphan terminal finding + orphan assignment finding
        // are persisted (first-ever dry-run, no prior apply).
        expect(metaSequelize.__insertedFindings.length).toBeGreaterThan(0);
        metaSequelize.__insertedFindings.forEach((finding) => {
            expect(finding.run_scope).toBe(DEFAULT_RUN_SCOPE);
            expect(finding.status).toBe('open');
        });
    });

    test('classifies a previously-mapped record as update using a single legacy_id_map SELECT scoped to run_scope', async () => {
        const account = legacyDgfyAccountFixture();
        const tenant = legacyTenantFixture({ owner_dgfy_account_id: account.id });
        // readLegacyLandlordSnapshot() only reads dgfy_accounts rows
        // referenced by a scoped tenant's owner_dgfy_account_id or a scoped
        // membership's dgfy_account_id — a tenant is required so the account
        // is actually in scope for this run.
        const landlordSequelize = buildFakeLandlordSequelize({ tenants: [tenant], accounts: [account], memberships: [] });

        mockCreateSourceConnection.mockReset().mockReturnValue(landlordSequelize);
        mockCreateLegacyTenantSourceConnection.mockReset().mockReturnValue(buildFakeTenantSequelize({}));

        const metaSequelize = buildFakeMetaSequelize({
            existingIdMapRows: [{
                run_scope: DEFAULT_RUN_SCOPE,
                legacy_source: 'landlord',
                legacy_table: 'dgfy_accounts',
                legacy_id: account.id,
                dgfy_id: account.id
            }]
        });

        const result = await runDryRunTransformations({
            config: { sourceDb: {}, targetDb: {}, runtimeMode: 'development' },
            metaSequelize,
            targets: [{
                legacy_tenant_id: tenant.id,
                legacy_tenant_db_name: 'sku_tenant_1',
                target_business_db_name: 'dgfy_business_alpha',
                expected_business_id: 'biz-uuid-1',
                expected_owner_account_id: account.id
            }],
            runScope: DEFAULT_RUN_SCOPE
        });

        const accountEntry = result.entries.find((entry) => entry.entity_type === 'account');
        expect(accountEntry.operation).toBe('update');
        expect(result.summary.planned_updates).toBe(1);

        const idMapQuery = metaSequelize.query.mock.calls.find((call) => call[0].includes('FROM legacy_id_map'));
        expect(idMapQuery[1].replacements).toEqual([DEFAULT_RUN_SCOPE]);
    });
});

describe('dryRun.js structural contract (no target mutation, no checkpoints)', () => {
    test('never references markDataCheckpoint, createTargetConnection, or createBusinessTargetConnection', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'dryRun.js'), 'utf8');

        expect(source).not.toMatch(/markDataCheckpoint/);
        expect(source).not.toMatch(/createTargetConnection/);
        expect(source).not.toMatch(/createBusinessTargetConnection/);
    });
});
