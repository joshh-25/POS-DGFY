import dbStore from '../../../utils/dbStore.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError } from '../../shared/contracts/domainErrors.js';

const POS_CASHIER_ATTENDANCE_FEATURE_KEY = 'pos_cashier_attendance_lifecycle_v1';

export const POS_ATTENDANCE_ERROR_CODES = Object.freeze({
    FEATURE_DISABLED: 'POS_ATTENDANCE_FEATURE_DISABLED',
    LOCATION_REQUIRED: 'POS_ATTENDANCE_LOCATION_REQUIRED',
    LOCATION_DENIED: 'POS_ATTENDANCE_LOCATION_DENIED',
    USER_UNAVAILABLE: 'POS_ATTENDANCE_USER_UNAVAILABLE',
    EMPLOYEE_NOT_FOUND: 'POS_ATTENDANCE_EMPLOYEE_NOT_FOUND',
    ALREADY_ACTIVE: 'POS_ATTENDANCE_ALREADY_ACTIVE',
    INVALID_TRANSITION: 'POS_ATTENDANCE_INVALID_TRANSITION',
    NOT_FOUND: 'POS_ATTENDANCE_NOT_FOUND',
    IDEMPOTENCY_REQUIRED: 'POS_ATTENDANCE_IDEMPOTENCY_REQUIRED',
    CONFLICT: 'POS_ATTENDANCE_CONFLICT',
    INTERNAL: 'POS_ATTENDANCE_INTERNAL_ERROR'
});

const now = () => new Date();
const plain = (value) => value?.get ? value.get({ plain: true }) : value;
const positiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const normalizeIdempotencyKey = (value) => String(value || '').trim();
const normalizeReason = (value) => String(value || '').trim();

const attendanceError = (code, message, statusCode, details = {}, cause = undefined) => new DomainError(
    code,
    message,
    {
        statusCode,
        details: { reason_code: code, ...details },
        ...(cause ? { cause } : {})
    }
);

const parseUserPermissions = (user) => {
    if (Array.isArray(user?.permissions)) return user.permissions;
    if (typeof user?.permissions !== 'string') return [];
    try {
        const parsed = JSON.parse(user.permissions);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const assertActor = async (repository, user, transaction) => {
    const userId = positiveInt(user?.user_id);
    if (!userId) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.USER_UNAVAILABLE, 'Authenticated cashier is required.', 401);
    const storedUser = await repository.findUserById({ userId, transaction, lock: true });
    if (storedUser && (storedUser.is_active === false || storedUser.deleted_at)) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.USER_UNAVAILABLE, 'This cashier account is inactive.', 403);
    }
    return userId;
};

const ensureIdempotencyKey = (payload) => {
    const key = normalizeIdempotencyKey(payload?.idempotency_key);
    if (key.length < 8 || key.length > 120) {
        throw attendanceError(
            POS_ATTENDANCE_ERROR_CODES.IDEMPOTENCY_REQUIRED,
            'idempotency_key must be between 8 and 120 characters.',
            422
        );
    }
    return key;
};

const resolveStartLocation = async ({ payload, userId, transaction, operationLabel, resolveLocation }) => {
    const requestedLocationId = payload?.location_id == null ? null : positiveInt(payload.location_id);
    if (payload?.location_id != null && !requestedLocationId) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.LOCATION_REQUIRED, 'location_id must be a positive integer.', 422);
    }
    try {
        const location = await resolveLocation({
            requestedLocationId,
            userId,
            transaction,
            operationLabel
        });
        const locationId = positiveInt(location?.location_id);
        if (!locationId) throw new Error('location scope unresolved');
        return { locationId, location };
    } catch (error) {
        if (error?.code === POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED) throw error;
        throw attendanceError(
            POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED,
            `Access denied for ${operationLabel} location.`,
            403,
            { location_id: requestedLocationId },
            error
        );
    }
};

