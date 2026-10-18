import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261018000001-add-staff-push-token-owners.cjs');
const Sequelize = {
    UUID: 'UUID',
    INTEGER: { UNSIGNED: 'INTEGER_UNSIGNED' },
    QueryTypes: { SELECT: 'SELECT' }
};

const buildQueryInterface = ({ staffColumns = false, staffIndex = false, constraint = null } = {}) => {
    const state = {
        columns: {
            revoked_at: { type: 'DATE' },
            ...(staffColumns ? {
                staff_tenant_id: { type: 'UUID' },
                staff_user_id: { type: 'INTEGER_UNSIGNED' }
            } : {})
        },
        indexes: staffIndex ? [{ name: 'idx_push_device_tokens_staff_active' }] : [],
        constraint
    };
    const queryInterface = {
        showAllTables: jest.fn().mockResolvedValue(['push_device_tokens']),
        describeTable: jest.fn(async () => ({ ...state.columns })),
        addColumn: jest.fn(async (_table, name, definition) => { state.columns[name] = definition; }),
        removeColumn: jest.fn(async (_table, name) => { delete state.columns[name]; }),
        showIndex: jest.fn(async () => [...state.indexes]),
        addIndex: jest.fn(async (_table, _fields, options) => { state.indexes.push({ name: options.name }); }),
        removeIndex: jest.fn(async (_table, name) => { state.indexes = state.indexes.filter((index) => index.name !== name); }),
        sequelize: {
            getDialect: () => 'mysql',
            query: jest.fn(async (sql) => {
                if (sql.startsWith('SELECT CONSTRAINT_NAME')) return state.constraint ? [state.constraint] : [];
                if (sql.includes('DROP CHECK')) state.constraint = null;
                if (sql.includes('ADD CONSTRAINT')) {
                    state.constraint = { CONSTRAINT_NAME: 'chk_push_device_tokens_owner', CHECK_CLAUSE: sql };
                }
                return [];
            })
        }
    };
    return { queryInterface, state };
};

describe('add staff push token owner migration', () => {
    it('adds staff owner columns/index and replaces the two-owner CHECK with a three-owner CHECK', async () => {
        const { queryInterface, state } = buildQueryInterface({
            constraint: { CONSTRAINT_NAME: 'chk_push_device_tokens_owner', CHECK_CLAUSE: 'guest and account owner branches' }
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith('push_device_tokens', 'staff_tenant_id', {
            type: 'UUID', allowNull: true
        });
        expect(queryInterface.addColumn).toHaveBeenCalledWith('push_device_tokens', 'staff_user_id', {
            type: 'INTEGER_UNSIGNED', allowNull: true
        });
        expect(queryInterface.addIndex).toHaveBeenCalledWith('push_device_tokens', [
            'staff_tenant_id', 'staff_user_id', 'revoked_at'
        ], { name: 'idx_push_device_tokens_staff_active' });
        expect(state.constraint.CHECK_CLAUSE).toContain('staff_tenant_id');
        expect(queryInterface.sequelize.query.mock.calls.map(([sql]) => sql).join('\n'))
            .toContain('DROP CHECK `chk_push_device_tokens_owner`');
    });

    it('is idempotent when columns, index, and staff-owner CHECK already exist', async () => {
        const { queryInterface } = buildQueryInterface({
            staffColumns: true,
            staffIndex: true,
            constraint: { CONSTRAINT_NAME: 'chk_push_device_tokens_owner', CHECK_CLAUSE: 'staff_tenant_id owner branch' }
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
        expect(queryInterface.sequelize.query.mock.calls.map(([sql]) => sql).join('\n'))
            .not.toContain('DROP CHECK');
    });

    it('restores the original owner CHECK and removes staff-only token bindings on rollback', async () => {
        const { queryInterface, state } = buildQueryInterface({
            staffColumns: true,
            staffIndex: true,
            constraint: { CONSTRAINT_NAME: 'chk_push_device_tokens_owner', CHECK_CLAUSE: 'staff_tenant_id owner branch' }
        });

        await migration.down(queryInterface, Sequelize);

        const sql = queryInterface.sequelize.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('DELETE FROM push_device_tokens WHERE staff_tenant_id IS NOT NULL');
        expect(state.constraint.CHECK_CLAUSE).not.toContain('staff_tenant_id');
        expect(state.columns).not.toHaveProperty('staff_tenant_id');
        expect(state.columns).not.toHaveProperty('staff_user_id');
        expect(state.indexes).toEqual([]);
    });
});
