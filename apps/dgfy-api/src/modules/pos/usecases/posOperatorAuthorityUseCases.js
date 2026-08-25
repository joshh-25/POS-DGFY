import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const PIN_PATTERN = /^[0-9]{4,12}$/;
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const DUMMY_PIN_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.V6VY6fM2sXQdD2H8Y8PjF4H7xZx5J4C';
const GENERIC_PIN_MESSAGE = 'Cashier authentication failed.';
const POS_OPERATOR_FEATURE_DISABLED = 'POS_OPERATOR_FEATURE_DISABLED';
const POS_CASHIER_ATTENDANCE_FEATURE_KEY = 'pos_cashier_attendance_lifecycle_v1';
const PROTECTED_OPERATION_STALE_MS = 5 * 60 * 1000;

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeTerminal = (value) => String(value || '').trim().toUpperCase();
const normalizeTenant = (value) => String(value || '').trim();
const normalizePin = (value) => String(value || '').trim();
const nowDate = () => new Date();
const transitionIdempotencyKey = ({ reason, targetUserId, key }) => crypto
    .createHash('sha256')
    .update(`${String(reason || '').trim()}:${Number(targetUserId)}:${String(key || '').trim()}`)
    .digest('hex');
const hasFreshProtectedOperation = (session, at = nowDate()) => {
    if (!session?.protected_operation_key || !session?.protected_operation_started_at) return false;
    const startedAt = new Date(session.protected_operation_started_at).getTime();
    return Number.isFinite(startedAt) && startedAt >= at.getTime() - PROTECTED_OPERATION_STALE_MS;
};

const verifyAuthorityOrThrow = (authorityService, token) => {
    try {
        return authorityService.verify(token);
    } catch {
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority has expired or been revoked.', 403);
    }
};

const assertCurrentAuthority = async ({ repository, authorityService, authorityToken, tenantId, scope, current, transaction }) => {
    if (!authorityToken || !current) {
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'The outgoing cashier must authenticate this custody handoff.', 403, {
            reason_code: 'POS_OUTGOING_OPERATOR_AUTHORITY_REQUIRED'
        });
    }
    const claims = verifyAuthorityOrThrow(authorityService, authorityToken);
    const bound = await repository.findOperatorByAuthorityTokenHash({
        authorityTokenHash: authorityService.hashAuthorityToken(authorityToken),
        transaction,
        lock: true
    });
    if (!bound
        || Number(bound.pos_terminal_operator_session_id) !== Number(current.pos_terminal_operator_session_id)
        || Number(claims.operator_session_id) !== Number(current.pos_terminal_operator_session_id)
        || Number(claims.user_id) !== Number(current.user_id)
        || normalizeTenant(claims.tenant_id) !== normalizeTenant(tenantId)
        || normalizeTerminal(claims.terminal_id) !== scope.terminalId
        || Number(claims.location_id) !== scope.locationId
        || Number(claims.shift_id) !== scope.shiftId) {
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'The outgoing cashier authority does not match this register.', 403, {
            reason_code: 'POS_OUTGOING_OPERATOR_SCOPE_MISMATCH'
        });
    }
};

const operatorError = (code, message, statusCode = 409, details = null) => new DomainError(code, message, {
    statusCode,
    details
});

const fail = (error) => ({
    success: false,
    data: null,
    error: error instanceof DomainError
        ? error
        : operatorError(DomainErrorCode.INTERNAL_ERROR, 'POS operator action failed.', 500)
});

const ok = (data) => ({ success: true, data });

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

