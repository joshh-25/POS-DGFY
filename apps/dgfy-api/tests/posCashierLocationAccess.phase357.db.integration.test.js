import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Sequelize } from 'sequelize';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
    jest
} from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { createPosCashierAttendanceRepository } from '../src/modules/pos/repositories/posCashierAttendanceRepository.js';
import {
    createAssertPosUserOperatingScope,
    normalizePosOperatingConflict
} from '../src/modules/pos/usecases/posUserOperatingScope.js';
import { createPosCashierLifecycleUseCases } from '../src/modules/pos/usecases/posCashierLifecycleUseCases.js';
import { resolvePosCashierAttendanceFeature } from '../src/modules/pos/services/posCashierAttendanceFeature.js';
import { assertPosAttendanceLifecyclePermission } from '../src/modules/pos/services/posAttendancePermissionPolicy.js';
import posOperatorAuthorityService from '../src/modules/pos/services/posOperatorAuthorityService.js';

jest.setTimeout(180000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');
const migrationRunnerRoot = path.join(backendRoot, '..', 'dgfy-migration-runner');
const sequelizeCliPath = path.join(migrationRunnerRoot, 'node_modules', 'sequelize-cli', 'lib', 'sequelize');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const adminSequelize = new Sequelize('mysql', dbConfig.user, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: false
});

