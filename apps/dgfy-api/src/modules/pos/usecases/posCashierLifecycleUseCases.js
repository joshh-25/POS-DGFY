import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const positiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const plain = (value) => value?.get ? value.get({ plain: true }) : value;
const now = () => new Date();
const normalizeKey = (value, fallback) => String(value || fallback).trim().slice(0, 120);
const permissionsOf = (user) => {
    if (Array.isArray(user?.permissions)) return user.permissions;
    if (typeof user?.permissions !== 'string') return [];
    try {
        const parsed = JSON.parse(user.permissions);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const lifecycleError = (message, statusCode = 409, details = {}) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode, details: { reason_code: 'POS_CASHIER_LIFECYCLE_FAILED', ...details } }
);

const ok = (data) => ({ success: true, data });
const fail = (error) => ({
    success: false,
    data: null,
    error: error instanceof DomainError
        ? error
        : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Cashier resume failed.', { statusCode: 500 })
});

const assertLifecyclePermission = (user) => {
    if (user?.is_master_admin === true) return;
    const permissions = new Set(permissionsOf(user));
    if (!permissions.has('pos:attendance:view') || !permissions.has('pos:attendance:operate')) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Cashier attendance permissions are missing. Sign out and sign in again after the permission update.',
            { statusCode: 403, details: { reason_code: 'POS_ATTENDANCE_PERMISSION_REQUIRED' } }
        );
    }
};

const audit = async ({ repository, user, row, eventType, action, shift, requestId, changes, transaction }) => {
    if (typeof repository.createAuditLog !== 'function') return;
    await repository.createAuditLog({
        user_id: positiveInt(user?.user_id),
        actor_username: user?.username || user?.email || null,
        entity_type: 'pos_cashier_lifecycle',
        entity_id: positiveInt(row?.employee_attendance_session_id || row?.pos_terminal_operator_session_id || shift?.pos_terminal_shift_id),
        action,
        event_type: eventType,
        terminal_id: shift?.terminal_id || null,
        shift_id: positiveInt(shift?.pos_terminal_shift_id),
        location_id: positiveInt(shift?.location_id),
        request_id: requestId || null,
        changes
    }, { transaction });
};

const createOperatorAuthority = async ({ repository, authorityService, tenantId, shift, user, attendance, key, requestId, transaction }) => {
    const userId = positiveInt(user?.user_id);
    const shiftId = positiveInt(shift?.pos_terminal_shift_id);
    const startedAt = now();
    const expiresAt = new Date(startedAt.getTime() + (typeof authorityService.maxAgeMs === 'function'
        ? authorityService.maxAgeMs()
        : Number(authorityService.maxAgeMs || 12 * 60 * 60 * 1000)));
    const session = await repository.createOperatorSession({
        pos_terminal_shift_id: shiftId,
        terminal_id: String(shift.terminal_id || '').trim().toUpperCase(),
        location_id: positiveInt(shift.location_id),
        user_id: userId,
        employee_attendance_session_id: attendance.employee_attendance_session_id,
        status: 'active',
        started_at: startedAt,
        ended_at: null,
        ended_reason: null,
        authority_token_hash: null,
        authority_expires_at: expiresAt,
        revoked_at: null,
        revoked_reason: null,
        idempotency_key: key
    }, { transaction });
    const authorityToken = authorityService.issue({
        tenantId,
        locationId: shift.location_id,
        terminalId: shift.terminal_id,
        shiftId,
        userId,
        operatorSessionId: session.pos_terminal_operator_session_id,
        expiresAt
    });
    const updated = await repository.updateOperatorSession({
        operatorSessionId: session.pos_terminal_operator_session_id,
        payload: { authority_token_hash: authorityService.hashAuthorityToken(authorityToken) },
        transaction
    });
    await audit({
        repository,
        user,
        row: updated,
        eventType: 'pos_cashier_shift_operator_started',
        action: 'CREATE',
        shift,
        requestId,
        changes: { attendance_session_id: attendance.employee_attendance_session_id, idempotency_key: key },
        transaction
    });
    return { operatorSession: updated, authorityToken };
};

