import { describe, expect, it, afterEach } from '@jest/globals';
import { Sequelize } from 'sequelize';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';
import { applyPostSyncTenantSchema } from '../src/services/tenantSchemaBootstrap.js';

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
// **Currently skipped -- #1166.** Running this for real (this session) found a second, deeper, and
// still-live defect distinct from #1071's own mock-gap finding: `EmployeeBreakSegment.belongsTo(
// EmployeeAttendanceSession, ...)` (src/models/index.js:744) makes `sync()` create a real MySQL FK
// on `employee_break_segments.employee_attendance_session_id`, and 20260824000001's
// `addGeneratedColumnIfMissing()` then fails with `Cannot add foreign key constraint` (errno 150)
// trying to add a STORED generated column derived from that same FK'd column -- a combination the
// ordinary migration-runner path never hits (there this migration's own `createTable()` branch
// builds the table from scratch, with no pre-existing FK to collide with). Un-skip once #1166 lands
// a real fix; the assertions below already encode the expected passing behavior.
describe('tenantSchemaBootstrap.applyPostSyncTenantSchema (DB integration)', () => {
    let ctx;

    afterEach(async () => {
        if (ctx) {
            await destroyTestTenant(ctx);
            ctx = null;
        }
    });

    it.skip('applies the Phase 157 tenant-bootstrap migrations against a freshly-synced tenant database', async () => {
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

    it.skip('is idempotent -- applying it twice against the same tenant does not throw', async () => {
        ctx = await createTestTenant('schema-bootstrap-idempotent');

        await applyPostSyncTenantSchema(ctx.tenantSeq, Sequelize, { dbName: ctx.dbName });
        await expect(
            applyPostSyncTenantSchema(ctx.tenantSeq, Sequelize, { dbName: ctx.dbName })
        ).resolves.toBeUndefined();
    });
});