const actorId = (user) => parsePositiveInt(user?.user_id);
const operatorUserSummary = (user) => user ? {
    user_id: parsePositiveInt(user.user_id),
    username: String(user.username || '').trim() || null,
    email: String(user.email || '').trim().toLowerCase() || null,
    role: String(user.role || '').trim().toLowerCase() || null
} : null;
const isManager = (user) => {
    const role = String(user?.role || '').trim().toLowerCase();
    const permissions = Array.isArray(user?.permissions)
        ? user.permissions
        : (typeof user?.permissions === 'string' ? (() => {
            try {
                const parsed = JSON.parse(user.permissions);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        })() : []);
    return user?.is_master_admin === true
        || ['admin', 'manager'].includes(role)
        || permissions.includes('pos:attendance:manage')
        || permissions.includes('users:manage');
};

const audit = async ({ repository, actorUserId, actorUsername, eventType, action = 'UPDATE', row = null, locationId = null, terminalId = null, shiftId = null, requestId = null, changes = {}, transaction }) => {
    await repository.createAuditLog({
        user_id: actorUserId,
        actor_username: actorUsername || null,
        entity_type: 'pos_operator_authority',
        entity_id: row?.pos_terminal_operator_session_id || row?.pos_drawer_handoff_event_id || row?.user_id || null,
        action,
        event_type: eventType,
        terminal_id: terminalId || null,
        shift_id: shiftId || null,
        location_id: locationId || null,
        request_id: requestId || null,
        changes
    }, { transaction });
};

const requireFeature = async ({ resolveFeature, locationId }) => {
    const feature = await resolveFeature({ locationId });
    if (!feature?.enabled) {
        throw operatorError(POS_OPERATOR_FEATURE_DISABLED, 'POS cashier operator controls are not enabled for this location.', 404, {
            reason_code: POS_OPERATOR_FEATURE_DISABLED,
            feature_key: POS_CASHIER_ATTENDANCE_FEATURE_KEY,
            location_id: locationId
        });
    }
    return feature;
};

const resolveScope = ({ payload = {}, scope = {} } = {}) => {
    const terminalId = normalizeTerminal(scope.terminalId || payload.terminal_id);
    const locationId = parsePositiveInt(scope.locationId || payload.location_id);
    const shiftId = parsePositiveInt(scope.shiftId || payload.shift_id);
    if (!terminalId || !locationId) {
        throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'A registered POS terminal and location are required.', 422);
    }
    return { terminalId, locationId, shiftId };
};

const assertTargetScope = async ({ repository, targetUser, targetUserId, locationId, transaction }) => {
    if (!targetUser || targetUser.is_active !== true || targetUser.deleted_at) {
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'The selected cashier is not authorized for this register.', 403);
    }
    if (typeof repository.findUserLocationGrant === 'function') {
        const grant = await repository.findUserLocationGrant({ userId: targetUserId, locationId, transaction, lock: true });
        if (!grant) {
            throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'The selected cashier is not authorized for this register location.', 403);
        }
    }
};

const verifyAndConsumePin = async ({ repository, targetUser, targetUserId, pin, actorUserId, terminalId, locationId, shiftId, requestId, transaction, now = nowDate, comparePin = bcrypt.compare, rateLimiter = null }) => {
    const normalizedPin = normalizePin(pin);
    const current = now();
    const lockedUntil = targetUser.pos_cashier_pin_locked_until ? new Date(targetUser.pos_cashier_pin_locked_until) : null;
    const rateKey = `${targetUserId}:${terminalId}`;
    if (rateLimiter?.isLocked?.(rateKey, current.getTime())) {
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, GENERIC_PIN_MESSAGE, 403);
    }
    if (lockedUntil && lockedUntil.getTime() > current.getTime()) {
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, GENERIC_PIN_MESSAGE, 403);
    }

    const pinHash = String(targetUser.pos_cashier_pin_hash || '').trim() || DUMMY_PIN_HASH;
    const validFormat = PIN_PATTERN.test(normalizedPin);
    const matches = validFormat && await comparePin(normalizedPin, pinHash);
    if (!matches) {
        const nextAttempts = (Number(targetUser.pos_cashier_pin_failed_attempts) || 0) + 1;
        const nextLockedUntil = nextAttempts >= MAX_PIN_ATTEMPTS
            ? new Date(current.getTime() + LOCKOUT_MS)
            : null;
        await repository.updateUserPinState({
            userId: targetUserId,
            payload: {
                pos_cashier_pin_failed_attempts: nextAttempts,
                pos_cashier_pin_locked_until: nextLockedUntil
            },
            transaction
        });
        rateLimiter?.registerFailure?.(rateKey, current.getTime());
        await audit({
            repository,
            actorUserId,
            actorUsername: null,
            eventType: 'pos_cashier_pin_verification_failed',
            action: 'VERIFY',
            row: targetUser,
            locationId,
            terminalId,
            shiftId,
            requestId,
            changes: { target_user_id: targetUserId, failed_attempts: nextAttempts, locked: Boolean(nextLockedUntil) },
            transaction
        });
        throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, GENERIC_PIN_MESSAGE, 403);
    }

    rateLimiter?.clear?.(rateKey);
    await repository.updateUserPinState({
        userId: targetUserId,
        payload: { pos_cashier_pin_failed_attempts: 0, pos_cashier_pin_locked_until: null },
        transaction
    });
    return true;
};