const resolveExistingLocation = async ({ payload, session, userId, transaction, operationLabel, resolveLocation, assertLocationAccess: checkLocationAccess }) => {
    const requestedLocationId = payload?.location_id == null ? null : positiveInt(payload.location_id);
    if (payload?.location_id != null && !requestedLocationId) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.LOCATION_REQUIRED, 'location_id must be a positive integer.', 422);
    }
    const sessionLocationId = positiveInt(session?.location_id);
    if (!sessionLocationId) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED, 'Attendance location is unavailable.', 403);
    if (requestedLocationId && requestedLocationId !== sessionLocationId) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED, 'Attendance location does not match the active session.', 403, {
            location_id: requestedLocationId,
            attendance_location_id: sessionLocationId
        });
    }
    try {
        if (requestedLocationId) {
            await resolveLocation({
                requestedLocationId,
                userId,
                transaction,
                operationLabel
            });
        } else {
            await checkLocationAccess({ userId, locationId: sessionLocationId, transaction, operationLabel });
        }
    } catch (error) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED, `Access denied for ${operationLabel} location.`, 403, {
            location_id: sessionLocationId
        }, error);
    }
    return sessionLocationId;
};

const resolveEmployee = async ({ repository, payload, user, locationId, transaction }) => {
    const requestedEmployeeId = payload?.employee_id == null ? null : positiveInt(payload.employee_id);
    const employee = requestedEmployeeId
        ? await repository.findEmployeeById({ employeeId: requestedEmployeeId, transaction, lock: true })
        : await repository.findEmployeeByEmail({ email: String(user?.email || '').trim().toLowerCase(), transaction, lock: true });
    if (requestedEmployeeId && !employee) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.EMPLOYEE_NOT_FOUND, 'The selected employee is inactive or unavailable.', 404);
    }
    const employeeLocationId = positiveInt(plain(employee)?.location_id);
    if (employeeLocationId && employeeLocationId !== locationId) {
        throw attendanceError(POS_ATTENDANCE_ERROR_CODES.LOCATION_DENIED, 'Employee is not assigned to this location.', 403, {
            location_id: locationId,
            employee_location_id: employeeLocationId
        });
    }
    return employee;
};

const audit = async ({ repository, actorUserId, actorUsername, eventType, action, row, locationId, requestId, changes, transaction }) => {
    await repository.createAuditLog({
        user_id: actorUserId,
        entity_type: 'employee_attendance_session',
        entity_id: positiveInt(row?.employee_attendance_session_id),
        action,
        event_type: eventType,
        actor_username: String(actorUsername || '').trim().slice(0, 120) || null,
        location_id: locationId,
        request_id: String(requestId || '').trim().slice(0, 100) || null,
        changes: {
            event: eventType,
            attendance_session_id: row?.employee_attendance_session_id || null,
            user_id: row?.user_id || null,
            employee_id: row?.employee_id || null,
            duty_type: row?.duty_type || null,
            location_id: locationId,
            ...changes
        }
    }, { transaction });
};

const mapError = (error, fallback = 'Cashier attendance action failed.') => {
    if (error instanceof DomainError) return error;
    if (error?.name === 'SequelizeUniqueConstraintError') {
        return attendanceError(POS_ATTENDANCE_ERROR_CODES.CONFLICT, 'Attendance state changed concurrently. Refresh and try again.', 409, {}, error);
    }
    return attendanceError(POS_ATTENDANCE_ERROR_CODES.INTERNAL, fallback, 500, {}, error);
};

