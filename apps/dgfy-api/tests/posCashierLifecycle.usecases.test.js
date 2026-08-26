import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { createPosCashierLifecycleUseCases } from '../src/modules/pos/usecases/posCashierLifecycleUseCases.js';
import { assertPosAttendanceLifecyclePermission } from '../src/modules/pos/services/posAttendancePermissionPolicy.js';

const user = {
    user_id: 1,
    username: 'cashier-1',
    email: 'cashier-1@example.com',
    role: 'cashier',
    permissions: ['pos:attendance:view', 'pos:attendance:operate']
};

const shift = {
    pos_terminal_shift_id: 55,
    terminal_id: 'REG-1',
    location_id: 7,
    cashier_id: 1,
    status: 'open'
};

// #1045: a real-world stale permission snapshot -- provisioned before
// pos:attendance:view/operate shipped -- non-empty, so resolveEffectivePermissions
// (apps/dgfy-api/src/utils/userPermissions.js) does not fall back to role defaults.
const staleUser = {
    ...user,
    permissions: ['pos:view', 'pos:transact']
};

const buildFixture = ({ featureEnabled = true } = {}) => {
    let attendance = null;
    let activeBreak = null;
    let operator = null;
    let nextOperatorId = 90;
    const audits = [];
    const transactions = [];

    const repository = {
        async findEmployeeByEmail() {
            return { employee_id: 101 };
        },
        async findOpenAttendanceByUser({ userId, locationId }) {
            return attendance
                && Number(attendance.user_id) === Number(userId)
                && (locationId == null || Number(attendance.location_id) === Number(locationId))
                && attendance.status === 'open'
                ? { ...attendance }
                : null;
        },
        async createAttendanceSession(payload) {
            attendance = { ...payload, employee_attendance_session_id: 12 };
            return { ...attendance };
        },
        async findActiveOperator() {
            return operator ? { ...operator } : null;
        },
        async createOperatorSession(payload) {
            operator = { ...payload, pos_terminal_operator_session_id: nextOperatorId++ };
            return { ...operator };
        },
        async updateOperatorSession({ payload }) {
            operator = { ...operator, ...payload };
            return { ...operator };
        },
        async findOpenTerminalShift() {
            return { ...shift };
        },
        async findOpenBreak() {
            return activeBreak && activeBreak.status === 'open' ? { ...activeBreak } : null;
        },
        async updateBreakSegment({ payload }) {
            activeBreak = { ...activeBreak, ...payload };
            return { ...activeBreak };
        },
        async updateAttendanceSession({ payload }) {
            attendance = { ...attendance, ...payload };
            return { ...attendance };
        },
        async revokeOperatorSessionsForTerminal() {
            if (operator) operator = { ...operator, status: 'revoked' };
            return 1;
        },
        async createAuditLog(payload) {
            audits.push(payload);
        }
    };

    const authorityService = {
        maxAgeMs: 60 * 60 * 1000,
        issue: ({ operatorSessionId }) => `authority-${operatorSessionId}`,
        hashAuthorityToken: (token) => `hash:${token}`
    };

    const useCases = createPosCashierLifecycleUseCases({
        repository,
        resolveFeature: async ({ locationId }) => ({ enabled: featureEnabled, location_id: locationId }),
        authorityService,
        assertAttendancePermission: assertPosAttendanceLifecyclePermission
    });

    const transactionFactory = async () => {
        const transaction = {
            finished: false,
            async commit() {
                this.finished = 'commit';
            },
            async rollback() {
                this.finished = 'rollback';
            }
        };
        transactions.push(transaction);
        return transaction;
    };

    return {
        repository,
        useCases,
        audits,
        transactions,
        transactionFactory,
        setAttendance(value) { attendance = value; },
        setBreak(value) { activeBreak = value; },
        setOperator(value) { operator = value; },
        getAttendance() { return attendance; },
        getBreak() { return activeBreak; },
        getOperator() { return operator; }
    };
};

