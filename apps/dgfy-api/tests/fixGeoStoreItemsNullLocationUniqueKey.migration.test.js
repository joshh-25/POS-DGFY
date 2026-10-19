import { describe, expect, it } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261019000004-fix-geo-store-items-null-location-unique-key.cjs');

const OLD_INDEX = 'uk_geo_store_items_tenant_loc_item';
const NEW_INDEX = 'uk_geo_store_items_tenant_loc_key_item';

const buildQueryInterface = ({
    table = true,
    locationKey = false,
    oldIndex = true,
    newIndex = false,
    duplicateGroups = [],
    zeroLocationCount = 0
} = {}) => {
    const state = {
        tables: table ? ['geo_store_items'] : [],
        columns: locationKey ? { location_key: { type: 'BIGINT UNSIGNED' } } : {},
        indexes: [
            ...(oldIndex ? [{ name: OLD_INDEX }] : []),
            ...(newIndex ? [{ name: NEW_INDEX }] : [])
        ],
        duplicateGroups: [...duplicateGroups],
        operations: []
    };

    const queryInterface = {
        showAllTables: async () => {
            state.operations.push('showAllTables');
            return [...state.tables];
        },
        describeTable: async () => {
            state.operations.push('describeTable');
            return { ...state.columns };
        },
        showIndex: async () => {
            state.operations.push('showIndex');
            return [...state.indexes];
        },
        addIndex: async (_table, _columns, options) => {
            state.operations.push(`addIndex:${options.name}`);
            state.indexes.push({ name: options.name });
        },
        removeIndex: async (_table, name) => {
            state.operations.push(`removeIndex:${name}`);
            state.indexes = state.indexes.filter((index) => index.name !== name);
        },
        removeColumn: async (_table, name) => {
            state.operations.push(`removeColumn:${name}`);
            delete state.columns[name];
        },
        sequelize: {
            query: async (sql, options = {}) => {
                const normalizedSql = sql.replace(/\s+/g, ' ').trim();
                if (normalizedSql.startsWith('SELECT COUNT(*) AS zero_location_count')) {
                    state.operations.push('checkReservedLocationId');
                    return [[{ zero_location_count: zeroLocationCount }], []];
                }
                if (normalizedSql.startsWith('SELECT tenant_id')) {
                    state.operations.push('selectDuplicates');
                    return [[...state.duplicateGroups], []];
                }
                if (normalizedSql.startsWith('DELETE FROM')) {
                    state.operations.push(`delete:${options.replacements.tenantId}:${options.replacements.itemId}`);
                    return [[], []];
                }
                if (normalizedSql.startsWith('ALTER TABLE')) {
                    state.operations.push('addGeneratedColumn');
                    state.columns.location_key = { type: 'BIGINT UNSIGNED' };
                    return [[], []];
                }
                throw new Error(`Unexpected migration SQL: ${normalizedSql}`);
            }
        }
    };

    return { queryInterface, state };
};

describe('fix geo_store_items NULL-location unique key migration (#2605)', () => {
    it('does nothing when geo_store_items is missing', async () => {
        const { queryInterface, state } = buildQueryInterface({ table: false });

        await migration.up(queryInterface);
        await migration.down(queryInterface);

        expect(state.operations).toEqual(['showAllTables', 'showAllTables']);
    });

    it('stops before deduplication if location_id zero is already in use', async () => {
        const { queryInterface, state } = buildQueryInterface({
            duplicateGroups: [{ tenant_id: 'tenant-a', item_id: 7, keep_id: 12 }],
            zeroLocationCount: 1
        });

        await expect(migration.up(queryInterface)).rejects.toThrow(/location_id = 0/i);

        expect(state.operations).toContain('checkReservedLocationId');
        expect(state.operations).not.toContain('selectDuplicates');
        expect(state.operations.some((operation) => operation.startsWith('delete:'))).toBe(false);
        expect(state.operations).not.toContain('addGeneratedColumn');
    });

    it('dedupes tenant-wide rows before adding the generated key and drops the old index last', async () => {
        const { queryInterface, state } = buildQueryInterface({
            duplicateGroups: [
                { tenant_id: 'tenant-a', item_id: 7, keep_id: 12 },
                { tenant_id: 'tenant-b', item_id: 7, keep_id: 20 }
            ]
        });

        await migration.up(queryInterface);

        expect(state.operations).toContain('delete:tenant-a:7');
        expect(state.operations).toContain('delete:tenant-b:7');
        expect(state.operations.indexOf('delete:tenant-a:7')).toBeLessThan(state.operations.indexOf('addGeneratedColumn'));
        expect(state.operations.indexOf('addGeneratedColumn')).toBeLessThan(state.operations.indexOf(`addIndex:${NEW_INDEX}`));
        const addNewIndexAt = state.operations.indexOf(`addIndex:${NEW_INDEX}`);
        const verifyNewIndexAt = state.operations.lastIndexOf('showIndex');
        const removeOldIndexAt = state.operations.indexOf(`removeIndex:${OLD_INDEX}`);
        expect(addNewIndexAt).toBeLessThan(verifyNewIndexAt);
        expect(verifyNewIndexAt).toBeLessThan(removeOldIndexAt);
        expect(state.indexes.map((index) => index.name)).toContain(NEW_INDEX);
        expect(state.indexes.map((index) => index.name)).not.toContain(OLD_INDEX);
    });

    it('is idempotent when the generated column and new index already exist', async () => {
        const { queryInterface, state } = buildQueryInterface({ locationKey: true, newIndex: true });

        await migration.up(queryInterface);

        expect(state.operations).toContain('selectDuplicates');
        expect(state.operations).not.toContain('addGeneratedColumn');
        expect(state.operations).not.toContain(`addIndex:${NEW_INDEX}`);
        expect(state.indexes.map((index) => index.name)).toContain(NEW_INDEX);
        expect(state.indexes.map((index) => index.name)).not.toContain(OLD_INDEX);
    });

    it('rolls back the new index and generated column before restoring the old unique index', async () => {
        const { queryInterface, state } = buildQueryInterface({
            locationKey: true,
            oldIndex: false,
            newIndex: true
        });

        await migration.down(queryInterface);

        expect(state.operations.indexOf(`removeIndex:${NEW_INDEX}`)).toBeLessThan(state.operations.indexOf('removeColumn:location_key'));
        expect(state.operations.indexOf('removeColumn:location_key')).toBeLessThan(state.operations.indexOf(`addIndex:${OLD_INDEX}`));
        expect(state.indexes.map((index) => index.name)).toContain(OLD_INDEX);
        expect(state.indexes.map((index) => index.name)).not.toContain(NEW_INDEX);
    });
});
