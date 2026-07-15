import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jest } from '@jest/globals';
import {
    findLegacyIdMap,
    recordLegacyIdMap,
    getDataCheckpoint,
    markDataCheckpoint,
    recordDataQualityFinding,
    resolveDataQualityFindings,
    listOpenDataQualityFindings,
    syncDataQualityFindings
} from '../src/metadata/dataState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Faithful-enough in-memory fake of dgfy_migration_meta's three data-run
 * tables. Rather than parsing arbitrary SQL text, each supported query shape
 * is matched by the table name it targets and filtered using the positional
 * `replacements` the real dataState.js code passes — this proves dataState.js
 * always uses parameterized values (a hand-rolled SQL parser would be
 * pointless to fake here; what matters is the exact replacements array
 * shape).
 */
function buildFakeMetaSequelize() {
    const tables = {
        legacy_id_map: [],
        data_checkpoints: [],
        data_quality_findings: []
    };
    let nextId = 1;

    const bulkInsert = jest.fn(async (tableName, rows) => {
        rows.forEach((row) => {
            tables[tableName].push({ id: nextId, ...row });
            nextId += 1;
        });
    });

    const bulkUpdate = jest.fn(async (tableName, values, where) => {
        tables[tableName] = tables[tableName].map((row) => {
            const matches = Object.entries(where).every(([key, value]) => row[key] === value);
            return matches ? { ...row, ...values } : row;
        });
    });

    const query = jest.fn(async (sql, options = {}) => {
        const replacements = options.replacements || [];

        if (sql.includes('FROM legacy_id_map')) {
            const [runScope, legacySource, legacyTable, legacyId] = replacements;
            const rows = tables.legacy_id_map.filter((row) => (
                row.run_scope === runScope
                && row.legacy_source === legacySource
                && row.legacy_table === legacyTable
                && row.legacy_id === legacyId
            ));
            return [rows, []];
        }

        if (sql.includes('FROM data_checkpoints')) {
            const [runScope, legacyTenantId, entityType] = replacements;
            const rows = tables.data_checkpoints.filter((row) => (
                row.run_scope === runScope
                && row.legacy_tenant_id === legacyTenantId
                && row.entity_type === entityType
            ));
            return [rows, []];
        }

        // Full-tuple lookup used by syncDataQualityFindings — matched first
        // because it also targets data_quality_findings and must not fall
        // through to the run_scope/status-only shape below.
        if (sql.includes('FROM data_quality_findings') && sql.includes('legacy_table <=>')) {
            const [runScope, entityType, legacyTable, legacyId, legacyTenantId] = replacements;
            const rows = tables.data_quality_findings.filter((row) => (
                row.run_scope === runScope
                && row.entity_type === entityType
                && (row.legacy_table ?? null) === (legacyTable ?? null)
                && (row.legacy_id ?? null) === (legacyId ?? null)
                && (row.legacy_tenant_id ?? null) === (legacyTenantId ?? null)
            ));
            return [rows, []];
        }

        if (sql.includes('FROM data_quality_findings')) {
            const [runScope, status] = replacements;
            const rows = tables.data_quality_findings.filter((row) => (
                row.run_scope === runScope && (status === undefined || row.status === status)
            ));
            return [rows, []];
        }

        return [[], []];
    });

    return {
        getQueryInterface: () => ({ bulkInsert, bulkUpdate }),
        query,
        __tables: tables,
        __mocks: { bulkInsert, bulkUpdate, query }
    };
}

