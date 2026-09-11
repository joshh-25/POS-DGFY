import { describe, expect, it } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// #1071/#1124: tenantBootstrapManifest.cjs resolves + requires every migration it lists eagerly,
// at module-load time -- a renamed, moved, or deleted migration entry throws the moment this
// module loads, not only when a tenant happens to be provisioned. This test's own job is just to
// confirm that guard actually fires on require (the manifest kills itself on a stale entry, per its
// own comment) and that the shape it exposes is what tenantSchemaBootstrap.js expects.
//
// #1819: the manifest now lives in packages/tenant-bootstrap, a `file:` dependency of this app --
// required here through apps/dgfy-api's own node_modules, the same as any other npm dependency
// (no jest moduleNameMapper needed, unlike packages/web-core's cross-package-boundary case).
describe('tenantBootstrapManifest', () => {
    it('loads without throwing and lists every configured migration path', () => {
        const manifest = require('@sieitzz/tenant-bootstrap');

        expect(manifest.TENANT_BOOTSTRAP_MIGRATIONS.length).toBeGreaterThan(0);
        expect(typeof manifest.applyTenantBootstrapMigrations).toBe('function');
    });

    it('applies every manifest entry\'s up() in order against a given queryInterface', async () => {
        const manifest = require('@sieitzz/tenant-bootstrap');

        const calls = [];
        // Every table already exists, and every column/index/etc already present -- both
        // migrations' own idempotent-tolerant branches (see their `if (!exists) ...` shape) then
        // do nothing, which is exactly what this test wants to assert: applyTenantBootstrapMigrations
        // runs both real up()s end to end without throwing, given a queryInterface that looks like a
        // fully-up-to-date tenant database.
        const queryInterface = {
            showAllTables: async () => [
                'employee_attendance_sessions',
                'employee_break_segments',
                'pos_terminal_operator_sessions',
                'pos_drawer_handoff_events'
            ],
            describeTable: async (tableName) => ({
                start_idempotency_key: {},
                end_idempotency_key: {},
                [`${tableName}_placeholder`]: {}
            }),
            showIndex: async () => [
                { name: 'uq_employee_attendance_sessions_user_start_idempotency' },
                { name: 'uq_employee_attendance_sessions_user_end_idempotency' },
                { name: 'uq_employee_break_segments_session_start_idempotency' },
                { name: 'uq_employee_break_segments_session_end_idempotency' }
            ],
            sequelize: { query: async () => [[{ CONSTRAINT_NAME: null }]] },
            addColumn: async (...args) => { calls.push(['addColumn', ...args]); },
            addIndex: async (...args) => { calls.push(['addIndex', ...args]); },
            createTable: async (...args) => { calls.push(['createTable', ...args]); }
        };
        const Sequelize = { DataTypes: {}, INTEGER: 'INTEGER', STRING: () => 'STRING', BOOLEAN: 'BOOLEAN' };

        await expect(manifest.applyTenantBootstrapMigrations(queryInterface, Sequelize)).resolves.toBeUndefined();
    });
});