const runTransaction = async (work) => {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    const transaction = await sequelize.transaction();
    try {
        const result = await work(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        throw error;
    }
};

const assertNoInFlightOperatorPayment = async ({ repository, userId, locationId, transaction }) => {
    if (typeof repository.findActiveOperator !== 'function' || typeof repository.findInFlightPaymentSession !== 'function') return;
    const operator = await repository.findActiveOperator({ userId, locationId, transaction, lock: true });
    if (!operator) return;
    const paymentSession = await repository.findInFlightPaymentSession({
        shiftId: operator.pos_terminal_shift_id,
        transaction,
        lock: true
    });
    if (paymentSession) {
        throw attendanceError(
            POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION,
            'Complete or cancel the in-flight payment before starting a break or timing out.',
            409,
            {
                reason_code: 'POS_OPERATOR_PAYMENT_IN_FLIGHT',
                payment_session_id: paymentSession.pos_payment_session_id
            }
        );
    }
};

const buildStartAttendance = (dependencies = {}) => {
    const { repository, dutyType: configuredDutyType, resolveLocation, resolveFeature, runTransaction: executeTransaction = runTransaction } = dependencies;
    return async ({ payload = {}, user = {}, dutyType: requestedDutyType, requestId } = {}) => {
    const dutyType = requestedDutyType || configuredDutyType;
    try {
        const key = ensureIdempotencyKey(payload);
        return await executeTransaction(async (transaction) => {
            const userId = await assertActor(repository, user, transaction);
            const { locationId } = await resolveStartLocation({
                payload,
                userId,
                transaction,
                operationLabel: dutyType === 'relief' ? 'relief duty' : 'attendance',
                resolveLocation
            });
            await resolveFeature({ locationId });
            const replay = await repository.findAttendanceByIdempotency({
                userId,
                action: 'start_attendance',
                key,
                transaction,
                lock: true
            });
            if (replay) return ok({ attendance_session: replay, active_break: null, idempotent_replay: true });
            const active = await repository.findOpenAttendanceByUser({ userId, transaction, lock: true });
            if (active) {
                throw attendanceError(POS_ATTENDANCE_ERROR_CODES.ALREADY_ACTIVE, 'This cashier already has an active attendance session.', 409, {
                    active_session_id: active.employee_attendance_session_id,
                    active_duty_type: active.duty_type
                });
            }
            const employee = await resolveEmployee({ repository, payload, user, locationId, transaction });
            const attendance = await repository.createAttendanceSession({
                employee_id: positiveInt(plain(employee)?.employee_id),
                user_id: userId,
                location_id: locationId,
                duty_type: dutyType,
                status: 'open',
                started_at: now(),
                ended_at: null,
                closed_by: null,
                start_idempotency_key: key,
                end_idempotency_key: null
            }, { transaction });
            await audit({
                repository,
                actorUserId: userId,
                actorUsername: user?.username || user?.email,
                eventType: dutyType === 'relief' ? 'pos_attendance_relief_started' : 'pos_attendance_started',
                action: 'CREATE',
                row: attendance,
                locationId,
                requestId,
                changes: { idempotency_key: key, actor_type: 'self' },
                transaction
            });
            return ok({ attendance_session: attendance, active_break: null, idempotent_replay: false });
        });
    } catch (error) {
        return fail(mapError(error, dutyType === 'relief' ? 'Failed to start relief duty.' : 'Failed to time in.'));
    }
    };
};

const buildEndAttendance = (dependencies = {}) => {
    const { repository, resolveLocation, resolveFeature, expectedDutyType = null, runTransaction: executeTransaction = runTransaction, assertLocationAccess: checkLocationAccess, revokeOperatorSessionsForUser } = dependencies;
    return async ({ payload = {}, user = {}, requestId } = {}) => {
    try {
        const key = ensureIdempotencyKey(payload);
        return await executeTransaction(async (transaction) => {
            const userId = await assertActor(repository, user, transaction);
            const active = await repository.findOpenAttendanceByUser({ userId, transaction, lock: true });
            if (!active) {
                const replay = await repository.findAttendanceByIdempotency({
                    userId,
                    action: 'end_attendance',
                    key,
                    transaction,
                    lock: true
                });
                if (replay) {
                    const replayLocationId = await resolveExistingLocation({
                        payload,
                        session: replay,
                        userId,
                        transaction,
                        operationLabel: 'attendance',
                        resolveLocation,
                        assertLocationAccess: checkLocationAccess
                    });
                    await resolveFeature({ locationId: replayLocationId });
                    return ok({ attendance_session: replay, active_break: null, idempotent_replay: true });
                }
                throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'No active attendance session is available for this action.', 409);
            }
            const locationId = await resolveExistingLocation({
                payload,
                session: active,
                userId,
                transaction,
                operationLabel: 'attendance',
                resolveLocation,
                assertLocationAccess: checkLocationAccess
            });
            await resolveFeature({ locationId });
            const replay = await repository.findAttendanceByIdempotency({
                userId,
                action: 'end_attendance',
                key,
                transaction,
                lock: true
            });
            if (replay) return ok({ attendance_session: replay, active_break: null, idempotent_replay: true });
            if (expectedDutyType && active.duty_type !== expectedDutyType) {
                throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, `Active duty is ${active.duty_type}; this action requires ${expectedDutyType} duty.`, 409);
            }
            const activeBreak = await repository.findOpenBreak({
                attendanceSessionId: active.employee_attendance_session_id,
                transaction,
                lock: true
            });
            if (activeBreak) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'End the active break before ending attendance.', 409, {
                active_break_id: activeBreak.employee_break_segment_id
            });
            await assertNoInFlightOperatorPayment({ repository, userId, locationId, transaction });
            const endedAt = now();
            const attendance = await repository.updateAttendanceSession({
                attendanceSessionId: active.employee_attendance_session_id,
                payload: { status: 'closed', ended_at: endedAt, closed_by: userId, end_idempotency_key: key },
                transaction
            });
            if (typeof revokeOperatorSessionsForUser === 'function') {
                await revokeOperatorSessionsForUser({ userId, reason: 'attendance_timeout', transaction, at: endedAt });
            }
            await audit({
                repository,
                actorUserId: userId,
                actorUsername: user?.username || user?.email,
                eventType: expectedDutyType === 'relief' ? 'pos_attendance_relief_ended' : 'pos_attendance_ended',
                action: 'UPDATE',
                row: attendance,
                locationId,
                requestId,
                changes: { idempotency_key: key, actor_type: 'self', ended_at: endedAt.toISOString() },
                transaction
            });
            return ok({ attendance_session: attendance, active_break: null, idempotent_replay: false });
        });
    } catch (error) {
        return fail(mapError(error, expectedDutyType === 'relief' ? 'Failed to end relief duty.' : 'Failed to time out.'));
    }
    };
};

