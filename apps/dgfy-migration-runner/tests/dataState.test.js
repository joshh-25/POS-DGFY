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
    listOpenDataQualityFindings
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