describe('findLegacyIdMap / recordLegacyIdMap', () => {
    test('findLegacyIdMap returns null when no matching row exists', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        const result = await findLegacyIdMap(metaSequelize, {
            runScope: 'run-1',
            legacySource: 'legacy_tenant_1',
            legacyTable: 'users',
            legacyId: '42'
        });

        expect(result).toBeNull();
    });

    test('recordLegacyIdMap inserts a row and a subsequent lookup returns it', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        const created = await recordLegacyIdMap(metaSequelize, {
            runScope: 'run-1',
            legacySource: 'legacy_tenant_1',
            legacyTable: 'users',
            legacyId: 42,
            dgfyDatabase: 'dgfy_business_alpha',
            dgfyTable: 'staff_accounts',
            dgfyId: 'uuid-1'
        });

        expect(created.dgfy_id).toBe('uuid-1');
        expect(metaSequelize.__mocks.bulkInsert).toHaveBeenCalledTimes(1);

        const found = await findLegacyIdMap(metaSequelize, {
            runScope: 'run-1',
            legacySource: 'legacy_tenant_1',
            legacyTable: 'users',
            legacyId: 42
        });

        expect(found).not.toBeNull();
        expect(found.dgfy_database).toBe('dgfy_business_alpha');
    });

    test('recordLegacyIdMap called twice for the same scope never inserts a second row (D-04, Pitfall 3)', async () => {
        const metaSequelize = buildFakeMetaSequelize();
        const params = {
            runScope: 'run-1',
            legacySource: 'legacy_tenant_1',
            legacyTable: 'users',
            legacyId: 42,
            dgfyDatabase: 'dgfy_business_alpha',
            dgfyTable: 'staff_accounts',
            dgfyId: 'uuid-1'
        };

        await recordLegacyIdMap(metaSequelize, params);
        await recordLegacyIdMap(metaSequelize, params);

        expect(metaSequelize.__mocks.bulkInsert).toHaveBeenCalledTimes(1);
        expect(metaSequelize.__tables.legacy_id_map).toHaveLength(1);
    });

    test('recordLegacyIdMap treats different run scopes as distinct rows even for the same legacy record', async () => {
        const metaSequelize = buildFakeMetaSequelize();
        const base = {
            legacySource: 'legacy_tenant_1',
            legacyTable: 'users',
            legacyId: 42,
            dgfyDatabase: 'dgfy_business_alpha',
            dgfyTable: 'staff_accounts',
            dgfyId: 'uuid-1'
        };

        await recordLegacyIdMap(metaSequelize, { runScope: 'run-1', ...base });
        await recordLegacyIdMap(metaSequelize, { runScope: 'run-2', ...base });

        expect(metaSequelize.__tables.legacy_id_map).toHaveLength(2);
    });
});

describe('getDataCheckpoint / markDataCheckpoint', () => {
    test('getDataCheckpoint returns null when no checkpoint exists', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        const result = await getDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'accounts'
        });

        expect(result).toBeNull();
    });

    test('markDataCheckpoint creates a checkpoint row on first call', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await markDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'accounts',
            status: 'in_progress',
            recordsProcessed: 3
        });

        const checkpoint = await getDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'accounts'
        });

        expect(checkpoint.status).toBe('in_progress');
        expect(checkpoint.records_processed).toBe(3);
    });

    test('markDataCheckpoint updates the existing row in place instead of inserting a duplicate (D-03/D-04, Pitfall 3)', async () => {
        const metaSequelize = buildFakeMetaSequelize();
        const scope = { runScope: 'run-1', legacyTenantId: 'tenant-1', entityType: 'accounts' };

        await markDataCheckpoint(metaSequelize, { ...scope, status: 'in_progress', recordsProcessed: 2 });
        await markDataCheckpoint(metaSequelize, { ...scope, status: 'completed', recordsProcessed: 10 });

        expect(metaSequelize.__mocks.bulkInsert).toHaveBeenCalledTimes(1);
        expect(metaSequelize.__mocks.bulkUpdate).toHaveBeenCalledTimes(1);
        expect(metaSequelize.__tables.data_checkpoints).toHaveLength(1);

        const checkpoint = await getDataCheckpoint(metaSequelize, scope);
        expect(checkpoint.status).toBe('completed');
        expect(checkpoint.records_processed).toBe(10);
    });

    test('markDataCheckpoint scopes distinct rows per (tenant, entity type) pair', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await markDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'accounts',
            status: 'completed'
        });
        await markDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'staff',
            status: 'pending'
        });

        expect(metaSequelize.__tables.data_checkpoints).toHaveLength(2);

        const accountsCheckpoint = await getDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'accounts'
        });
        const staffCheckpoint = await getDataCheckpoint(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'staff'
        });

        expect(accountsCheckpoint.status).toBe('completed');
        expect(staffCheckpoint.status).toBe('pending');
    });
});