const buildStartBreak = (dependencies = {}) => {
    const { repository, resolveLocation, resolveFeature, runTransaction: executeTransaction = runTransaction, assertLocationAccess: checkLocationAccess, revokeOperatorSessionsForUser } = dependencies;
    return async ({ payload = {}, user = {}, requestId } = {}) => {
    try {
        const key = ensureIdempotencyKey(payload);
        return await executeTransaction(async (transaction) => {
            const userId = await assertActor(repository, user, transaction);
            // Check the rollout before requiring an attendance row. Otherwise
            // a legacy location with no attendance session returns the
            // misleading "Time in before starting a break" error and the POS
            // cannot fall back to its normal terminal-lock behavior.
            if (payload?.location_id != null) {
                const { locationId: requestedLocationId } = await resolveStartLocation({
                    payload,
                    userId,
                    transaction,
                    operationLabel: 'break',
                    resolveLocation
                });
                await resolveFeature({ locationId: requestedLocationId });
            }
            const active = await repository.findOpenAttendanceByUser({ userId, transaction, lock: true });
            if (!active) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'Time in before starting a break.', 409);
            const locationId = await resolveExistingLocation({ payload, session: active, userId, transaction, operationLabel: 'break', resolveLocation, assertLocationAccess: checkLocationAccess });
            await resolveFeature({ locationId });
            const replay = await repository.findBreakByIdempotency({
                attendanceSessionId: active.employee_attendance_session_id,
                action: 'start_break',
                key,
                transaction,
                lock: true
            });
            if (replay) return ok({ attendance_session: active, break_segment: replay, idempotent_replay: true });
            const openBreak = await repository.findOpenBreak({
                attendanceSessionId: active.employee_attendance_session_id,
                transaction,
                lock: true
            });
            if (openBreak) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.ALREADY_ACTIVE, 'This attendance session already has an active break.', 409, {
                active_break_id: openBreak.employee_break_segment_id
            });
            await assertNoInFlightOperatorPayment({ repository, userId, locationId, transaction });
            const startedAt = now();
            const breakSegment = await repository.createBreakSegment({
                employee_attendance_session_id: active.employee_attendance_session_id,
                status: 'open',
                started_at: startedAt,
                ended_at: null,
                ended_by: null,
                start_idempotency_key: key,
                end_idempotency_key: null
            }, { transaction });
            if (typeof revokeOperatorSessionsForUser === 'function') {
                await revokeOperatorSessionsForUser({ userId, reason: 'attendance_break', transaction, at: startedAt });
            }
            await audit({
                repository,
                actorUserId: userId,
                actorUsername: user?.username || user?.email,
                eventType: 'pos_attendance_break_started',
                action: 'CREATE',
                row: active,
                locationId,
                requestId,
                changes: { break_segment_id: breakSegment?.employee_break_segment_id, idempotency_key: key, actor_type: 'self' },
                transaction
            });
            return ok({ attendance_session: active, break_segment: breakSegment, idempotent_replay: false });
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to start break.'));
    }
    };
};