const createAuthoritySession = async ({ repository, authorityService, tenantId, scope, targetUserId, attendance, current, actorUser, eventType = null, custodyMode = null, expectedCash = null, countedCash = null, note = null, idempotencyKey = null, requestId, transaction, now = nowDate }) => {
    const startedAt = now();
    const maxAge = typeof authorityService.maxAgeMs === 'function'
        ? authorityService.maxAgeMs()
        : Number(authorityService.maxAgeMs || 0);
    const expiresAt = new Date(startedAt.getTime() + (maxAge > 0 ? maxAge : 12 * 60 * 60 * 1000));
    const session = await repository.createOperatorSession({
        pos_terminal_shift_id: scope.shiftId,
        terminal_id: scope.terminalId,
        location_id: scope.locationId,
        user_id: targetUserId,
        employee_attendance_session_id: attendance.employee_attendance_session_id,
        status: 'active',
        started_at: startedAt,
        ended_at: null,
        ended_reason: null,
        authority_token_hash: null,
        authority_expires_at: expiresAt,
        revoked_at: null,
        revoked_reason: null,
        idempotency_key: idempotencyKey
    }, { transaction });
    const authorityToken = authorityService.issue({
        tenantId,
        locationId: scope.locationId,
        terminalId: scope.terminalId,
        shiftId: scope.shiftId,
        userId: targetUserId,
        operatorSessionId: session.pos_terminal_operator_session_id,
        expiresAt
    });
    const updatedSession = await repository.updateOperatorSession({
        operatorSessionId: session.pos_terminal_operator_session_id,
        payload: { authority_token_hash: authorityService.hashAuthorityToken(authorityToken) },
        transaction
    });
    let event = null;
    if (eventType) {
        event = await repository.createDrawerHandoffEvent({
            pos_terminal_shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            location_id: scope.locationId,
            event_type: eventType,
            custody_mode: custodyMode,
            outgoing_operator_user_id: current?.user_id || null,
            incoming_operator_user_id: targetUserId,
            expected_cash_amount: expectedCash,
            counted_cash_amount: countedCash,
            variance_amount: expectedCash == null || countedCash == null ? null : Number((Number(countedCash) - Number(expectedCash)).toFixed(4)),
            outgoing_acknowledged_by: eventType === 'counted_custody_transfer' ? current?.user_id || null : null,
            outgoing_acknowledged_at: eventType === 'counted_custody_transfer' ? startedAt : null,
            incoming_acknowledged_by: eventType === 'counted_custody_transfer' ? targetUserId : null,
            incoming_acknowledged_at: eventType === 'counted_custody_transfer' ? startedAt : null,
            recorded_by: actorUser?.user_id || targetUserId,
            event_at: startedAt,
            idempotency_key: idempotencyKey,
            note
        }, { transaction });
    }
    await audit({
        repository,
        actorUserId: actorUser?.user_id || targetUserId,
        actorUsername: actorUser?.username,
        eventType: 'pos_operator_session_started',
        action: 'CREATE',
        row: updatedSession,
        locationId: scope.locationId,
        terminalId: scope.terminalId,
        shiftId: scope.shiftId,
        requestId,
        changes: {
            incoming_user_id: targetUserId,
            outgoing_user_id: current?.user_id || null,
            custody_mode: custodyMode || 'register_control',
            handoff_event_id: event?.pos_drawer_handoff_event_id || null,
            idempotency_key: idempotencyKey
        },
        transaction
    });
    return { operatorSession: updatedSession, event, authorityToken, startedAt };
};

const endCurrentOperator = async ({ repository, current, reason, actorUserId, actorUsername, locationId, terminalId, shiftId, requestId, transaction, at }) => {
    if (!current) return null;
    const ended = await repository.updateOperatorSession({
        operatorSessionId: current.pos_terminal_operator_session_id,
        payload: {
            status: 'ended',
            ended_at: at,
            ended_reason: reason,
            revoked_at: at,
            revoked_reason: reason,
            authority_token_hash: null,
            protected_operation_key: null,
            protected_operation_type: null,
            protected_operation_started_at: null
        },
        transaction
    });
    await audit({
        repository,
        actorUserId,
        actorUsername,
        eventType: 'pos_operator_session_ended',
        action: 'UPDATE',
        row: ended,
        locationId,
        terminalId,
        shiftId,
        requestId,
        changes: { reason, ended_user_id: current.user_id },
        transaction
    });
    return ended;
};

