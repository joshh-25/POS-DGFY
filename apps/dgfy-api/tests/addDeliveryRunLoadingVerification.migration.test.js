import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260914000001-add-delivery-run-loading-verification.cjs');

const buildQueryInterface = ({ columns = [], indexes = [], foreignKeys = [] } = {}) => {
    const schemaByDatabase = new Map(['landlord_db', 'tenant_a'].map((databaseName) => [databaseName, {
        columns: new Set(columns),
        indexes: new Set(indexes),
        foreignKeys: new Set(foreignKeys)
    }]));
    const schemaFor = (databaseName) => {
        if (!schemaByDatabase.has(databaseName)) {
            schemaByDatabase.set(databaseName, { columns: new Set(), indexes: new Set(), foreignKeys: new Set() });
        }
        return schemaByDatabase.get(databaseName);
    };
    const query = jest.fn(async (sql, options = {}) => {
        if (sql.includes('SELECT DATABASE()')) return [[{ dbName: 'landlord_db' }]];
        if (sql.includes('SELECT DISTINCT db_name FROM tenants')) return [[{ db_name: 'tenant_a' }]];
        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements || [];
            const exists = ['tenants', 'users', 'delivery_jobs', 'delivery_runs'].includes(tableName);
            return [[{ count: exists ? 1 : 0 }]];
        }
        if (sql.includes('information_schema.columns')) {
            const [databaseName, , columnName] = options.replacements || [];
            return [[{ count: schemaFor(databaseName).columns.has(columnName) ? 1 : 0 }]];
        }
        if (sql.includes('information_schema.statistics')) {
            const [databaseName, , indexName] = options.replacements || [];
            return [[{ count: schemaFor(databaseName).indexes.has(indexName) ? 1 : 0 }]];
        }
        if (sql.includes('information_schema.table_constraints')) {
            const [databaseName, , constraintName] = options.replacements || [];
            return [[{ count: schemaFor(databaseName).foreignKeys.has(constraintName) ? 1 : 0 }]];
        }

        const databaseName = sql.match(/ALTER TABLE `([^`]+)`\.`[^`]+`/)?.[1];
        const schema = schemaFor(databaseName);
        const addColumn = sql.match(/ADD COLUMN `([^`]+)`/);
        if (addColumn) schema.columns.add(addColumn[1]);
        const addIndex = sql.match(/ADD INDEX `([^`]+)`/);
        if (addIndex) schema.indexes.add(addIndex[1]);
        const addForeignKey = sql.match(/ADD CONSTRAINT `([^`]+)`/);
        if (addForeignKey) schema.foreignKeys.add(addForeignKey[1]);
        const dropColumn = sql.match(/DROP COLUMN `([^`]+)`/);
        if (dropColumn) schema.columns.delete(dropColumn[1]);
        const dropIndex = sql.match(/DROP INDEX `([^`]+)`/);
        if (dropIndex) schema.indexes.delete(dropIndex[1]);
        const dropForeignKey = sql.match(/DROP FOREIGN KEY `([^`]+)`/);
        if (dropForeignKey) schema.foreignKeys.delete(dropForeignKey[1]);
        return [[], undefined];
    });
    return { sequelize: { query } };
};

const alterStatements = (queryInterface) => queryInterface.sequelize.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.trim().startsWith('ALTER TABLE'));

describe('delivery-run loading verification tenant migration', () => {
    it('adds the loading columns, foreign keys, and run/loading index to landlord and active tenants', async () => {
        const queryInterface = buildQueryInterface();

        await migration.up(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(18);
        expect(statements.filter((sql) => sql.includes('ADD COLUMN `loading_state`')).length).toBe(2);
        expect(statements.filter((sql) => sql.includes('idx_delivery_jobs_run_loading_state')).length).toBe(2);
        expect(statements.filter((sql) => sql.includes('fk_delivery_jobs_loading_marked_by')).length).toBe(2);
        expect(statements.filter((sql) => sql.includes('fk_delivery_runs_loading_confirmed_by')).length).toBe(2);
        expect(statements.every((sql) => sql.includes('`landlord_db`') || sql.includes('`tenant_a`'))).toBe(true);
    });

    it('is idempotent when all loading schema objects already exist', async () => {
        const queryInterface = buildQueryInterface({
            columns: ['loading_state', 'loading_exception_reason', 'loading_marked_by', 'loading_marked_at', 'loading_confirmed_by', 'loading_confirmed_at'],
            indexes: ['idx_delivery_jobs_run_loading_state'],
            foreignKeys: ['fk_delivery_jobs_loading_marked_by', 'fk_delivery_runs_loading_confirmed_by']
        });

        await migration.up(queryInterface);

        expect(alterStatements(queryInterface)).toHaveLength(0);
    });

    it('removes loading schema objects in dependency-safe order for both databases', async () => {
        const queryInterface = buildQueryInterface({
            columns: ['loading_state', 'loading_exception_reason', 'loading_marked_by', 'loading_marked_at', 'loading_confirmed_by', 'loading_confirmed_at'],
            indexes: ['idx_delivery_jobs_run_loading_state'],
            foreignKeys: ['fk_delivery_jobs_loading_marked_by', 'fk_delivery_runs_loading_confirmed_by']
        });

        await migration.down(queryInterface);

        const statements = alterStatements(queryInterface);
        expect(statements).toHaveLength(18);
        expect(statements[0]).toContain('DROP FOREIGN KEY `fk_delivery_jobs_loading_marked_by`');
        expect(statements[1]).toContain('DROP INDEX `idx_delivery_jobs_run_loading_state`');
        expect(statements.at(-3)).toContain('DROP FOREIGN KEY `fk_delivery_runs_loading_confirmed_by`');
        expect(statements.at(-1)).toContain('DROP COLUMN `loading_confirmed_by`');
    });
});