describe('recordDataQualityFinding / listOpenDataQualityFindings', () => {
    test('recordDataQualityFinding inserts a finding row with severity/reason_code/message (D-04)', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await recordDataQualityFinding(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'staff',
            legacyTable: 'users',
            legacyId: 7,
            severity: 'conflict',
            reasonCode: 'duplicate_email',
            message: 'Duplicate email detected for legacy user 7',
            remediation: 'Resolve duplicate email before retrying apply'
        });

        expect(metaSequelize.__tables.data_quality_findings).toHaveLength(1);
        const finding = metaSequelize.__tables.data_quality_findings[0];
        expect(finding.severity).toBe('conflict');
        expect(finding.reason_code).toBe('duplicate_email');
        expect(finding.status).toBe('open');
    });

    test('listOpenDataQualityFindings only returns open findings scoped by run_scope', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await recordDataQualityFinding(metaSequelize, {
            runScope: 'run-1',
            entityType: 'staff',
            severity: 'skip',
            reasonCode: 'inactive_user',
            message: 'Legacy user is inactive'
        });
        await recordDataQualityFinding(metaSequelize, {
            runScope: 'run-2',
            entityType: 'staff',
            severity: 'skip',
            reasonCode: 'inactive_user',
            message: 'Legacy user is inactive (different run)'
        });
        // Simulate a resolved finding by directly mutating the fake store.
        metaSequelize.__tables.data_quality_findings.push({
            id: 99,
            run_scope: 'run-1',
            entity_type: 'staff',
            severity: 'orphan',
            reason_code: 'missing_location',
            message: 'resolved already',
            status: 'resolved'
        });

        const openFindings = await listOpenDataQualityFindings(metaSequelize, { runScope: 'run-1' });

        expect(openFindings).toHaveLength(1);
        expect(openFindings[0].reason_code).toBe('inactive_user');
    });

    test('resolveDataQualityFindings resolves only the matching open entity/key findings', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await recordDataQualityFinding(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'terminal_identity',
            legacyTable: 'system_settings.pos_terminal_registry',
            legacyId: 'terminal-01',
            severity: 'orphan',
            reasonCode: 'location_not_mapped',
            message: 'Location not mapped yet'
        });
        await recordDataQualityFinding(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'staff',
            legacyTable: 'users',
            legacyId: 7,
            severity: 'conflict',
            reasonCode: 'duplicate_email',
            message: 'Different finding remains open'
        });

        await resolveDataQualityFindings(metaSequelize, {
            runScope: 'run-1',
            legacyTenantId: 'tenant-1',
            entityType: 'terminal_identity',
            legacyTable: 'system_settings.pos_terminal_registry',
            legacyId: 'terminal-01'
        });

        const openFindings = await listOpenDataQualityFindings(metaSequelize, { runScope: 'run-1' });

        expect(openFindings).toHaveLength(1);
        expect(openFindings[0].entity_type).toBe('staff');
        expect(metaSequelize.__tables.data_quality_findings.find(
            (finding) => finding.entity_type === 'terminal_identity'
        ).status).toBe('resolved');
    });
});