const buildTransition = ({ dependencies = {}, eventType = null, custodyMode = null, reason = 'takeover', counted = false } = {}) => {
    const {
        repository,
        resolveFeature,
        authorityService,
        comparePin = bcrypt.compare,
        runTransaction: executeTransaction = runTransaction,
        now = nowDate,
        rateLimiter = null,
        ensureAttendanceForTakeover = null
    } = dependencies;
    return async ({ payload = {}, user = {}, scope = {}, tenantId = null, authorityToken = '', requestId } = {}) => {
        try {
            const resolvedScope = resolveScope({ payload, scope });
            const targetUserId = parsePositiveInt(payload.user_id || payload.incoming_user_id);
            const key = String(payload.idempotency_key || '').trim();
            if (!targetUserId || !key || key.length < 8) {
                throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'A cashier, idempotency key, and registered terminal are required.', 422);
            }
            if (counted && (payload.outgoing_acknowledged !== true || payload.incoming_acknowledged !== true)) {
                throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'Both cashiers must acknowledge a counted custody handoff.', 422);
            }
            if (counted && (payload.counted_cash_amount == null || Number(payload.counted_cash_amount) < 0)) {
                throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'A non-negative counted cash amount is required.', 422);
            }
            const persistedKey = transitionIdempotencyKey({ reason, targetUserId, key });
            return await executeTransaction(async (transaction) => {
                await requireFeature({ resolveFeature, locationId: resolvedScope.locationId });
                const shift = await repository.findOpenTerminalShift({ ...resolvedScope, transaction, lock: true });
                if (!shift || (resolvedScope.shiftId && Number(shift.pos_terminal_shift_id) !== resolvedScope.shiftId)) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'The register shift is not open for this terminal.', 409);
                }
                const actualScope = { ...resolvedScope, shiftId: Number(shift.pos_terminal_shift_id) };
                const current = await repository.findActiveOperator({ terminalId: actualScope.terminalId, locationId: actualScope.locationId, shiftId: actualScope.shiftId, transaction, lock: true });
                const replay = await repository.findOperatorByIdempotency({ shiftId: actualScope.shiftId, key: persistedKey, transaction, lock: true });
                const targetUser = await repository.findUserById({ userId: targetUserId, transaction, lock: true });
                await assertTargetScope({ repository, targetUser, targetUserId, locationId: actualScope.locationId, transaction });
                await verifyAndConsumePin({
                    repository,
                    targetUser,
                    targetUserId,
                    pin: payload.pin,
                    actorUserId: actorId(user) || targetUserId,
                    terminalId: actualScope.terminalId,
                    locationId: actualScope.locationId,
                    shiftId: actualScope.shiftId,
                    requestId,
                    transaction,
                    now,
                    comparePin,
                    rateLimiter
                });
                let attendance = await repository.findOpenAttendanceByUser({ userId: targetUserId, locationId: actualScope.locationId, transaction, lock: true });
                if (!attendance && reason === 'takeover' && typeof ensureAttendanceForTakeover === 'function') {
                    const lifecycle = await ensureAttendanceForTakeover({
                        shift,
                        user: targetUser,
                        payload,
                        requestId,
                        transaction
                    });
                    attendance = lifecycle?.attendance || null;
                }
                if (!attendance) throw operatorError(DomainErrorCode.CONFLICT, 'The cashier must have active attendance before using this register.', 409);
                const activeBreak = await repository.findOpenBreak({ attendanceSessionId: attendance.employee_attendance_session_id, transaction, lock: true });
                if (activeBreak) throw operatorError(DomainErrorCode.CONFLICT, 'A cashier on break cannot operate this register.', 409);
                if (replay) {
                    if (Number(replay.user_id) !== targetUserId) {
                        throw operatorError(DomainErrorCode.CONFLICT, 'The idempotency key belongs to a different cashier transition.', 409, {
                            reason_code: 'POS_OPERATOR_IDEMPOTENCY_SCOPE_MISMATCH'
                        });
                    }
                    let replaySession = replay;
                    let replayAuthorityToken = null;
                    if (replay.status === 'active'
                        && !replay.revoked_at
                        && new Date(replay.authority_expires_at).getTime() > now().getTime()) {
                        replayAuthorityToken = authorityService.issue({
                            tenantId: normalizeTenant(tenantId),
                            locationId: actualScope.locationId,
                            terminalId: actualScope.terminalId,
                            shiftId: actualScope.shiftId,
                            userId: replay.user_id,
                            operatorSessionId: replay.pos_terminal_operator_session_id,
                            expiresAt: replay.authority_expires_at
                        });
                        replaySession = await repository.updateOperatorSession({
                            operatorSessionId: replay.pos_terminal_operator_session_id,
                            payload: { authority_token_hash: authorityService.hashAuthorityToken(replayAuthorityToken) },
                            transaction
                        });
                    }
                    return ok({ operator_session: replaySession, event: null, idempotent_replay: true, authority_token: replayAuthorityToken });
                }
                if (hasFreshProtectedOperation(current, now())) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'Wait for the current protected POS operation to finish before changing cashiers.', 409, {
                        reason_code: 'POS_OPERATOR_MUTATION_IN_FLIGHT',
                        operation_type: current.protected_operation_type || null
                    });
                }
                const inFlightPayment = await repository.findInFlightPaymentSession?.({ shiftId: actualScope.shiftId, transaction, lock: true });
                if (inFlightPayment) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'Complete or cancel the in-flight payment before changing cashiers.', 409, {
                        reason_code: 'POS_OPERATOR_PAYMENT_IN_FLIGHT',
                        payment_session_id: inFlightPayment.pos_payment_session_id
                    });
                }
                if (counted) {
                    if (!current || Number(current.user_id) === targetUserId) {
                        throw operatorError(DomainErrorCode.CONFLICT, 'A counted custody handoff requires different outgoing and incoming cashiers.', 409, {
                            reason_code: 'POS_COUNTED_HANDOFF_DISTINCT_CASHIERS_REQUIRED'
                        });
                    }
                    await assertCurrentAuthority({ repository, authorityService, authorityToken, tenantId, scope: actualScope, current, transaction });
                }
                if (current && Number(current.user_id) === targetUserId) {
                    const startedAt = now();
                    const maxAge = typeof authorityService.maxAgeMs === 'function' ? authorityService.maxAgeMs() : Number(authorityService.maxAgeMs || 0);
                    const authorityExpiresAt = new Date(startedAt.getTime() + (maxAge > 0 ? maxAge : 12 * 60 * 60 * 1000));
                    const refreshedToken = authorityService.issue({
                        tenantId: normalizeTenant(tenantId),
                        locationId: actualScope.locationId,
                        terminalId: actualScope.terminalId,
                        shiftId: actualScope.shiftId,
                        userId: current.user_id,
                        operatorSessionId: current.pos_terminal_operator_session_id,
                        expiresAt: authorityExpiresAt
                    });
                    const refreshed = await repository.updateOperatorSession({
                        operatorSessionId: current.pos_terminal_operator_session_id,
                        payload: {
                            authority_token_hash: authorityService.hashAuthorityToken(refreshedToken),
                            authority_expires_at: authorityExpiresAt,
                            revoked_at: null,
                            revoked_reason: null
                        },
                        transaction
                    });
                    return ok({ operator_session: refreshed, event: null, idempotent_replay: true, authority_token: refreshedToken, authority_refreshed: true });
                }
                const at = now();
                await endCurrentOperator({
                    repository,
                    current,
                    reason,
                    actorUserId: actorId(user) || targetUserId,
                    actorUsername: user?.username,
                    locationId: actualScope.locationId,
                    terminalId: actualScope.terminalId,
                    shiftId: actualScope.shiftId,
                    requestId,
                    transaction,
                    at
                });
                let expectedCash = null;
                let countedCash = null;
                if (counted) {
                    expectedCash = await repository.getExpectedCashForShift({ shift, transaction });
                    countedCash = Number(Number(payload.counted_cash_amount).toFixed(4));
                }
                const created = await createAuthoritySession({
                    repository,
                    authorityService,
                    tenantId: normalizeTenant(tenantId),
                    scope: actualScope,
                    targetUserId,
                    attendance,
                    current,
                    actorUser: user,
                    eventType,
                    custodyMode,
                    expectedCash,
                    countedCash,
                    note: payload.note || null,
                    idempotencyKey: persistedKey,
                    requestId,
                    transaction,
                    now
                });
                return ok({
                    operator_session: created.operatorSession,
                    event: created.event,
                    idempotent_replay: false,
                    authority_token: created.authorityToken,
                    expected_cash_amount: expectedCash,
                    counted_cash_amount: countedCash,
                    variance_amount: expectedCash == null || countedCash == null ? null : Number((countedCash - expectedCash).toFixed(4))
                });
            });
        } catch (error) {
            return fail(error);
        }
    };
};

