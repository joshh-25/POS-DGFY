import { createPosCashierAttendanceUseCases, POS_ATTENDANCE_ERROR_CODES } from '../src/modules/pos/usecases/posCashierAttendanceUseCases.js';
import { DomainError } from '../src/modules/shared/contracts/domainErrors.js';

const clone = (value) => (value ? { ...value } : null);

const buildRepository = () => {
    let attendanceId = 0;
    let breakId = 0;
    const attendance = [];
    const breaks = [];
    const audits = [];

    const repository = {
        attendance,
        breaks,
        audits,
        async findUserById() { return { is_active: true }; },
        async findEmployeeById() { return null; },
        async findEmployeeByEmail() { return null; },
        async findOpenAttendanceByUser({ userId, locationId }) {
            return clone(attendance
                .filter((row) => row.user_id === userId && row.status === 'open' && (locationId == null || row.location_id === locationId))
                .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0]);
        },
        async findAttendanceById({ attendanceSessionId }) {
            return clone(attendance.find((row) => row.employee_attendance_session_id === attendanceSessionId));
        },
        async findAttendanceByIdempotency({ userId, action, key }) {
            const field = action === 'start_attendance' ? 'start_idempotency_key' : 'end_idempotency_key';
            return clone(attendance.find((row) => row.user_id === userId && row[field] === key));
        },
        async listAttendanceByUser({ userId, locationId }) {
            return attendance.filter((row) => row.user_id === userId && (locationId == null || row.location_id === locationId)).map(clone);
        },
        async createAttendanceSession(payload) {
            const row = { ...payload, employee_attendance_session_id: ++attendanceId };
            attendance.push(row);
            return clone(row);
        },
        async updateAttendanceSession({ attendanceSessionId, payload }) {
            const row = attendance.find((entry) => entry.employee_attendance_session_id === attendanceSessionId);
            if (!row) return null;
            Object.assign(row, payload);
            return clone(row);
        },
        async findOpenBreak({ attendanceSessionId }) {
            return clone(breaks.find((row) => row.employee_attendance_session_id === attendanceSessionId && row.status === 'open'));
        },
        async findBreakByIdempotency({ attendanceSessionId, action, key }) {
            const field = action === 'start_break' ? 'start_idempotency_key' : 'end_idempotency_key';
            return clone(breaks.find((row) => row.employee_attendance_session_id === attendanceSessionId && row[field] === key));
        },
        async createBreakSegment(payload) {
            const row = { ...payload, employee_break_segment_id: ++breakId };
            breaks.push(row);
            return clone(row);
        },
        async updateBreakSegment({ breakSegmentId, payload }) {
            const row = breaks.find((entry) => entry.employee_break_segment_id === breakSegmentId);
            if (!row) return null;
            Object.assign(row, payload);
            return clone(row);
        },
        async createAuditLog(payload) {
            audits.push(payload);
        }
    };
    return repository;
};

const buildUseCases = (repository, featureEnabled = true) => createPosCashierAttendanceUseCases({
    repository,
    resolveLocation: async ({ requestedLocationId }) => ({ location_id: requestedLocationId || 1 }),
    resolveFeature: async ({ locationId }) => {
        if (!featureEnabled) {
            throw new DomainError(
                POS_ATTENDANCE_ERROR_CODES.FEATURE_DISABLED,
                'Cashier attendance is not enabled for this location.',
                { statusCode: 404 }
            );
        }
        return { enabled: true, location_id: locationId };
    },
    resolveReadFeature: async ({ locationId }) => ({ enabled: featureEnabled, location_id: locationId }),
    runTransaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' }, finished: false })
});

const user = (userId, role = 'cashier') => ({
    user_id: userId,
    username: `cashier-${userId}`,
    email: `cashier-${userId}@example.com`,
    role,
    permissions: role === 'manager' ? ['pos:attendance:manage'] : ['pos:attendance:operate']
});

