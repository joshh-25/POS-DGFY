import { jest } from '@jest/globals';
import {
    auditRequiredIndexes,
    applyAuditDatabaseFilters
} from '../src/services/schemaIndexAuditService.js';

const createMockSequelize = (queryImpl) => ({
    query: jest.fn(queryImpl)
});

describe('schemaIndexAuditService', () => {
    it('filters test tenant databases only in local/test mode when explicitly enabled', () => {
        const result = applyAuditDatabaseFilters({
            databases: ['tenant_prod', 'test_tenant_alpha', 'test_tenant_beta'],
            auditMode: 'local',
            excludeTestTenantDatabases: true
        });

        expect(result.selectedDatabases).toEqual(['tenant_prod']);
        expect(result.excludedDatabases).toEqual(['test_tenant_alpha', 'test_tenant_beta']);
    });

    it('does not filter test tenant databases in standard mode', () => {
        const result = applyAuditDatabaseFilters({
            databases: ['tenant_prod', 'test_tenant_alpha'],
            auditMode: 'standard',
            excludeTestTenantDatabases: true
        });

        expect(result.selectedDatabases).toEqual(['tenant_prod', 'test_tenant_alpha']);
        expect(result.excludedDatabases).toEqual([]);
    });

    it('detects missing single-column index coverage', async () => {
        const sequelizeMock = createMockSequelize(async (sql) => {
            if (sql.includes('SELECT DATABASE() AS db_name')) {
                return [[{ db_name: 'main_db' }]];
            }
            if (sql.includes("SHOW TABLES LIKE 'tenants'")) {
                return [[]];
            }
            if (sql.includes('FROM information_schema.STATISTICS')) {
                return [[]];
            }
            if (sql.includes('FROM information_schema.TABLES')) {
                return [[{ TABLE_NAME: 'items' }]];
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        });

        const contract = {
            items: { single: ['folder_id'], composite: [] }
        };

        const result = await auditRequiredIndexes({
            sequelizeInstance: sequelizeMock,
            contract,
            timeoutMs: 1000
        });

        expect(result.status).toBe('degraded');
        expect(result.missingCount).toBe(1);
        expect(result.missingIndexes[0]).toMatchObject({
            database: 'main_db',
            table: 'items',
            type: 'single',
            columns: ['folder_id'],
            reason: 'missing_leftmost_index'
        });
    });

    it('detects composite index order mismatch', async () => {
        const sequelizeMock = createMockSequelize(async (sql) => {
            if (sql.includes('SELECT DATABASE() AS db_name')) {
                return [[{ db_name: 'main_db' }]];
            }
            if (sql.includes("SHOW TABLES LIKE 'tenants'")) {
                return [[]];
            }
            if (sql.includes('FROM information_schema.STATISTICS')) {
                return [[
                    { INDEX_NAME: 'idx_wrong_order', COLUMN_NAME: 'item_id', SEQ_IN_INDEX: 1 },
                    { INDEX_NAME: 'idx_wrong_order', COLUMN_NAME: 'timestamp', SEQ_IN_INDEX: 2 },
                    { INDEX_NAME: 'idx_wrong_order', COLUMN_NAME: 'movement_type', SEQ_IN_INDEX: 3 }
                ]];
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        });

        const contract = {
            stock_movements: { single: [], composite: [['item_id', 'movement_type', 'timestamp']] }
        };

        const result = await auditRequiredIndexes({
            sequelizeInstance: sequelizeMock,
            contract,
            timeoutMs: 1000
        });

        expect(result.status).toBe('degraded');
        expect(result.missingCount).toBe(1);
        expect(result.missingIndexes[0]).toMatchObject({
            database: 'main_db',
            table: 'stock_movements',
            type: 'composite',
            columns: ['item_id', 'movement_type', 'timestamp'],
            reason: 'missing_exact_composite_index'
        });
    });

    it('falls back to current database when tenants table is absent', async () => {
        const sequelizeMock = createMockSequelize(async (sql) => {
            if (sql.includes('SELECT DATABASE() AS db_name')) {
                return [[{ db_name: 'main_db' }]];
            }
            if (sql.includes("SHOW TABLES LIKE 'tenants'")) {
                return [[]];
            }
            if (sql.includes('FROM information_schema.STATISTICS')) {
                return [[
                    { INDEX_NAME: 'idx_item_id', COLUMN_NAME: 'item_id', SEQ_IN_INDEX: 1 }
                ]];
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        });

        const contract = {
            stock_movements: { single: ['item_id'], composite: [] }
        };

        const result = await auditRequiredIndexes({
            sequelizeInstance: sequelizeMock,
            contract,
            timeoutMs: 1000
        });

        expect(result.status).toBe('healthy');
        expect(result.source).toBe('current_db_fallback');
        expect(result.databasesChecked).toEqual(['main_db']);
        expect(result.missingCount).toBe(0);
    });

    it('excludes test_tenant_* databases in local mode when configured', async () => {
        const sequelizeMock = createMockSequelize(async (sql, options = {}) => {
            if (sql.includes('SELECT DATABASE() AS db_name')) {
                return [[{ db_name: 'landlord_db' }]];
            }
            if (sql.includes("SHOW TABLES LIKE 'tenants'")) {
                return [[{ Tables_in_landlord_db: 'tenants' }]];
            }
            if (sql.includes("SELECT db_name FROM tenants WHERE status = 'active'")) {
                return [[
                    { db_name: 'tenant_prod' },
                    { db_name: 'test_tenant_stale' }
                ]];
            }
            if (sql.includes('FROM information_schema.STATISTICS')) {
                const databaseName = options.replacements?.[0];
                if (databaseName === 'tenant_prod') {
                    return [[{ INDEX_NAME: 'idx_item_id', COLUMN_NAME: 'item_id', SEQ_IN_INDEX: 1 }]];
                }
                throw new Error(`Unexpected database checked: ${databaseName}`);
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        });

        const contract = {
            stock_movements: { single: ['item_id'], composite: [] }
        };

        const result = await auditRequiredIndexes({
            sequelizeInstance: sequelizeMock,
            contract,
            timeoutMs: 1000,
            auditMode: 'local',
            excludeTestTenantDatabases: true
        });

        expect(result.status).toBe('healthy');
        expect(result.databasesChecked).toEqual(['tenant_prod']);
        expect(result.excludedDatabases).toEqual(['test_tenant_stale']);
        expect(result.tenantsChecked).toBe(1);
    });
});