describe('syncDataQualityFindings', () => {
    const baseScope = {
        runScope: 'run-1',
        legacyTenantId: 'tenant-1',
        entityType: 'availment',
        legacyTable: 'pos_transactions',
        legacyId: 501
    };

    test('repeated synchronization of the same open reason does not duplicate rows', async () => {
        const metaSequelize = buildFakeMetaSequelize();
        const findings = [{
            severity: 'orphan',
            reasonCode: 'unresolved_cashier',
            message: 'Cashier could not be resolved for pos_transaction 501'
        }];

        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings });
        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings });

        const rows = metaSequelize.__tables.data_quality_findings.filter(
            (row) => row.reason_code === 'unresolved_cashier'
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('open');
    });

    test('a resolved reason reopens when the current mapper emits it again', async () => {
        const metaSequelize = buildFakeMetaSequelize();
        const finding = {
            severity: 'orphan',
            reasonCode: 'unresolved_terminal',
            message: 'Terminal could not be resolved for pos_transaction 501'
        };

        // First sync opens the finding.
        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings: [finding] });

        // A later sync where the mapper no longer emits the reason resolves it.
        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings: [] });

        const afterResolve = metaSequelize.__tables.data_quality_findings.filter(
            (row) => row.reason_code === 'unresolved_terminal'
        );
        expect(afterResolve).toHaveLength(1);
        expect(afterResolve[0].status).toBe('resolved');

        // A retry (e.g. a still-present data issue on a full-scan retry)
        // reopens the same row instead of inserting a second one.
        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings: [finding] });

        const afterReopen = metaSequelize.__tables.data_quality_findings.filter(
            (row) => row.reason_code === 'unresolved_terminal'
        );
        expect(afterReopen).toHaveLength(1);
        expect(afterReopen[0].status).toBe('open');
        expect(afterReopen[0].id).toBe(afterResolve[0].id);
    });

    test('one absent reason resolves without resolving another reason still emitted for the same source record', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await syncDataQualityFindings(metaSequelize, {
            ...baseScope,
            findings: [
                { severity: 'orphan', reasonCode: 'unresolved_cashier', message: 'Cashier missing' },
                { severity: 'orphan', reasonCode: 'unresolved_terminal', message: 'Terminal missing' }
            ]
        });

        // Only unresolved_terminal is emitted on the next scan — the mapper
        // has since resolved the cashier reference for this same record.
        await syncDataQualityFindings(metaSequelize, {
            ...baseScope,
            findings: [
                { severity: 'orphan', reasonCode: 'unresolved_terminal', message: 'Terminal still missing' }
            ]
        });

        const cashierRows = metaSequelize.__tables.data_quality_findings.filter(
            (row) => row.reason_code === 'unresolved_cashier'
        );
        const terminalRows = metaSequelize.__tables.data_quality_findings.filter(
            (row) => row.reason_code === 'unresolved_terminal'
        );

        expect(cashierRows).toHaveLength(1);
        expect(cashierRows[0].status).toBe('resolved');
        expect(terminalRows).toHaveLength(1);
        expect(terminalRows[0].status).toBe('open');
    });

    test('an empty current-set resolves every prior open reason for the source record', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await syncDataQualityFindings(metaSequelize, {
            ...baseScope,
            findings: [
                { severity: 'orphan', reasonCode: 'unresolved_cashier', message: 'Cashier missing' },
                { severity: 'orphan', reasonCode: 'unresolved_terminal', message: 'Terminal missing' }
            ]
        });

        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings: [] });

        const rows = metaSequelize.__tables.data_quality_findings.filter(
            (row) => row.legacy_id === '501'
        );
        expect(rows).toHaveLength(2);
        rows.forEach((row) => expect(row.status).toBe('resolved'));
    });

    test('tenant/run/entity isolation: sync for one source record never touches another tenant/run/entity scope', async () => {
        const metaSequelize = buildFakeMetaSequelize();
        const finding = {
            severity: 'orphan',
            reasonCode: 'unresolved_cashier',
            message: 'Cashier missing'
        };

        // Same reason code, same legacy_table/legacy_id, but different
        // run/tenant/entity scopes — each must be tracked independently.
        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings: [finding] });
        await syncDataQualityFindings(metaSequelize, {
            ...baseScope, runScope: 'run-2', findings: [finding]
        });
        await syncDataQualityFindings(metaSequelize, {
            ...baseScope, legacyTenantId: 'tenant-2', findings: [finding]
        });
        await syncDataQualityFindings(metaSequelize, {
            ...baseScope, entityType: 'availment_item', findings: [finding]
        });

        expect(metaSequelize.__tables.data_quality_findings).toHaveLength(4);

        // Resolving (empty findings) only the original scope must leave the
        // other three scopes' open rows untouched.
        await syncDataQualityFindings(metaSequelize, { ...baseScope, findings: [] });

        const openRows = metaSequelize.__tables.data_quality_findings.filter((row) => row.status === 'open');
        expect(openRows).toHaveLength(3);
        const resolvedRows = metaSequelize.__tables.data_quality_findings.filter((row) => row.status === 'resolved');
        expect(resolvedRows).toHaveLength(1);
        expect(resolvedRows[0].run_scope).toBe('run-1');
        expect(resolvedRows[0].legacy_tenant_id).toBe('tenant-1');
        expect(resolvedRows[0].entity_type).toBe('availment');
    });

    test('syncDataQualityFindings does not blanket-resolve all reasons before recording current findings', async () => {
        const metaSequelize = buildFakeMetaSequelize();

        await syncDataQualityFindings(metaSequelize, {
            ...baseScope,
            findings: [
                { severity: 'orphan', reasonCode: 'unresolved_cashier', message: 'Cashier missing' },
                { severity: 'orphan', reasonCode: 'unresolved_terminal', message: 'Terminal missing' }
            ]
        });

        // Current scan still emits both reasons — neither should ever
        // transiently resolve then reopen in a way a caller could observe
        // as a blanket resolve; final state must show both open the whole
        // time (checked here via end-state, since transient state isn't
        // observable through the public function contract).
        await syncDataQualityFindings(metaSequelize, {
            ...baseScope,
            findings: [
                { severity: 'orphan', reasonCode: 'unresolved_cashier', message: 'Cashier still missing' },
                { severity: 'orphan', reasonCode: 'unresolved_terminal', message: 'Terminal still missing' }
            ]
        });

        const rows = metaSequelize.__tables.data_quality_findings;
        expect(rows).toHaveLength(2);
        rows.forEach((row) => expect(row.status).toBe('open'));
    });
});

describe('dataState.js parameterization', () => {
    test('every metaSequelize.query() call site passes a replacements array (no string-interpolated values)', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'metadata', 'dataState.js'), 'utf8');
        const queryCallCount = (source.match(/metaSequelize\.query\(/g) || []).length;
        const replacementsCount = (source.match(/replacements:/g) || []).length;

        expect(queryCallCount).toBeGreaterThan(0);
        expect(replacementsCount).toBe(queryCallCount);
    });
});