const refreshOperatorAuthority = async ({ repository, authorityService, tenantId, shift, user, session, transaction }) => {
    const sessionId = positiveInt(session?.pos_terminal_operator_session_id);
    const userId = positiveInt(user?.user_id);
    if (!sessionId || !userId) {
        throw lifecycleError('The active cashier operator session is unavailable.', 409, {
            reason_code: 'POS_OPERATOR_SESSION_REQUIRED'
        });
    }
    const expiresAt = new Date(now().getTime() + (typeof authorityService.maxAgeMs === 'function'
        ? authorityService.maxAgeMs()
        : Number(authorityService.maxAgeMs || 12 * 60 * 60 * 1000)));
    const authorityToken = authorityService.issue({
        tenantId,
        locationId: shift.location_id,
        terminalId: shift.terminal_id,
        shiftId: shift.pos_terminal_shift_id,
        userId,
        operatorSessionId: sessionId,
        expiresAt
    });
    const operatorSession = await repository.updateOperatorSession({
        operatorSessionId: sessionId,
        payload: {
            authority_token_hash: authorityService.hashAuthorityToken(authorityToken),
            authority_expires_at: expiresAt,
            status: 'active',
            revoked_at: null,
            revoked_reason: null
        },
        transaction
    });
    return { operatorSession, authorityToken };
};

const resolveEmployeeId = async ({ repository, user, transaction }) => {
    if (typeof repository.findEmployeeByEmail !== 'function') return null;
    const employee = await repository.findEmployeeByEmail({
        email: String(user?.email || '').trim().toLowerCase(),
        transaction,
        lock: true
    });
    return positiveInt(plain(employee)?.employee_id);
};