const buildEndBreak = (dependencies = {}) => {
    const { repository, resolveLocation, resolveFeature, runTransaction: executeTransaction = runTransaction, assertLocationAccess: checkLocationAccess } = dependencies;
    return async ({ payload = {}, user = {}, requestId } = {}) => {
    try {
        const key = ensureIdempotencyKey(payload);
        return await executeTransaction(async (transaction) => {
            const userId = await assertActor(repository, user, transaction);
            const active = await repository.findOpenAttendanceByUser({ userId, transaction, lock: true });
            if (!active) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'No active attendance session is available for ending a break.', 409);
            const locationId = await resolveExistingLocation({ payload, session: active, userId, transaction, operationLabel: 'break', resolveLocation, assertLocationAccess: checkLocationAccess });
            await resolveFeature({ locationId });
            const activeBreak = await repository.findOpenBreak({
                attendanceSessionId: active.employee_attendance_session_id,
                transaction,
                lock: true
            });
            const replay = await repository.findBreakByIdempotency({
                attendanceSessionId: active.employee_attendance_session_id,
                action: 'end_break',
                key,
                transaction,
                lock: true
            });
            if (replay) return ok({ attendance_session: active, break_segment: replay, idempotent_replay: true });
            if (!activeBreak) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'No active break is available to end.', 409);
            const endedAt = now();
            const breakSegment = await repository.updateBreakSegment({
                breakSegmentId: activeBreak.employee_break_segment_id,
                payload: { status: 'closed', ended_at: endedAt, ended_by: userId, end_idempotency_key: key },
                transaction
            });
            await audit({
                repository,
                actorUserId: userId,
                actorUsername: user?.username || user?.email,
                eventType: 'pos_attendance_break_ended',
                action: 'UPDATE',
                row: active,
                locationId,
                requestId,
                changes: { break_segment_id: breakSegment?.employee_break_segment_id, idempotency_key: key, actor_type: 'self', ended_at: endedAt.toISOString() },
                transaction
            });
            return ok({ attendance_session: active, break_segment: breakSegment, idempotent_replay: false });
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to end break.'));
    }
    };
};

