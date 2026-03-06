import { jest } from '@jest/globals';
import { auditRequiredIndexes } from '../src/services/schemaIndexAuditService.js';

const createMockSequelize = (queryImpl) => ({
    query: jest.fn(queryImpl)
});

describe('schemaIndexAuditService', () => {
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
});