export const createPosOperatorAuthorityUseCases = (dependencies = {}) => {
    const {
        repository,
        resolveFeature,
        resolveMutationFeature = resolveFeature,
        authorityService,
        hashPin = (pin) => bcrypt.hash(pin, 12),
        runTransaction: executeTransaction = runTransaction,
        now = nowDate
    } = dependencies;
    const takeover = buildTransition({ dependencies, reason: 'takeover' });
    const sharedReliefStart = buildTransition({
        dependencies,
        eventType: 'shared_relief_start',
        custodyMode: 'shared_access',
        reason: 'shared_relief_start'
    });
    const sharedReliefEnd = buildTransition({
        dependencies,
        eventType: 'shared_relief_end',
        custodyMode: 'shared_access',
        reason: 'shared_relief_end'
    });
    const countedHandoff = buildTransition({
        dependencies,
        eventType: 'counted_custody_transfer',
        custodyMode: 'counted_transfer',
        reason: 'counted_custody_transfer',
        counted: true
    });

    const setPin = async ({ payload = {}, user = {}, locationId = null, requestId, reset = false } = {}) => {
        try {
            const targetUserId = parsePositiveInt(payload.user_id) || actorId(user);
            const actorUserId = actorId(user);
            if (!targetUserId || !actorUserId) throw operatorError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated user is required.', 401);
            if (targetUserId !== actorUserId && !isManager(user)) {
                throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Manager permission is required to reset a cashier PIN.', 403);
            }
            const pin = normalizePin(payload.pin);
            if (!PIN_PATTERN.test(pin)) throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'Cashier PIN must contain 4 to 12 digits.', 422);
            return await executeTransaction(async (transaction) => {
                if (resolveFeature && locationId) await requireFeature({ resolveFeature, locationId });
                const target = await repository.findUserById({ userId: targetUserId, transaction, lock: true });
                if (!target || target.is_active !== true || target.deleted_at) {
                    throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'The selected cashier is not active.', 403);
                }
                const pinHash = await hashPin(pin);
                await repository.updateUserPinState({
                    userId: targetUserId,
                    payload: {
                        pos_cashier_pin_hash: pinHash,
                        pos_cashier_pin_failed_attempts: 0,
                        pos_cashier_pin_locked_until: null,
                        pos_cashier_pin_changed_at: now()
                    },
                    transaction
                });
                await audit({
                    repository,
                    actorUserId,
                    actorUsername: user?.username,
                    eventType: reset ? 'pos_cashier_pin_reset' : 'pos_cashier_pin_enrolled',
                    action: 'UPDATE',
                    row: target,
                    locationId,
                    requestId,
                    changes: { target_user_id: targetUserId, pin_configured: true },
                    transaction
                });
                return ok({ user_id: targetUserId, pin_configured: true });
            });
        } catch (error) {
            return fail(error);
        }
    };

    const getCurrent = async ({ authorityToken = '', tenantId = null, scope = {} } = {}) => {
        try {
            await requireFeature({ resolveFeature, locationId: parsePositiveInt(scope.locationId) });
            if (!authorityToken) return ok({ operator_session: null, authority_valid: false });
            const claims = verifyAuthorityOrThrow(authorityService, authorityToken);
            if (normalizeTenant(claims.tenant_id) !== normalizeTenant(tenantId)
                || normalizeTerminal(claims.terminal_id) !== normalizeTerminal(scope.terminalId)
                || Number(claims.location_id) !== Number(scope.locationId)
                || (scope.shiftId && Number(claims.shift_id) !== Number(scope.shiftId))) {
                throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority is not valid for this terminal.', 403);
            }
            const session = await repository.findOperatorByAuthorityTokenHash({ authorityTokenHash: authorityService.hashAuthorityToken(authorityToken), lock: false });
            if (!session
                || session.status !== 'active'
                || Number(session.user_id) !== Number(claims.user_id)
                || Number(session.pos_terminal_shift_id) !== Number(claims.shift_id)
                || normalizeTerminal(session.terminal_id) !== normalizeTerminal(claims.terminal_id)
                || Number(session.location_id) !== Number(claims.location_id)
                || new Date(session.authority_expires_at).getTime() <= now().getTime()) {
                throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority has expired or been revoked.', 403);
            }
            const operatorUser = await repository.findUserById({ userId: session.user_id });
            const registerShift = typeof repository.findOpenTerminalShift === 'function'
                ? await repository.findOpenTerminalShift({
                    shiftId: session.pos_terminal_shift_id,
                    terminalId: session.terminal_id,
                    locationId: session.location_id
                })
                : null;
            return ok({
                operator_session: session,
                operator_user: operatorUserSummary(operatorUser),
                register_shift: registerShift,
                authority_valid: true
            });
        } catch (error) {
            return fail(error);
        }
    };

    const listEligible = async ({ scope = {} } = {}) => {
        try {
            const locationId = parsePositiveInt(scope.locationId);
            if (!locationId) {
                throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'A registered POS location is required.', 422);
            }
            const feature = await requireFeature({ resolveFeature, locationId });
            const operators = await repository.listEligibleOperators({ locationId });
            return ok({ feature, operators });
        } catch (error) {
            return fail(error);
        }
    };

    const authorizeMutation = async ({ authorityToken = '', tenantId = null, authenticatedUserId = null, scope = {}, operationKey = '', operationType = '' } = {}) => {
        try {
            const resolvedScope = resolveScope({ scope });
            const feature = await resolveMutationFeature({ locationId: resolvedScope.locationId });
            if (!feature?.enabled) {
                return ok({
                    feature,
                    operator_session: null,
                    operator_user: null,
                    authority_valid: true,
                    legacy_fallback: true
                });
            }
            if (!authorityToken) {
                throw operatorError(DomainErrorCode.AUTHENTICATION_FAILED, 'Cashier takeover is required before using this register.', 401, {
                    reason_code: 'POS_OPERATOR_AUTHORITY_REQUIRED'
                });
            }
            const normalizedOperationKey = String(operationKey || '').trim();
            if (!normalizedOperationKey) {
                throw operatorError(DomainErrorCode.VALIDATION_FAILED, 'A protected POS operation identity is required.', 422, {
                    reason_code: 'POS_OPERATOR_OPERATION_KEY_REQUIRED'
                });
            }
            const claims = verifyAuthorityOrThrow(authorityService, authorityToken);
            const normalizedAuthenticatedUserId = parsePositiveInt(authenticatedUserId);
            if (!normalizedAuthenticatedUserId || Number(claims.user_id) !== normalizedAuthenticatedUserId) {
                throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Sign in as the active cashier before using this register.', 403, {
                    reason_code: 'POS_OPERATOR_IDENTITY_MISMATCH'
                });
            }
            if (normalizeTenant(claims.tenant_id) !== normalizeTenant(tenantId)
                || normalizeTerminal(claims.terminal_id) !== resolvedScope.terminalId
                || Number(claims.location_id) !== resolvedScope.locationId
                || (resolvedScope.shiftId && Number(claims.shift_id) !== resolvedScope.shiftId)) {
                throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority is not valid for this register.', 403, {
                    reason_code: 'POS_OPERATOR_SCOPE_MISMATCH'
                });
            }
            return await executeTransaction(async (transaction) => {
                const session = await repository.findOperatorByAuthorityTokenHash({
                    authorityTokenHash: authorityService.hashAuthorityToken(authorityToken),
                    transaction,
                    lock: true
                });
                if (!session
                    || session.status !== 'active'
                    || Number(session.pos_terminal_operator_session_id) !== Number(claims.operator_session_id)
                    || Number(session.user_id) !== Number(claims.user_id)
                    || Number(session.pos_terminal_shift_id) !== Number(claims.shift_id)
                    || normalizeTerminal(session.terminal_id) !== resolvedScope.terminalId
                    || Number(session.location_id) !== resolvedScope.locationId
                    || new Date(session.authority_expires_at).getTime() <= now().getTime()) {
                    throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority has expired or been revoked.', 403, {
                        reason_code: 'POS_OPERATOR_AUTHORITY_INVALID'
                    });
                }
                if (hasFreshProtectedOperation(session, now()) && session.protected_operation_key !== normalizedOperationKey) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'Another protected POS operation is still in progress.', 409, {
                        reason_code: 'POS_OPERATOR_MUTATION_IN_FLIGHT',
                        operation_type: session.protected_operation_type || null
                    });
                }
                const operatorUser = await repository.findUserById({ userId: session.user_id, transaction, lock: true });
                await assertTargetScope({
                    repository,
                    targetUser: operatorUser,
                    targetUserId: session.user_id,
                    locationId: resolvedScope.locationId,
                    transaction
                });
                const attendance = await repository.findOpenAttendanceByUser({
                    userId: session.user_id,
                    locationId: resolvedScope.locationId,
                    transaction,
                    lock: true
                });
                if (!attendance) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'The current cashier is no longer timed in.', 409, {
                        reason_code: 'POS_OPERATOR_ATTENDANCE_REQUIRED'
                    });
                }
                const activeBreak = await repository.findOpenBreak({
                    attendanceSessionId: attendance.employee_attendance_session_id,
                    transaction,
                    lock: true
                });
                if (activeBreak) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'The current cashier is on break.', 409, {
                        reason_code: 'POS_OPERATOR_ON_BREAK'
                    });
                }
                const registerShift = await repository.findOpenTerminalShift({
                    terminalId: resolvedScope.terminalId,
                    locationId: resolvedScope.locationId,
                    shiftId: session.pos_terminal_shift_id,
                    transaction,
                    lock: true
                });
                if (!registerShift) {
                    throw operatorError(DomainErrorCode.CONFLICT, 'The register shift is no longer open.', 409, {
                        reason_code: 'POS_OPERATOR_SHIFT_NOT_OPEN'
                    });
                }
                const claimedSession = await repository.updateOperatorSession({
                    operatorSessionId: session.pos_terminal_operator_session_id,
                    payload: {
                        protected_operation_key: normalizedOperationKey,
                        protected_operation_type: String(operationType || 'pos_mutation').slice(0, 120),
                        protected_operation_started_at: now()
                    },
                    transaction
                });
                return ok({
                    feature,
                    operator_session: claimedSession,
                    operator_user: operatorUserSummary(operatorUser),
                    register_shift: {
                        pos_terminal_shift_id: Number(registerShift.pos_terminal_shift_id),
                        cashier_id: Number(registerShift.cashier_id),
                        terminal_id: normalizeTerminal(registerShift.terminal_id),
                        location_id: Number(registerShift.location_id)
                    },
                    authority_valid: true,
                    legacy_fallback: false
                });
            });
        } catch (error) {
            return fail(error);
        }
    };

    const releaseMutation = ({ operatorSessionId, operationKey, transaction } = {}) => repository.releaseOperatorMutation({
        operatorSessionId,
        operationKey,
        transaction
    });

    const end = async ({ authorityToken = '', tenantId = null, scope = {}, user = {}, requestId } = {}) => {
        try {
            if (!authorityToken) throw operatorError(DomainErrorCode.AUTHENTICATION_FAILED, 'Operator authority is required.', 401);
            const claims = verifyAuthorityOrThrow(authorityService, authorityToken);
            return await executeTransaction(async (transaction) => {
                const current = await repository.findOperatorByAuthorityTokenHash({
                    authorityTokenHash: authorityService.hashAuthorityToken(authorityToken),
                    transaction,
                    lock: true
                });
                if (!current
                    || Number(current.pos_terminal_operator_session_id) !== Number(claims.operator_session_id)
                    || current.status !== 'active') {
                    throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority has expired or been revoked.', 403);
                }
                if (actorId(user) && Number(current.user_id) !== actorId(user) && !isManager(user)) {
                    throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority belongs to a different cashier.', 403);
                }
                if (Number(current.user_id) !== Number(claims.user_id)) {
                    throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority is not valid for this session.', 403);
                }
                if (normalizeTenant(claims.tenant_id) !== normalizeTenant(tenantId)
                    || normalizeTerminal(current.terminal_id) !== normalizeTerminal(scope.terminalId)
                    || Number(current.location_id) !== Number(scope.locationId)
                    || (scope.shiftId && Number(current.pos_terminal_shift_id) !== Number(scope.shiftId))) {
                    throw operatorError(DomainErrorCode.AUTHORIZATION_FAILED, 'Operator authority is not valid for this terminal.', 403);
                }
                const ended = await endCurrentOperator({
                    repository,
                    current,
                    reason: 'explicit_end',
                    actorUserId: actorId(user) || current.user_id,
                    actorUsername: user?.username,
                    locationId: current.location_id,
                    terminalId: current.terminal_id,
                    shiftId: current.pos_terminal_shift_id,
                    requestId,
                    transaction,
                    at: now()
                });
                return ok({ operator_session: ended, idempotent_replay: false });
            });
        } catch (error) {
            return fail(error);
        }
    };

    const revokeForUser = ({ userId, reason = 'revoked', transaction, at = now() } = {}) => repository.revokeOperatorSessionsForUser({ userId, reason, transaction, at });
    const revokeForTerminal = ({ terminalId, reason = 'terminal_unpaired', transaction, at = now() } = {}) => repository.revokeOperatorSessionsForTerminal({ terminalId, reason, transaction, at });

    return {
        setPin: (args) => setPin({ ...args, reset: false }),
        resetPin: (args) => setPin({ ...args, reset: true }),
        takeOver: takeover,
        returnRegister: sharedReliefEnd,
        startSharedRelief: sharedReliefStart,
        endSharedRelief: sharedReliefEnd,
        countedHandoff,
        getCurrent,
        listEligible,
        authorizeMutation,
        releaseMutation,
        end,
        revokeForUser,
        revokeForTerminal
    };
};

export { buildTransition, verifyAndConsumePin };