describe('POS cashier attendance and break lifecycle', () => {
    it('returns a fail-closed disabled state without exposing attendance records', async () => {
        const repository = buildRepository();
        const useCases = buildUseCases(repository, false);

        const result = await useCases.getCurrentAttendance({
            user: user(1),
            query: { location_id: 1 }
        });

        expect(result.success).toBe(true);
        expect(result.data.feature.enabled).toBe(false);
        expect(result.data.attendance_session).toBeNull();
        expect(result.data.recent_sessions).toEqual([]);
    });

    it('checks the rollout before requiring attendance when starting a break', async () => {
        const repository = buildRepository();
        const useCases = buildUseCases(repository, false);

        const result = await useCases.startBreak({
            user: user(1),
            payload: { location_id: 1, idempotency_key: 'disabled-break-start' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(POS_ATTENDANCE_ERROR_CODES.FEATURE_DISABLED);
        expect(result.error.message).not.toMatch(/time in before starting/i);
        expect(repository.attendance).toHaveLength(0);
        expect(repository.breaks).toHaveLength(0);
    });

    it('records the target scenario as three attendance sessions and one break', async () => {
        const repository = buildRepository();
        const useCases = buildUseCases(repository);
        const a = user(1);
        const b = user(2);

        expect((await useCases.timeIn({ user: a, payload: { location_id: 1, idempotency_key: 'a-time-in-1' } })).success).toBe(true);
        expect((await useCases.startBreak({ user: a, payload: { location_id: 1, idempotency_key: 'a-break-start-1' } })).success).toBe(true);
        expect((await useCases.endBreak({ user: a, payload: { location_id: 1, idempotency_key: 'a-break-end-1' } })).success).toBe(true);
        expect((await useCases.timeOut({ user: a, payload: { location_id: 1, idempotency_key: 'a-time-out-1' } })).success).toBe(true);

        expect((await useCases.startReliefDuty({ user: b, payload: { location_id: 1, idempotency_key: 'b-relief-start-1' } })).success).toBe(true);
        expect((await useCases.endReliefDuty({ user: b, payload: { location_id: 1, idempotency_key: 'b-relief-end-1' } })).success).toBe(true);
        expect((await useCases.timeIn({ user: b, payload: { location_id: 1, idempotency_key: 'b-time-in-1' } })).success).toBe(true);

        expect(repository.attendance).toHaveLength(3);
        expect(repository.attendance.map((row) => row.duty_type)).toEqual(['regular', 'relief', 'regular']);
        expect(repository.breaks).toHaveLength(1);
        expect(repository.breaks[0].status).toBe('closed');
    });

    it('returns a replay for the same key and rejects a second active session', async () => {
        const repository = buildRepository();
        const useCases = buildUseCases(repository);
        const first = await useCases.timeIn({ user: user(1), payload: { location_id: 1, idempotency_key: 'same-time-in-1' } });
        const replay = await useCases.timeIn({ user: user(1), payload: { location_id: 1, idempotency_key: 'same-time-in-1' } });
        const duplicate = await useCases.timeIn({ user: user(1), payload: { location_id: 1, idempotency_key: 'different-time-in-1' } });
        const ended = await useCases.timeOut({ user: user(1), payload: { location_id: 1, idempotency_key: 'same-time-out-1' } });
        const endedReplay = await useCases.timeOut({ user: user(1), payload: { location_id: 1, idempotency_key: 'same-time-out-1' } });

        expect(first.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(duplicate.error.code).toBe(POS_ATTENDANCE_ERROR_CODES.ALREADY_ACTIVE);
        expect(ended.success).toBe(true);
        expect(endedReplay.data.idempotent_replay).toBe(true);
        expect(repository.attendance).toHaveLength(1);
    });

    it('rejects invalid break order, overlap, and cross-location mutations without partial records', async () => {
        const repository = buildRepository();
        const useCases = buildUseCases(repository);
        const cashier = user(1);

        expect((await useCases.endBreak({ user: cashier, payload: { location_id: 1, idempotency_key: 'break-end-before' } })).error.code)
            .toBe(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION);
        await useCases.timeIn({ user: cashier, payload: { location_id: 1, idempotency_key: 'time-in-valid' } });
        expect((await useCases.startBreak({ user: cashier, payload: { location_id: 1, idempotency_key: 'break-start-one' } })).success).toBe(true);
        expect((await useCases.startBreak({ user: cashier, payload: { location_id: 1, idempotency_key: 'break-start-two' } })).error.code)
            .toBe(POS_ATTENDANCE_ERROR_CODES.ALREADY_ACTIVE);
        expect((await useCases.timeOut({ user: cashier, payload: { location_id: 2, idempotency_key: 'time-out-wrong-location' } })).error.code)
            .toBe(POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED);
        expect(repository.attendance).toHaveLength(1);
        expect(repository.breaks).toHaveLength(1);
        expect(repository.breaks[0].status).toBe('open');
    });

    it('records manager corrections as audit events and never deletes the row', async () => {
        const repository = buildRepository();
        const useCases = buildUseCases(repository);
        await useCases.timeIn({ user: user(2), payload: { location_id: 1, idempotency_key: 'target-time-in' } });
        const result = await useCases.correctAttendance({
            user: user(9, 'manager'),
            payload: {
                attendance_session_id: 1,
                correction_action: 'end_attendance',
                location_id: 1,
                reason: 'Cashier forgot to time out',
                idempotency_key: 'manager-correction-1'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.attendance).toHaveLength(1);
        expect(repository.attendance[0].status).toBe('closed');
        expect(repository.audits.at(-1).event_type).toBe('pos_attendance_manager_correction');
    });

    it('blocks break and time out while the cashier owns an in-flight payment', async () => {
        const repository = buildRepository();
        repository.findActiveOperator = async () => ({ pos_terminal_shift_id: 77, user_id: 1 });
        repository.findInFlightPaymentSession = async () => ({ pos_payment_session_id: 901, status: 'partially_paid' });
        const useCases = buildUseCases(repository);
        const cashier = user(1);
        await useCases.timeIn({ user: cashier, payload: { location_id: 1, idempotency_key: 'payment-time-in' } });

        const breakResult = await useCases.startBreak({
            user: cashier,
            payload: { location_id: 1, idempotency_key: 'payment-break-blocked' }
        });
        const timeOutResult = await useCases.timeOut({
            user: cashier,
            payload: { location_id: 1, idempotency_key: 'payment-timeout-blocked' }
        });

        expect(breakResult.success).toBe(false);
        expect(breakResult.error.details?.reason_code).toBe('POS_OPERATOR_PAYMENT_IN_FLIGHT');
        expect(timeOutResult.success).toBe(false);
        expect(timeOutResult.error.details?.reason_code).toBe('POS_OPERATOR_PAYMENT_IN_FLIGHT');
        expect(repository.attendance[0].status).toBe('open');
        expect(repository.breaks).toHaveLength(0);
    });
});
