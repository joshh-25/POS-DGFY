import { describe, expect, it, afterEach, jest } from '@jest/globals';
import mysql from 'mysql2/promise';
import { Sequelize } from 'sequelize';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';
import { applyPostSyncTenantSchema } from '../src/services/tenantSchemaBootstrap.js';
import {
    inspectRequiredTenantSchemaTables,
    inspectRequiredTenantSchemaColumns,
    inspectRequiredTenantSchemaIndexes,
    inspectRequiredTenantSchemaSeeds,
    inspectRequiredTenantSchemaEnumContracts
} from '../scripts/sync-tenant-schemas.js';

// #1071/#1124: the real, end-to-end coverage this tenant-bootstrap seam actually needs -- against
// a real MySQL connection, not a mocked queryInterface. `tenantProvisioning.storefrontBootstrap
// .test.js` used to (accidentally) be the only place the 000001->000002 migration-ordering claim
// was exercised at all, and only because a loose mock let `provisionTenant` reach that far; once
// that test's mocks were tightened to stop reaching into migration internals it has no opinion
// about (see its own comment), this is the one place left that actually proves the ordering claim.
// `createTestTenant()` already does step 1-2 of what `provisionTenant` does (create the tenant DB,
// `sync({ force: true })` the model graph); this test picks up from there and calls the real,
// unmocked `applyPostSyncTenantSchema` -- the same call `provisionTenant` makes -- then asserts the
// Phase 157 tables/columns/indexes it's supposed to leave behind actually exist.
//
// Un-skipped by #1166's fix: `EmployeeBreakSegment.belongsTo(EmployeeAttendanceSession, ...)`
// (src/models/index.js:744) makes `sync()` create a real MySQL FK on
// `employee_break_segments.employee_attendance_session_id`, and 20260824000001's
// `addGeneratedColumnIfMissing()` used to fail with `Cannot add foreign key constraint`
// (errno 150) trying to add a STORED generated column derived from that same FK'd column -- a
// combination the ordinary migration-runner path never hit (there this migration's own
// `createTable()` branch builds the table from scratch, with no pre-existing FK to collide
// with). The migration now drops any such FK before the ALTER and recreates it identically
// afterward (applied defensively to all three generated columns in this migration that read an
// association-FK'd column, not just the one #1166 reproduced).
describe('tenantSchemaBootstrap.applyPostSyncTenantSchema (DB integration)', () => {
    // #1432: measured against a real MySQL 8.0.46, createTestTenant()'s
    // sync({ force: true }) alone (139 tables) takes ~235s -- the code actually
    // under test here (applyPostSyncTenantSchema) takes ~8s/~1s. The default 30s
    // per-test budget was never achievable; this was a mis-budgeted timeout, not
    // a regression in the subject under test. 300s gives headroom over the
    // measured local (slower) MySQL.
    jest.setTimeout(300000);

    let ctx;

    afterEach(async () => {
        if (ctx) {
            await destroyTestTenant(ctx);
            ctx = null;
        }
    });

    it('applies the Phase 157 tenant-bootstrap migrations against a freshly-synced tenant database', async () => {
        ctx = await createTestTenant('schema-bootstrap');

        await applyPostSyncTenantSchema(ctx.tenantSeq, Sequelize, { dbName: ctx.dbName });

        const queryInterface = ctx.tenantSeq.getQueryInterface();
        const tables = (await queryInterface.showAllTables()).map((t) => (
            typeof t === 'string' ? t : (t.tableName || t.TABLE_NAME)
        ));
        for (const tableName of [
            'employee_attendance_sessions',
            'employee_break_segments',
            'pos_terminal_operator_sessions',
            'pos_drawer_handoff_events'
        ]) {
            expect(tables.map((t) => t.toLowerCase())).toContain(tableName);
        }

        // The idempotency columns 20260824000002 is responsible for adding on top of what
        // 20260824000001 created -- the exact contract whose absence (a "table missing" throw
        // fired at the wrong layer) triggered #1071 in the first place.
        const attendanceColumns = await queryInterface.describeTable('employee_attendance_sessions');
        expect(attendanceColumns).toHaveProperty('start_idempotency_key');
        expect(attendanceColumns).toHaveProperty('end_idempotency_key');
    });

    it('is idempotent -- applying it twice against the same tenant does not throw', async () => {
        ctx = await createTestTenant('schema-bootstrap-idempotent');

        await applyPostSyncTenantSchema(ctx.tenantSeq, Sequelize, { dbName: ctx.dbName });
        await expect(
            applyPostSyncTenantSchema(ctx.tenantSeq, Sequelize, { dbName: ctx.dbName })
        ).resolves.toBeUndefined();
    });

    // #2027 regression: a production tenant once reached `active` missing several generated
    // columns/indexes/seed rows that the canonical registry (REQUIRED_TENANT_SCHEMA_TABLES/
    // COLUMNS/INDEXES/SEEDS + enum contracts) already covered, because provisioning never ran
    // that registry at all -- only the Phase 157 migrations this file's other tests already
    // cover. applyPostSyncTenantSchema now reconciles against that same registry as a hard
    // precondition (it would already have thrown above if anything were missing); this test
    // independently re-verifies via the registry's own inspector functions, against a fresh raw
    // connection, rather than only trusting the gate's own accounting.
    it('leaves zero missing tables/columns/indexes/seeds/enum values against the canonical schema registry (#2027)', async () => {
        ctx = await createTestTenant('schema-parity');

        await applyPostSyncTenantSchema(ctx.tenantSeq, Sequelize, { dbName: ctx.dbName });

        const rawConnection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: ctx.dbName
        });
        try {
            const [missingTables, missingColumns, missingIndexes, missingSeeds, missingEnumEntries] = await Promise.all([
                inspectRequiredTenantSchemaTables(rawConnection, ctx.dbName),
                inspectRequiredTenantSchemaColumns(rawConnection, ctx.dbName),
                inspectRequiredTenantSchemaIndexes(rawConnection, ctx.dbName),
                inspectRequiredTenantSchemaSeeds(rawConnection, ctx.dbName),
                inspectRequiredTenantSchemaEnumContracts(rawConnection, ctx.dbName)
            ]);
            expect(missingTables).toEqual([]);
            expect(missingColumns).toEqual([]);
            expect(missingIndexes).toEqual([]);
            expect(missingSeeds).toEqual([]);
            expect(missingEnumEntries).toEqual([]);
        } finally {
            await rawConnection.end();
        }
    });

});