const buildGetCurrentAttendance = ({ repository, resolveLocation, resolveReadFeature } = {}) => async ({ query = {}, user = {} } = {}) => {
    try {
        const userId = positiveInt(user?.user_id);
        if (!userId) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.USER_UNAVAILABLE, 'Authenticated cashier is required.', 401);
        const location = await resolveStartLocation({
            payload: query,
            userId,
            transaction: null,
            operationLabel: 'attendance',
            resolveLocation
        });
        const feature = await resolveReadFeature({ locationId: location.locationId });
        if (!feature.enabled) {
            return ok({
                feature: { ...feature, key: POS_CASHIER_ATTENDANCE_FEATURE_KEY },
                attendance_session: null,
                active_break: null,
                recent_sessions: []
            });
        }
        const attendance = await repository.findOpenAttendanceByUser({ userId, locationId: location.locationId });
        const activeBreak = attendance
            ? await repository.findOpenBreak({ attendanceSessionId: attendance.employee_attendance_session_id })
            : null;
        const recentSessions = await repository.listAttendanceByUser({ userId, locationId: location.locationId });
        return ok({
            feature,
            attendance_session: attendance,
            active_break: activeBreak,
            recent_sessions: recentSessions
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to load cashier attendance.'));
    }
};

const buildCorrectAttendance = (dependencies = {}) => {
    const { repository, resolveLocation, resolveFeature, runTransaction: executeTransaction = runTransaction, assertLocationAccess: checkLocationAccess } = dependencies;
    return async ({ payload = {}, user = {}, requestId } = {}) => {
    try {
        const key = ensureIdempotencyKey(payload);
        const reason = normalizeReason(payload.reason);
        if (reason.length < 8) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'A correction reason of at least 8 characters is required.', 422);
        const permissions = parseUserPermissions(user);
        const canManage = user?.is_master_admin === true
            || ['admin', 'manager'].includes(String(user?.role || '').trim().toLowerCase())
            || permissions.includes('pos:attendance:manage');
        if (!canManage) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.USER_UNAVAILABLE, 'Manager permission is required for attendance corrections.', 403);
        return await executeTransaction(async (transaction) => {
            const actorUserId = await assertActor(repository, user, transaction);
            const sessionId = positiveInt(payload.attendance_session_id);
            if (!sessionId) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.NOT_FOUND, 'attendance_session_id is required.', 422);
            const session = await repository.findAttendanceById({ attendanceSessionId: sessionId, transaction, lock: true });
            if (!session) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.NOT_FOUND, 'Attendance session was not found.', 404);
            const locationId = await resolveExistingLocation({ payload, session, userId: actorUserId, transaction, operationLabel: 'attendance correction', resolveLocation, assertLocationAccess: checkLocationAccess });
            await resolveFeature({ locationId });
            const correctionAction = String(payload.correction_action || '').trim();
            if (correctionAction === 'end_break') {
                const replay = await repository.findBreakByIdempotency({ attendanceSessionId: sessionId, action: 'end_break', key, transaction, lock: true });
                if (replay) return ok({ attendance_session: session, break_segment: replay, idempotent_replay: true });
                const activeBreak = await repository.findOpenBreak({ attendanceSessionId: sessionId, transaction, lock: true });
                if (!activeBreak) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'No active break is available to correct.', 409);
                const endedAt = now();
                const breakSegment = await repository.updateBreakSegment({
                    breakSegmentId: activeBreak.employee_break_segment_id,
                    payload: { status: 'closed', ended_at: endedAt, ended_by: actorUserId, end_idempotency_key: key },
                    transaction
                });
                await audit({ repository, actorUserId, actorUsername: user?.username || user?.email, eventType: 'pos_attendance_manager_correction', action: 'UPDATE', row: session, locationId, requestId, changes: { correction_action: correctionAction, correction_reason: reason, break_segment_id: breakSegment?.employee_break_segment_id, idempotency_key: key }, transaction });
                return ok({ attendance_session: session, break_segment: breakSegment, idempotent_replay: false });
            }
            if (correctionAction !== 'end_attendance') throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'correction_action must be end_break or end_attendance.', 422);
            const replay = await repository.findAttendanceByIdempotency({ userId: session.user_id, action: 'end_attendance', key, transaction, lock: true });
            if (replay) return ok({ attendance_session: replay, active_break: null, idempotent_replay: true });
            if (session.status !== 'open') throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'Attendance session is already closed.', 409);
            const activeBreak = await repository.findOpenBreak({ attendanceSessionId: sessionId, transaction, lock: true });
            if (activeBreak) throw attendanceError(POS_ATTENDANCE_ERROR_CODES.INVALID_TRANSITION, 'End the active break before correcting attendance.', 409);
            const endedAt = now();
            const attendance = await repository.updateAttendanceSession({
                attendanceSessionId: sessionId,
                payload: { status: 'closed', ended_at: endedAt, closed_by: actorUserId, end_idempotency_key: key },
                transaction
            });
            await audit({ repository, actorUserId, actorUsername: user?.username || user?.email, eventType: 'pos_attendance_manager_correction', action: 'UPDATE', row: attendance, locationId, requestId, changes: { correction_action: correctionAction, correction_reason: reason, idempotency_key: key, corrected_by: actorUserId }, transaction });
            return ok({ attendance_session: attendance, active_break: null, idempotent_replay: false });
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to correct cashier attendance.'));
    }
    };
};

export const createPosCashierAttendanceUseCases = (dependencies = {}) => ({
    getCurrentAttendance: buildGetCurrentAttendance(dependencies),
    timeIn: buildStartAttendance({ ...dependencies, dutyType: 'regular' }),
    timeOut: buildEndAttendance({ ...dependencies, expectedDutyType: 'regular' }),
    startReliefDuty: buildStartAttendance({ ...dependencies, dutyType: 'relief' }),
    endReliefDuty: buildEndAttendance({ ...dependencies, expectedDutyType: 'relief' }),
    startBreak: buildStartBreak(dependencies),
    endBreak: buildEndBreak(dependencies),
    correctAttendance: buildCorrectAttendance(dependencies)
});

export {
    buildGetCurrentAttendance,
    buildStartAttendance,
    buildEndAttendance,
    buildStartBreak,
    buildEndBreak,
    buildCorrectAttendance
};