export const createPosCashierLifecycleUseCases = ({
    repository,
    resolveFeature,
    authorityService
} = {}) => {
    const ensureAttendanceForTakeover = async ({ shift, user, payload = {}, requestId, transaction } = {}) => {
        const locationId = positiveInt(shift?.location_id);
        if (!locationId) throw lifecycleError('A location is required before a cashier can take over this register.', 422);
        const feature = await resolveFeature({ locationId });
        if (!feature?.enabled) return { feature, attendance: null, created: false };
        assertLifecyclePermission(user);

        const userId = positiveInt(user?.user_id);
        if (!userId) throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated cashier is required.', { statusCode: 401 });
        const existingAttendance = await repository.findOpenAttendanceByUser({ userId, transaction, lock: true });
        if (existingAttendance) {
            if (Number(existingAttendance.location_id) !== locationId) {
                throw lifecycleError('This cashier is already attending at another location.', 409, {
                    reason_code: 'POS_OPERATOR_ATTENDANCE_LOCATION_MISMATCH',
                    attendance_location_id: Number(existingAttendance.location_id) || null
                });
            }
            return { feature, attendance: existingAttendance, created: false };
        }

        const startedAt = now();
        const attendance = await repository.createAttendanceSession({
            employee_id: await resolveEmployeeId({ repository, user, transaction }),
            user_id: userId,
            location_id: locationId,
            duty_type: 'regular',
            status: 'open',
            started_at: startedAt,
            ended_at: null,
            closed_by: null,
            start_idempotency_key: normalizeKey(payload.idempotency_key, `takeover-attendance-${shift.pos_terminal_shift_id}-${userId}`),
            end_idempotency_key: null
        }, { transaction });
        await audit({
            repository,
            user,
            row: attendance,
            eventType: 'pos_attendance_started_with_takeover',
            action: 'CREATE',
            shift,
            requestId,
            changes: { duty_type: 'regular', automatic: true, trigger: 'register_takeover' },
            transaction
        });
        return { feature, attendance, created: true };
    };

    const onShiftOpened = async ({ shift, user, payload = {}, requestId, transaction, tenantId } = {}) => {
        const locationId = positiveInt(shift?.location_id);
        if (!locationId) throw lifecycleError('A location is required before opening a cashier shift.', 422);
        const feature = await resolveFeature({ locationId });
        if (!feature?.enabled) return { feature, attendance: null, authority_token: null };
        assertLifecyclePermission(user);

        const userId = positiveInt(user?.user_id);
        if (!userId) throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated cashier is required.', { statusCode: 401 });
        const existingAttendance = await repository.findOpenAttendanceByUser({ userId, locationId, transaction, lock: true });
        const attendance = existingAttendance || await repository.createAttendanceSession({
            employee_id: await resolveEmployeeId({ repository, user, transaction }),
            user_id: userId,
            location_id: locationId,
            duty_type: 'regular',
            status: 'open',
            started_at: now(),
            ended_at: null,
            closed_by: null,
            start_idempotency_key: normalizeKey(payload.idempotency_key, `shift-open-${shift.pos_terminal_shift_id}`),
            end_idempotency_key: null
        }, { transaction });
        if (!existingAttendance) {
            await audit({
                repository,
                user,
                row: attendance,
                eventType: 'pos_attendance_started_with_shift',
                action: 'CREATE',
                shift,
                requestId,
                changes: { duty_type: 'regular', automatic: true },
                transaction
            });
        }

        const currentOperator = await repository.findActiveOperator({
            terminalId: shift.terminal_id,
            locationId,
            shiftId: shift.pos_terminal_shift_id,
            transaction,
            lock: true
        });
        if (currentOperator && Number(currentOperator.user_id) !== userId) {
            throw lifecycleError('This register is already controlled by another cashier.', 409, {
                reason_code: 'POS_OPERATOR_ALREADY_ACTIVE'
            });
        }
        if (currentOperator) {
            const refreshed = await refreshOperatorAuthority({
                repository,
                authorityService,
                tenantId,
                shift,
                user,
                session: currentOperator,
                transaction
            });
            return { feature, attendance, operator_session: refreshed.operatorSession, authority_token: refreshed.authorityToken, reused_existing: true };
        }

        const operator = await createOperatorAuthority({
            repository,
            authorityService,
            tenantId,
            shift,
            user,
            attendance,
            key: normalizeKey(`${payload.idempotency_key || ''}-operator`, `shift-operator-${shift.pos_terminal_shift_id}`),
            requestId,
            transaction
        });
        return { feature, attendance, operator_session: operator.operatorSession, authority_token: operator.authorityToken };
    };

    const resume = async ({ terminalId, locationId, shiftId, user, tenantId, requestId } = {}) => {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const resolvedLocationId = positiveInt(locationId);
            const resolvedShiftId = positiveInt(shiftId);
            if (!resolvedLocationId || !resolvedShiftId || !String(terminalId || '').trim()) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Terminal, location, and shift are required to resume.', { statusCode: 422 });
            }
            const feature = await resolveFeature({ locationId: resolvedLocationId });
            if (!feature?.enabled) {
                await transaction.commit();
                return ok({ feature, resumed: false, authority_token: null });
            }
            assertLifecyclePermission(user);
            const userId = positiveInt(user?.user_id);
            const shift = await repository.findOpenTerminalShift({ terminalId, locationId: resolvedLocationId, shiftId: resolvedShiftId, transaction, lock: true });
            if (!shift) throw lifecycleError('The register shift is no longer open.', 409, { reason_code: 'POS_OPERATOR_SHIFT_NOT_OPEN' });
            const attendance = await repository.findOpenAttendanceByUser({ userId, locationId: resolvedLocationId, transaction, lock: true });
            if (!attendance) throw lifecycleError('This cashier has no active attendance session to resume.', 409, { reason_code: 'POS_OPERATOR_ATTENDANCE_REQUIRED' });
            const activeBreak = await repository.findOpenBreak({ attendanceSessionId: attendance.employee_attendance_session_id, transaction, lock: true });
            if (!activeBreak) {
                const current = await repository.findActiveOperator({ terminalId, locationId: resolvedLocationId, shiftId: resolvedShiftId, transaction, lock: true });
                if (current && Number(current.user_id) === userId) {
                    const refreshed = await refreshOperatorAuthority({
                        repository,
                        authorityService,
                        tenantId,
                        shift,
                        user,
                        session: current,
                        transaction
                    });
                    await transaction.commit();
                    return ok({ feature, resumed: true, attendance, operator_session: refreshed.operatorSession, authority_token: refreshed.authorityToken, idempotent_resume: true });
                }
                if (!current && Number(shift.cashier_id) === userId) {
                    const restored = await createOperatorAuthority({
                        repository,
                        authorityService,
                        tenantId,
                        shift,
                        user,
                        attendance,
                        key: normalizeKey(requestId, `resume-operator-${resolvedShiftId}-${userId}`),
                        requestId,
                        transaction
                    });
                    await transaction.commit();
                    return ok({
                        feature,
                        resumed: true,
                        attendance,
                        operator_session: restored.operatorSession,
                        authority_token: restored.authorityToken,
                        recovered_missing_operator: true
                    });
                }
                if (current) {
                    throw lifecycleError('Another cashier currently controls this register.', 409, { reason_code: 'POS_OPERATOR_ALREADY_ACTIVE' });
                }
                throw lifecycleError('This cashier is not currently on break.', 409, { reason_code: 'POS_OPERATOR_NOT_ON_BREAK' });
            }
            const current = await repository.findActiveOperator({ terminalId, locationId: resolvedLocationId, shiftId: resolvedShiftId, transaction, lock: true });
            if (current && Number(current.user_id) !== userId) {
                throw lifecycleError('Another cashier currently controls this register.', 409, { reason_code: 'POS_OPERATOR_ALREADY_ACTIVE' });
            }
            const resumedAt = now();
            const closedBreak = await repository.updateBreakSegment({
                breakSegmentId: activeBreak.employee_break_segment_id,
                payload: { status: 'closed', ended_at: resumedAt, ended_by: userId, end_idempotency_key: normalizeKey(requestId, `resume-${activeBreak.employee_break_segment_id}`) },
                transaction
            });
            await audit({ repository, user, row: attendance, eventType: 'pos_attendance_break_ended_with_resume', action: 'UPDATE', shift, requestId, changes: { break_segment_id: closedBreak?.employee_break_segment_id, automatic: true }, transaction });
            const operator = current
                ? await refreshOperatorAuthority({
                    repository,
                    authorityService,
                    tenantId,
                    shift,
                    user,
                    session: current,
                    transaction
                })
                : await createOperatorAuthority({
                    repository,
                    authorityService,
                    tenantId,
                    shift,
                    user,
                    attendance,
                    key: normalizeKey(requestId, `resume-operator-${resolvedShiftId}`),
                    requestId,
                    transaction
                });
            await transaction.commit();
            return ok({ feature, resumed: true, attendance, break_segment: closedBreak, operator_session: operator.operatorSession, authority_token: operator.authorityToken });
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            return fail(error);
        }
    };

    const onShiftClosing = async ({ shift, user, requestId, transaction } = {}) => {
        const locationId = positiveInt(shift?.location_id);
        const feature = await resolveFeature({ locationId });
        if (!feature?.enabled) return { feature, attendance: null };
        assertLifecyclePermission(user);
        const userId = positiveInt(shift?.cashier_id || user?.user_id);
        const attendance = await repository.findOpenAttendanceByUser({ userId, locationId, transaction, lock: true });
        if (!attendance) return { feature, attendance: null };
        const activeBreak = await repository.findOpenBreak({ attendanceSessionId: attendance.employee_attendance_session_id, transaction, lock: true });
        const endedAt = now();
        if (activeBreak) {
            await repository.updateBreakSegment({
                breakSegmentId: activeBreak.employee_break_segment_id,
                payload: { status: 'closed', ended_at: endedAt, ended_by: userId, end_idempotency_key: normalizeKey(requestId, `close-break-${attendance.employee_attendance_session_id}`) },
                transaction
            });
        }
        const closed = await repository.updateAttendanceSession({
            attendanceSessionId: attendance.employee_attendance_session_id,
            payload: { status: 'closed', ended_at: endedAt, closed_by: userId, end_idempotency_key: normalizeKey(requestId, `shift-close-${shift.pos_terminal_shift_id}`) },
            transaction
        });
        await repository.revokeOperatorSessionsForTerminal({ terminalId: shift.terminal_id, reason: 'register_closed', transaction, at: endedAt });
        await audit({ repository, user, row: closed, eventType: 'pos_attendance_ended_with_shift', action: 'UPDATE', shift, requestId, changes: { automatic: true, break_closed: Boolean(activeBreak) }, transaction });
        return { feature, attendance: closed };
    };

    return { onShiftOpened, resume, onShiftClosing, ensureAttendanceForTakeover };
};