describe('POS automatic cashier shift lifecycle', () => {
    test('opening a shift creates attendance and operator authority in the supplied transaction', async () => {
        const fixture = buildFixture();
        const transaction = { finished: false };

        const result = await fixture.useCases.onShiftOpened({
            shift,
            user,
            payload: { idempotency_key: 'shift-open-55' },
            requestId: 'request-open-55',
            tenantId: 'tenant-1',
            transaction
        });

        expect(result.feature.enabled).toBe(true);
        expect(result.attendance.duty_type).toBe('regular');
        expect(result.operator_session.user_id).toBe(1);
        expect(result.authority_token).toBe('authority-90');
        expect(fixture.audits.map((entry) => entry.event_type)).toEqual([
            'pos_attendance_started_with_shift',
            'pos_cashier_shift_operator_started'
        ]);
    });

    test('takeover automatically starts regular attendance for an incoming cashier', async () => {
        const fixture = buildFixture();

        const result = await fixture.useCases.ensureAttendanceForTakeover({
            shift: { ...shift, cashier_id: 2 },
            user: { ...user, user_id: 2, username: 'cashier-2', email: 'cashier-2@example.com' },
            payload: { idempotency_key: 'takeover-attendance-55' },
            requestId: 'request-takeover-55',
            transaction: { finished: false }
        });

        expect(result.created).toBe(true);
        expect(result.attendance).toMatchObject({
            user_id: 2,
            location_id: 7,
            duty_type: 'regular',
            status: 'open'
        });
        expect(fixture.audits.at(-1)).toMatchObject({
            event_type: 'pos_attendance_started_with_takeover',
            action: 'CREATE',
            changes: { automatic: true, trigger: 'register_takeover' }
        });
    });

    test('takeover does not create a second attendance session at another location', async () => {
        const fixture = buildFixture();
        fixture.setAttendance({
            employee_attendance_session_id: 44,
            user_id: 2,
            location_id: 8,
            status: 'open'
        });

        await expect(fixture.useCases.ensureAttendanceForTakeover({
            shift: { ...shift, cashier_id: 2 },
            user: { ...user, user_id: 2, username: 'cashier-2', email: 'cashier-2@example.com' },
            payload: { idempotency_key: 'takeover-location-mismatch' },
            requestId: 'request-takeover-location-mismatch',
            transaction: { finished: false }
        })).rejects.toMatchObject({
            details: { reason_code: 'POS_OPERATOR_ATTENDANCE_LOCATION_MISMATCH' }
        });
        expect(fixture.audits).toHaveLength(0);
    });

    test('resuming a cashier closes the break and creates authority atomically', async () => {
        const fixture = buildFixture();
        fixture.setAttendance({
            employee_attendance_session_id: 12,
            user_id: 1,
            location_id: 7,
            status: 'open',
            started_at: new Date(Date.now() - 60_000)
        });
        fixture.setBreak({
            employee_break_segment_id: 13,
            employee_attendance_session_id: 12,
            status: 'open',
            started_at: new Date(Date.now() - 30_000)
        });

        const result = await dbStore.run({
            sequelize: { transaction: fixture.transactionFactory }
        }, () => fixture.useCases.resume({
            terminalId: 'REG-1',
            locationId: 7,
            shiftId: 55,
            user,
            tenantId: 'tenant-1',
            requestId: 'resume-55'
        }));

        expect(result.success).toBe(true);
        expect(result.data.resumed).toBe(true);
        expect(result.data.authority_token).toBe('authority-90');
        expect(fixture.getBreak().status).toBe('closed');
        expect(fixture.transactions[0].finished).toBe('commit');

        const retry = await dbStore.run({
            sequelize: { transaction: fixture.transactionFactory }
        }, () => fixture.useCases.resume({
            terminalId: 'REG-1',
            locationId: 7,
            shiftId: 55,
            user,
            tenantId: 'tenant-1',
            requestId: 'resume-55-retry'
        }));

        expect(retry.success).toBe(true);
        expect(retry.data.idempotent_resume).toBe(true);
        expect(retry.data.authority_token).toBe('authority-90');
    });

    test('resuming the shift owner restores a missing operator session', async () => {
        const fixture = buildFixture();
        fixture.setAttendance({
            employee_attendance_session_id: 12,
            user_id: 1,
            location_id: 7,
            status: 'open',
            started_at: new Date(Date.now() - 60_000)
        });

        const result = await dbStore.run({
            sequelize: { transaction: fixture.transactionFactory }
        }, () => fixture.useCases.resume({
            terminalId: 'REG-1',
            locationId: 7,
            shiftId: 55,
            user,
            tenantId: 'tenant-1',
            requestId: 'restore-owner-55'
        }));

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            resumed: true,
            recovered_missing_operator: true,
            authority_token: 'authority-90'
        });
        expect(fixture.getOperator()).toMatchObject({
            pos_terminal_shift_id: 55,
            user_id: 1,
            status: 'active'
        });
        expect(fixture.transactions[0].finished).toBe('commit');
    });

    test('missing operator recovery does not let a different cashier claim the shift', async () => {
        const fixture = buildFixture();
        const otherCashier = {
            ...user,
            user_id: 2,
            username: 'cashier-2',
            email: 'cashier-2@example.com'
        };
        fixture.setAttendance({
            employee_attendance_session_id: 22,
            user_id: 2,
            location_id: 7,
            status: 'open'
        });

        const result = await dbStore.run({
            sequelize: { transaction: fixture.transactionFactory }
        }, () => fixture.useCases.resume({
            terminalId: 'REG-1',
            locationId: 7,
            shiftId: 55,
            user: otherCashier,
            tenantId: 'tenant-1',
            requestId: 'reject-other-55'
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('POS_OPERATOR_NOT_ON_BREAK');
        expect(fixture.getOperator()).toBeNull();
        expect(fixture.transactions[0].finished).toBe('rollback');
    });

    // #1045: the register-owner regression case. A stale permission snapshot must
    // not block resume on a location where the attendance feature is off -- the
    // feature verdict has to be reached and win before the permission check runs.
    test('resume succeeds for a stale-permission user when the feature is disabled', async () => {
        const fixture = buildFixture({ featureEnabled: false });
        const shiftSpy = jest.spyOn(fixture.repository, 'findOpenTerminalShift');

        const result = await dbStore.run({
            sequelize: { transaction: fixture.transactionFactory }
        }, () => fixture.useCases.resume({
            terminalId: 'REG-1',
            locationId: 7,
            shiftId: 55,
            user: staleUser,
            tenantId: 'tenant-1',
            requestId: 'feature-disabled-stale-user'
        }));

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ resumed: false, authority_token: null });
        // Ordering assertion: the permission check must never even run when the
        // feature is off, so no repository access happens past the feature resolve.
        expect(shiftSpy).not.toHaveBeenCalled();
    });

    // Fail-closed counterpart: once the feature IS enabled, the same stale user
    // must still be denied, with the actionable reason code intact.
    test('resume still denies a stale-permission user when the feature is enabled', async () => {
        const fixture = buildFixture({ featureEnabled: true });
        const shiftSpy = jest.spyOn(fixture.repository, 'findOpenTerminalShift');

        const result = await dbStore.run({
            sequelize: { transaction: fixture.transactionFactory }
        }, () => fixture.useCases.resume({
            terminalId: 'REG-1',
            locationId: 7,
            shiftId: 55,
            user: staleUser,
            tenantId: 'tenant-1',
            requestId: 'feature-enabled-stale-user'
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('POS_ATTENDANCE_PERMISSION_REQUIRED');
        expect(shiftSpy).not.toHaveBeenCalled();
    });

    test('closing a shift ends an active break and attendance before register close commits', async () => {
        const fixture = buildFixture();
        fixture.setAttendance({
            employee_attendance_session_id: 12,
            user_id: 1,
            location_id: 7,
            status: 'open'
        });
        fixture.setBreak({
            employee_break_segment_id: 13,
            employee_attendance_session_id: 12,
            status: 'open'
        });
        const transaction = { finished: false };

        const result = await fixture.useCases.onShiftClosing({
            shift,
            user,
            requestId: 'shift-close-55',
            transaction
        });

        expect(result.attendance.status).toBe('closed');
        expect(fixture.getBreak().status).toBe('closed');
        expect(fixture.getAttendance().closed_by).toBe(1);
        expect(fixture.audits.at(-1).event_type).toBe('pos_attendance_ended_with_shift');
    });
});
