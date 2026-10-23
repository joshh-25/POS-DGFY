import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261023000001-extend-tenant-admin-audit-actions-apply-template.cjs');

const EXPECTED_ACTIONS = [
    'capability_update',
    'pos_metadata_update',
    'admin_create_tenant',
    'admin_create_account_and_tenant',
    'admin_assign_owner',
    'admin_force_assign_owner',
    'affiliate_slots_update',
    'force_delete_registration_history',
    'registration_upload_download',
    'business_name_update',
    'apply_template'
];

const PREVIOUS_ACTIONS = EXPECTED_ACTIONS.slice(0, -1);

const parseEnumValues = (sql) => {
    const enumClause = sql.match(/MODIFY\s+action\s+ENUM\(([^)]*)\)\s+NOT\s+NULL/i)?.[1];
    if (!enumClause) throw new Error(`Could not find action ENUM in SQL: ${sql}`);
    return [...enumClause.matchAll(/'((?:''|[^'])*)'/g)].map(([, value]) => value.replace(/''/g, "'"));
};

const buildQueryInterface = ({ tables = ['tenant_admin_audit_logs'] } = {}) => {
    const statements = [];
    return {
        statements,
        queryInterface: {
            showAllTables: jest.fn().mockResolvedValue(tables),
            sequelize: {
                query: jest.fn(async (sql) => {
                    statements.push(sql);
                    return [];
                })
            }
        }
    };
};

describe('extend tenant admin audit actions with apply_template migration', () => {
    it('adds apply_template last while preserving the full current action list', async () => {
        const { queryInterface, statements } = buildQueryInterface();

        await migration.up(queryInterface);

        expect(statements).toHaveLength(1);
        expect(statements[0]).toMatch(/^ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM\(/);
        expect(statements[0]).toMatch(/\) NOT NULL;$/);
        expect(parseEnumValues(statements[0])).toEqual(EXPECTED_ACTIONS);
    });

    it('is a no-op in both directions when the landlord audit table is absent', async () => {
        const { queryInterface, statements } = buildQueryInterface({ tables: [] });

        await migration.up(queryInterface);
        await migration.down(queryInterface);

        expect(queryInterface.showAllTables).toHaveBeenCalledTimes(2);
        expect(queryInterface.sequelize.query).not.toHaveBeenCalled();
        expect(statements).toEqual([]);
    });

    it('remaps apply_template rows before restoring the previous ten-value enum on rollback', async () => {
        const { queryInterface, statements } = buildQueryInterface();

        await migration.down(queryInterface);

        expect(statements).toHaveLength(2);
        expect(statements[0]).toBe(
            "UPDATE tenant_admin_audit_logs SET action = 'capability_update' WHERE action = 'apply_template';"
        );
        expect(statements[1]).toMatch(/^ALTER TABLE tenant_admin_audit_logs MODIFY action ENUM\(/);
        expect(parseEnumValues(statements[1])).toEqual(PREVIOUS_ACTIONS);
    });
});