const createIsolatedDbName = () => (
    `test_pos_cashier_location_phase357_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const runMigrationsForDb = (dbName) => {
    if (!fs.existsSync(sequelizeCliPath)) {
        throw new Error(`Sequelize CLI entrypoint not found at: ${sequelizeCliPath}`);
    }

    const migrationResult = spawnSync(
        process.execPath,
        [
            sequelizeCliPath,
            'db:migrate',
            '--env',
            'development',
            '--config',
            'src/config/sequelize.config.cjs',
            '--migrations-path',
            'migrations'
        ],
        {
            cwd: migrationRunnerRoot,
            encoding: 'utf8',
            env: {
                ...process.env,
                DB_NAME: dbName,
                DB_HOST: dbConfig.host,
                DB_USER: dbConfig.user,
                DB_PASSWORD: dbConfig.password,
                DB_PORT: String(dbConfig.port)
            }
        }
    );

    if (migrationResult.status !== 0) {
        throw new Error(
            `Migration failed for ${dbName}\n${migrationResult.stdout}\n${migrationResult.stderr}`
        );
    }
};

const lifecyclePermissions = [
    'pos:attendance:view',
    'pos:attendance:operate'
];

describe('Phase 357 cashier location access acceptance on a disposable migrated tenant', () => {
    const dbName = createIsolatedDbName();
    let tenantSequelize;
    let models;
    let repository;
    let guard;
    let lifecycle;

    const runInTenantContext = (callback) => dbStore.run(
        {
            ...models,
            sequelize: tenantSequelize,
            tenantId: `tenant-${dbName}`,
            tenantName: 'Phase 357 Acceptance Tenant',
            dbName
        },
        callback
    );

    const setFeature = async (locationIds, enabled = true) => {
        const settingValue = JSON.stringify({ enabled, location_ids: locationIds });
        const existing = await models.SystemSetting.findOne({
            where: { setting_key: 'pos_cashier_attendance_lifecycle_v1' }
        });
        if (existing) {
            await existing.update({ setting_value: settingValue, data_type: 'json' });
            return;
        }
        await models.SystemSetting.create({
            setting_key: 'pos_cashier_attendance_lifecycle_v1',
            setting_value: settingValue,
            data_type: 'json',
            description: 'Phase 357 disposable acceptance setting'
        });
    };

    const createLocation = async (label) => models.TenantLocation.create({
        name: `Phase 357 ${label} ${crypto.randomUUID().slice(0, 8)}`,
        address_line: `${label} Acceptance Location`,
        latitude: 10.7202,
        longitude: 122.5621,
        is_open: true,
        is_active: true,
        allow_out_of_stock_sales: false,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true
    });

    const createUser = async ({ role = 'cashier', permissions = lifecyclePermissions, masterAdmin = false } = {}) => {
        const suffix = crypto.randomUUID().slice(0, 8);
        return models.User.create({
            username: `phase357_${role}_${suffix}`,
            email: `phase357_${role}_${suffix}@pos.test`,
            password_hash: 'phase357-test-hash',
            role,
            is_active: true,
            permissions,
            is_master_admin: masterAdmin
        });
    };

    const grantLocation = (user, location) => models.UserLocationGrant.create({
        user_id: user.user_id,
        location_id: location.location_id,
        created_by: user.user_id
    });

    const createOpenShift = (user, location, terminalId) => models.PosTerminalShift.create({
        business_date: new Date().toISOString().slice(0, 10),
        terminal_id: terminalId,
        location_id: location.location_id,
        cashier_id: user.user_id,
        opening_float_amount: 125.5,
        opening_note: 'Phase 357 acceptance fixture',
        status: 'open'
    });

    const scopeFor = (user, location, terminalId, shiftId = null) => ({
        userId: user.user_id,
        locationId: location.location_id,
        terminalId,
        ...(shiftId ? { shiftId } : {})
    });

    const financialCounts = async () => {
        const [transactions, payments, stockMovements, handoffs, drawerEvents] = await Promise.all([
            models.PosTransaction.count(),
            models.PosPaymentAllocation.count(),
            models.StockMovement.count(),
            models.PosDrawerHandoffEvent.count(),
            models.PosCashDrawerEvent.count()
        ]);
        return { transactions, payments, stockMovements, handoffs, drawerEvents };
    };

    const createLifecycleOperator = async (user, location, terminalId, { key = null } = {}) => {
        const shift = await createOpenShift(user, location, terminalId);
        const result = await runInTenantContext(() => tenantSequelize.transaction((transaction) => (
            lifecycle.onShiftOpened({
                shift: shift.toJSON(),
                user,
                lifecycleUser: user,
                payload: { idempotency_key: key || `phase357-open-${shift.pos_terminal_shift_id}` },
                requestId: `phase357-request-${shift.pos_terminal_shift_id}`,
                transaction,
                tenantId: `tenant-${dbName}`
            })
        )));
        return { shift, result };
    };

    beforeAll(async () => {
        await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        runMigrationsForDb(dbName);

        tenantSequelize = new Sequelize(dbName, dbConfig.user, dbConfig.password, {
            host: dbConfig.host,
            port: dbConfig.port,
            dialect: 'mysql',
            logging: false,
            pool: { max: 8, min: 0 }
        });
        await tenantSequelize.authenticate();
        models = getTenantModels(tenantSequelize);
        repository = createPosCashierAttendanceRepository(models);
        guard = createAssertPosUserOperatingScope({ repository });
        lifecycle = createPosCashierLifecycleUseCases({
            repository,
            assertUserOperatingScope: guard,
            resolveFeature: resolvePosCashierAttendanceFeature,
            authorityService: posOperatorAuthorityService,
            assertAttendancePermission: assertPosAttendanceLifecyclePermission
        });
    }, 180000);

    afterAll(async () => {
        if (tenantSequelize) await tenantSequelize.close();
        await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await adminSequelize.close();
    }, 60000);

    it('proves location flag scope, direct grant denial, same-terminal resume, and actor attribution', async () => {
        const aurora = await createLocation('Aurora');
        const east = await createLocation('East');
        const cashier = await createUser();
        await grantLocation(cashier, aurora);

        await setFeature([aurora.location_id]);
        await expect(runInTenantContext(() => resolvePosCashierAttendanceFeature({ locationId: aurora.location_id })))
            .resolves.toMatchObject({ enabled: true, configured_location_ids: [aurora.location_id] });
        await expect(runInTenantContext(() => resolvePosCashierAttendanceFeature({ locationId: east.location_id })))
            .resolves.toMatchObject({ enabled: false });

        const beforeUnassigned = await financialCounts();
        await expect(tenantSequelize.transaction((transaction) => guard({
            ...scopeFor(cashier, east, 'P357-EAST-UNASSIGNED'),
            transaction
        }))).rejects.toMatchObject({
            statusCode: 403,
            details: { reason_code: 'POS_OPERATOR_LOCATION_GRANT_REQUIRED' }
        });
        expect(await financialCounts()).toEqual(beforeUnassigned);

        const { shift, result: firstOpen } = await createLifecycleOperator(cashier, aurora, 'P357-AURORA-01');
        const secondOpen = await runInTenantContext(() => tenantSequelize.transaction((transaction) => (
            lifecycle.onShiftOpened({
                shift: shift.toJSON(),
                user: cashier,
                lifecycleUser: cashier,
                payload: { idempotency_key: `phase357-open-${shift.pos_terminal_shift_id}` },
                requestId: `phase357-repeat-${shift.pos_terminal_shift_id}`,
                transaction,
                tenantId: `tenant-${dbName}`
            })
        )));

        expect(firstOpen.feature).toMatchObject({ enabled: true, location_id: aurora.location_id });
        expect(secondOpen).toMatchObject({ reused_existing: true });
        expect(await models.EmployeeAttendanceSession.count({ where: { user_id: cashier.user_id, status: 'open' } })).toBe(1);
        expect(await models.PosTerminalOperatorSession.count({ where: { user_id: cashier.user_id, status: 'active' } })).toBe(1);

        const persistedShift = await models.PosTerminalShift.findByPk(shift.pos_terminal_shift_id);
        const persistedOperator = await models.PosTerminalOperatorSession.findOne({
            where: { pos_terminal_shift_id: shift.pos_terminal_shift_id, status: 'active' }
        });
        const persistedAttendance = await models.EmployeeAttendanceSession.findOne({
            where: { user_id: cashier.user_id, status: 'open' }
        });
        expect(persistedShift).toMatchObject({
            cashier_id: cashier.user_id,
            location_id: aurora.location_id,
            terminal_id: 'P357-AURORA-01'
        });
        expect(persistedOperator).toMatchObject({
            user_id: cashier.user_id,
            location_id: aurora.location_id,
            terminal_id: 'P357-AURORA-01',
            employee_attendance_session_id: persistedAttendance.employee_attendance_session_id,
            status: 'active'
        });

        const lifecycleAudits = await models.AuditLog.findAll({
            where: { entity_type: 'pos_cashier_lifecycle' }
        });
        expect(lifecycleAudits.length).toBeGreaterThanOrEqual(2);
        expect(lifecycleAudits.every((row) => Number(row.user_id) === cashier.user_id)).toBe(true);

        const beforeSecondTerminal = await financialCounts();
        await expect(tenantSequelize.transaction((transaction) => guard({
            ...scopeFor(cashier, aurora, 'P357-AURORA-02'),
            transaction
        }))).rejects.toMatchObject({
            statusCode: 409,
            details: {
                reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE',
                existing_terminal_id: 'P357-AURORA-01',
                existing_location_id: aurora.location_id,
                existing_shift_id: shift.pos_terminal_shift_id
            }
        });
        expect(await financialCounts()).toEqual(beforeSecondTerminal);
        expect(await models.PosTerminalShift.count({ where: { cashier_id: cashier.user_id, status: 'open' } })).toBe(1);
    });

    it('proves disabled lifecycle fallback, independent eligible cashiers, revocation, and inactive-user fail-closed behavior', async () => {
        const legacyLocation = await createLocation('Legacy');
        const legacyCashier = await createUser();
        await grantLocation(legacyCashier, legacyLocation);
        await setFeature([], true);

        const legacyShift = await createOpenShift(legacyCashier, legacyLocation, 'P357-LEGACY-01');
        const legacyResult = await runInTenantContext(() => tenantSequelize.transaction((transaction) => (
            lifecycle.onShiftOpened({
                shift: legacyShift.toJSON(),
                user: legacyCashier,
                lifecycleUser: legacyCashier,
                transaction,
                tenantId: `tenant-${dbName}`
            })
        )));
        expect(legacyResult).toMatchObject({ feature: { enabled: false }, attendance: null, authority_token: null });
        expect(await models.EmployeeAttendanceSession.count({ where: { user_id: legacyCashier.user_id } })).toBe(0);
        expect(await models.PosTerminalOperatorSession.count({ where: { user_id: legacyCashier.user_id } })).toBe(0);

        const aurora = await createLocation('Revocation-Aurora');
        const east = await createLocation('Revocation-East');
        const cashierA = await createUser();
        const cashierB = await createUser();
        await Promise.all([grantLocation(cashierA, aurora), grantLocation(cashierB, east)]);
        await setFeature([aurora.location_id, east.location_id]);

        const operatorA = await createLifecycleOperator(cashierA, aurora, 'P357-REV-A');
        const operatorB = await createLifecycleOperator(cashierB, east, 'P357-REV-B');
        expect(operatorA.result.operator_session).toMatchObject({ user_id: cashierA.user_id, location_id: aurora.location_id });
        expect(operatorB.result.operator_session).toMatchObject({ user_id: cashierB.user_id, location_id: east.location_id });

        const beforeGrantRevocation = await financialCounts();
        await models.UserLocationGrant.destroy({ where: { user_id: cashierA.user_id, location_id: aurora.location_id } });
        await expect(tenantSequelize.transaction((transaction) => guard({
            ...scopeFor(cashierA, aurora, 'P357-REV-A'),
            transaction
        }))).rejects.toMatchObject({
            statusCode: 403,
            details: { reason_code: 'POS_OPERATOR_LOCATION_GRANT_REQUIRED' }
        });
        expect(await financialCounts()).toEqual(beforeGrantRevocation);
        expect(await models.PosTerminalShift.count({ where: { pos_terminal_shift_id: operatorA.shift.pos_terminal_shift_id, status: 'open' } })).toBe(1);
        expect(await models.PosTerminalOperatorSession.count({ where: { pos_terminal_shift_id: operatorA.shift.pos_terminal_shift_id, status: 'active' } })).toBe(1);

        await grantLocation(cashierA, aurora);
        await cashierA.update({ is_active: false });
        await expect(tenantSequelize.transaction((transaction) => guard({
            ...scopeFor(cashierA, aurora, 'P357-REV-A'),
            transaction
        }))).rejects.toMatchObject({
            statusCode: 403,
            details: { reason_code: 'POS_OPERATOR_INACTIVE' }
        });
        expect(await models.PosTerminalShift.count({ where: { pos_terminal_shift_id: operatorA.shift.pos_terminal_shift_id, status: 'open' } })).toBe(1);
        expect(await models.PosTerminalOperatorSession.count({ where: { pos_terminal_shift_id: operatorA.shift.pos_terminal_shift_id, status: 'active' } })).toBe(1);
    });

    it('serializes concurrent acquisition, keeps one persisted authority, and verifies all operating indexes', async () => {
        const locationA = await createLocation('Concurrent-A');
        const locationB = await createLocation('Concurrent-B');
        const cashier = await createUser();
        await Promise.all([grantLocation(cashier, locationA), grantLocation(cashier, locationB)]);
        await setFeature([locationA.location_id, locationB.location_id]);

        const before = await financialCounts();
        const scopes = [
            scopeFor(cashier, locationA, 'P357-CONCURRENT-A'),
            scopeFor(cashier, locationB, 'P357-CONCURRENT-B')
        ];
        const acquire = (scope) => tenantSequelize.transaction(async (transaction) => {
            const user = await guard({ ...scope, transaction });
            await models.PosTerminalShift.create({
                business_date: new Date().toISOString().slice(0, 10),
                terminal_id: scope.terminalId,
                location_id: scope.locationId,
                cashier_id: user.user_id,
                opening_float_amount: 0,
                status: 'open'
            }, { transaction });
            return scope;
        }).catch((error) => {
            throw normalizePosOperatingConflict(error);
        });

        const results = await Promise.allSettled(scopes.map(acquire));
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected');
        expect(rejected.reason).toMatchObject({ statusCode: 409 });
        expect(['POS_OPERATOR_ACTIVE_ELSEWHERE', 'POS_OPERATOR_CONCURRENT_CHANGE'])
            .toContain(rejected.reason.details?.reason_code);

        expect(await models.PosTerminalShift.count({ where: { cashier_id: cashier.user_id, status: 'open' } })).toBe(1);
        expect(await models.PosTerminalOperatorSession.count({ where: { user_id: cashier.user_id, status: 'active' } })).toBe(0);
        expect(await models.EmployeeAttendanceSession.count({ where: { user_id: cashier.user_id, status: 'open' } })).toBe(0);
        expect(await financialCounts()).toEqual(before);

        const requiredIndexes = [
            ['pos_terminal_shifts', 'uq_pos_terminal_shifts_active_operator'],
            ['pos_terminal_operator_sessions', 'uq_pos_terminal_operator_sessions_active_user'],
            ['pos_terminal_operator_sessions', 'uq_pos_terminal_operator_sessions_active_terminal'],
            ['employee_attendance_sessions', 'uq_employee_attendance_sessions_active_user']
        ];
        const queryInterface = tenantSequelize.getQueryInterface();
        for (const [tableName, indexName] of requiredIndexes) {
            const indexes = await queryInterface.showIndex(tableName);
            expect(indexes).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: indexName, unique: true })
            ]));
        }

        const [generatedColumns] = await tenantSequelize.query(`
            SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND COLUMN_NAME IN ('active_operator_user_id', 'active_terminal_id', 'active_user_id')
        `);
        expect(generatedColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ table_name: 'pos_terminal_shifts', column_name: 'active_operator_user_id' }),
            expect.objectContaining({ table_name: 'pos_terminal_operator_sessions', column_name: 'active_operator_user_id' }),
            expect.objectContaining({ table_name: 'pos_terminal_operator_sessions', column_name: 'active_terminal_id' }),
            expect.objectContaining({ table_name: 'employee_attendance_sessions', column_name: 'active_user_id' })
        ]));
    });
});
