import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const ACTIVE_PARKED_STATUSES = ['parked', 'claimed'];
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const SECRET_KEY_PATTERN = /(password|passwd|pin|token|secret|authorization|access[_-]?token|refresh[_-]?token)/i;

const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const toFiniteNonNegative = (value, fallback = 0) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toPlain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

const parseStoredSnapshot = (value) => {
    const plain = toPlain(value);
    if (isPlainObject(plain)) return plain;
    if (typeof plain !== 'string') return null;
    try {
        const parsed = JSON.parse(plain);
        if (isPlainObject(parsed)) return parsed;
        if (typeof parsed === 'string') {
            const nested = JSON.parse(parsed);
            return isPlainObject(nested) ? nested : null;
        }
        return null;
    } catch {
        return null;
    }
};

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const scrubSecrets = (value, depth = 0) => {
    if (depth > 10) return null;
    if (Array.isArray(value)) return value.map((entry) => scrubSecrets(entry, depth + 1));
    if (!value || typeof value !== 'object') return value;

    return Object.entries(value).reduce((safe, [key, entry]) => {
        if (!SECRET_KEY_PATTERN.test(key)) safe[key] = scrubSecrets(entry, depth + 1);
        return safe;
    }, {});
};

const normalizeSnapshot = (snapshot) => {
    if (!isPlainObject(snapshot)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'snapshot must be an object',
            { statusCode: 422 }
        );
    }

    const safeSnapshot = scrubSecrets(snapshot);
    const parkedSaleName = String(safeSnapshot?.parked_sale_name || '').trim();
    if (parkedSaleName.length > 100) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'snapshot.parked_sale_name cannot exceed 100 characters',
            { statusCode: 422 }
        );
    }
    const lines = Array.isArray(safeSnapshot?.lines) ? safeSnapshot.lines : [];
    if (lines.length < 1) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'snapshot.lines must contain at least one item',
            { statusCode: 422 }
        );
    }
    if (lines.length > 100) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'snapshot.lines cannot contain more than 100 items',
            { statusCode: 422 }
        );
    }

    const normalizedLines = lines.map((line, index) => {
        if (!isPlainObject(line)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `snapshot.lines[${index}] must be an object`,
                { statusCode: 422 }
            );
        }
        const itemId = toPositiveInt(line.item_id);
        const quantity = Number(line.quantity);
        if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `snapshot.lines[${index}] requires a positive item_id and quantity`,
                { statusCode: 422 }
            );
        }
        if (line.sale_price != null && (!Number.isFinite(Number(line.sale_price)) || Number(line.sale_price) < 0)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `snapshot.lines[${index}].sale_price must be non-negative`,
                { statusCode: 422 }
            );
        }
        return {
            ...line,
            item_id: itemId,
            quantity,
            ...(line.sale_price == null ? {} : { sale_price: Number(line.sale_price) })
        };
    });

    const normalized = {
        ...safeSnapshot,
        parked_sale_name: parkedSaleName || null,
        lines: normalizedLines
    };
    const serialized = JSON.stringify(normalized);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SNAPSHOT_BYTES) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'snapshot is too large',
            { statusCode: 422 }
        );
    }
    return normalized;
};

const normalizeTerminalId = (value) => {
    const terminalId = String(value || '').trim().toUpperCase();
    return TERMINAL_ID_PATTERN.test(terminalId) ? terminalId : null;
};

const beginTransaction = async () => {
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    if (!sequelize || typeof sequelize.transaction !== 'function') {
        throw new Error('Tenant sequelize transaction is unavailable');
    }
    return sequelize.transaction();
};

const finishTransaction = async (transaction, method) => {
    if (transaction && !transaction.finished && typeof transaction[method] === 'function') {
        await transaction[method]();
    }
};

const buildParkedSaleError = (code, message, statusCode, details = undefined) => (
    new DomainError(code, message, { statusCode, ...(details ? { details } : {}) })
);

const resolveOwnedOpenShift = async ({
    posRepository,
    payload = {},
    user,
    transaction = null,
    terminalRequired = false,
    allowShared = false
}) => {
    const userId = toPositiveInt(user?.user_id);
    const shiftOwnerUserId = toPositiveInt(user?.register_shift_owner_user_id) || userId;
    if (!userId) throw buildParkedSaleError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required.', 401);

    const shiftId = toPositiveInt(payload.shift_id);
    if (!shiftId) throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'shift_id is required.', 422);

    const requestedTerminalId = normalizeTerminalId(payload.terminal_id);
    if (terminalRequired && !requestedTerminalId) {
        throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'terminal_id is required.', 422);
    }

    const shift = await posRepository.getTerminalShiftById(shiftId, {
        transaction,
        lock: Boolean(transaction)
    });
    if (!shift) throw buildParkedSaleError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS shift not found.', 404);
    if (String(shift.status || '').toLowerCase() !== 'open') {
        throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'Parked sales require an open POS shift.', 409, {
            reason_code: 'POS_SHIFT_NOT_OPEN',
            shift_id: shiftId
        });
    }
    // Parked sales are a location-level handoff queue. Listing and claiming
    // may be performed by another authorized cashier at the same location;
    // create, re-park, complete, and cancel still require shift ownership.
    if (!allowShared && toPositiveInt(shift.cashier_id) !== shiftOwnerUserId) {
        throw buildParkedSaleError(DomainErrorCode.AUTHORIZATION_FAILED, 'Only the active register operator may manage its parked sales.', 403, {
            reason_code: 'POS_SHIFT_OWNER_REQUIRED',
            shift_id: shiftId
        });
    }

    const shiftTerminalId = normalizeTerminalId(shift.terminal_id);
    if (requestedTerminalId && shiftTerminalId !== requestedTerminalId) {
        throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'terminal_id does not match the active POS shift.', 409, {
            reason_code: 'POS_SHIFT_TERMINAL_MISMATCH',
            shift_terminal_id: shiftTerminalId,
            requested_terminal_id: requestedTerminalId
        });
    }

    const shiftLocationId = toPositiveInt(shift.location_id);
    const requestedLocationId = payload.location_id == null ? null : toPositiveInt(payload.location_id);
    if (payload.location_id != null && !requestedLocationId) {
        throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'location_id must be a positive integer.', 422);
    }
    if (!shiftLocationId) {
        throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'The active POS shift has no location scope.', 422, {
            reason_code: 'POS_SHIFT_LOCATION_REQUIRED',
            shift_id: shiftId
        });
    }
    if (requestedLocationId && requestedLocationId !== shiftLocationId) {
        throw buildParkedSaleError(DomainErrorCode.AUTHORIZATION_FAILED, 'location_id does not match the active POS shift.', 403, {
            reason_code: 'POS_SHIFT_LOCATION_MISMATCH',
            shift_location_id: shiftLocationId,
            requested_location_id: requestedLocationId
        });
    }

    return {
        userId,
        operatorSessionId: toPositiveInt(user?.operator_session_id),
        shiftId,
        locationId: shiftLocationId,
        terminalId: requestedTerminalId || shiftTerminalId,
        shift
    };
};

const assertParkedSaleScope = (row, scope) => {
    if (toPositiveInt(row?.shift_id) !== scope.shiftId || toPositiveInt(row?.cashier_id) !== scope.userId) {
        throw buildParkedSaleError(DomainErrorCode.AUTHORIZATION_FAILED, 'Parked sale is outside the active cashier shift.', 403, {
            reason_code: 'PARKED_SALE_SCOPE_DENIED'
        });
    }
    if (toPositiveInt(row?.location_id) !== scope.locationId) {
        throw buildParkedSaleError(DomainErrorCode.AUTHORIZATION_FAILED, 'Parked sale location does not match the active shift.', 403, {
            reason_code: 'PARKED_SALE_LOCATION_MISMATCH'
        });
    }
};

const assertParkedSaleLocationScope = (row, scope) => {
    if (toPositiveInt(row?.location_id) !== scope.locationId) {
        throw buildParkedSaleError(DomainErrorCode.AUTHORIZATION_FAILED, 'Parked sale location does not match the active shift.', 403, {
            reason_code: 'PARKED_SALE_LOCATION_MISMATCH'
        });
    }
};

const toPublicParkedSale = (row, extra = {}) => {
    const parkedSale = toPlain(row) || {};
    const snapshot = parseStoredSnapshot(parkedSale.snapshot) || { lines: [] };
    const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
    return {
        ...parkedSale,
        ...extra,
        snapshot: { ...snapshot, lines },
        line_count: lines.length
    };
};

export const buildCreatePosParkedSaleUseCase = ({ posRepository }) => async ({ payload = {}, user }) => {
    let transaction = null;
    try {
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        if (idempotencyKey.length < 8) {
            throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required.', 422);
        }
        const snapshot = normalizeSnapshot(payload.snapshot);
        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({
            posRepository,
            payload,
            user,
            transaction,
            terminalRequired: true
        });
        const requestPayload = {
            shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            location_id: scope.locationId,
            snapshot,
            subtotal_amount: toFiniteNonNegative(payload.subtotal_amount),
            total_amount: toFiniteNonNegative(payload.total_amount),
            line_count: snapshot.lines.length,
            quantity_total: snapshot.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
        };
        const requestHash = hashPayload(requestPayload);

        const existing = await posRepository.findParkedSaleByIdempotencyKey(idempotencyKey, {
            transaction,
            lock: true
        });
        if (existing) {
            if (String(existing.request_hash || '') !== requestHash) {
                throw buildParkedSaleError(
                    DomainErrorCode.CONFLICT,
                    'idempotency_key was already used with a different parked-sale payload.',
                    409,
                    { reason_code: 'PARKED_SALE_IDEMPOTENCY_CONFLICT' }
                );
            }
            await finishTransaction(transaction, 'commit');
            return ok(toPublicParkedSale(
                typeof existing.get === 'function' ? existing.get({ plain: true }) : existing,
                { idempotent_replay: true }
            ), 'POS sale park request replayed');
        }

        const created = await posRepository.createParkedSale({
            park_reference: `PARK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            status: 'parked',
            revision: 1,
            cashier_id: scope.userId,
            shift_id: scope.shiftId,
            origin_cashier_id: scope.userId,
            origin_shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            location_id: scope.locationId,
            snapshot,
            line_count: requestPayload.line_count,
            quantity_total: requestPayload.quantity_total,
            subtotal_amount: requestPayload.subtotal_amount,
            total_amount: requestPayload.total_amount
        }, { transaction });
        await posRepository.createAuditLog({
            user_id: scope.userId,
            entity_type: 'pos_parked_sale',
            entity_id: created?.pos_parked_sale_id || null,
            action: 'CREATE',
            event_type: 'pos_parked_sale_created',
            terminal_id: scope.terminalId,
            shift_id: scope.shiftId,
            location_id: scope.locationId,
            changes: {
                event: 'pos_parked_sale_created',
                operator_session_id: scope.operatorSessionId,
                park_reference: created?.park_reference || null,
                line_count: requestPayload.line_count,
                total_amount: requestPayload.total_amount,
                terminal_id: scope.terminalId,
                shift_id: scope.shiftId,
                location_id: scope.locationId
            }
        }, { transaction });
        await finishTransaction(transaction, 'commit');
        return ok(toPublicParkedSale(created, { idempotent_replay: false }), 'POS sale parked');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to park POS sale'));
    }
};

export const buildReparkPosParkedSaleUseCase = ({ posRepository }) => async ({ parkedSaleId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedId = toPositiveInt(parkedSaleId);
        const expectedRevision = toPositiveInt(payload.expected_revision);
        if (!normalizedId) throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'parked sale id must be a positive integer.', 400);
        if (!expectedRevision) throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'expected_revision is required.', 422);
        const snapshot = normalizeSnapshot(payload.snapshot);
        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({
            posRepository,
            payload,
            user,
            transaction,
            terminalRequired: true
        });
        const row = await posRepository.getParkedSaleById(normalizedId, { transaction, lock: true });
        if (!row) throw buildParkedSaleError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Parked POS sale not found.', 404);
        assertParkedSaleScope(row, scope);
        if (row.status !== 'claimed'
            || toPositiveInt(row.claimed_by) !== scope.userId
            || normalizeTerminalId(row.claimed_terminal_id) !== scope.terminalId) {
            throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'Only the sale claimed by this terminal can be parked again.', 409, {
                reason_code: 'PARKED_SALE_NOT_CLAIMED_BY_TERMINAL'
            });
        }
        const currentRevision = toPositiveInt(row.revision) || 1;
        if (currentRevision !== expectedRevision) {
            throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'This parked sale changed after it was resumed. Review it again before parking.', 409, {
                reason_code: 'PARKED_SALE_REVISION_CONFLICT',
                expected_revision: expectedRevision,
                current_revision: currentRevision
            });
        }

        const reparkingPayload = {
            snapshot,
            line_count: snapshot.lines.length,
            quantity_total: snapshot.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
            subtotal_amount: toFiniteNonNegative(payload.subtotal_amount),
            total_amount: toFiniteNonNegative(payload.total_amount),
            revision: currentRevision + 1,
            status: 'parked',
            claimed_by: null,
            claimed_terminal_id: null,
            claimed_at: null
        };
        const updated = await posRepository.updateParkedSale(normalizedId, reparkingPayload, { transaction, lock: true });
        await posRepository.createAuditLog({
            user_id: scope.userId,
            entity_type: 'pos_parked_sale',
            entity_id: normalizedId,
            action: 'UPDATE',
            event_type: 'pos_parked_sale_reparked',
            terminal_id: scope.terminalId,
            shift_id: scope.shiftId,
            location_id: scope.locationId,
            changes: {
                event: 'pos_parked_sale_reparked',
                operator_session_id: scope.operatorSessionId,
                revision: reparkingPayload.revision,
                total_amount: reparkingPayload.total_amount,
                terminal_id: scope.terminalId,
                shift_id: scope.shiftId,
                location_id: scope.locationId
            }
        }, { transaction });
        await finishTransaction(transaction, 'commit');
        return ok(toPublicParkedSale(updated, { idempotent_replay: false }), 'Parked POS sale updated');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to update parked POS sale'));
    }
};

export const buildCompleteClaimedPosParkedSaleUseCase = ({ posRepository }) => async ({
    parkedSaleId,
    payload = {},
    user,
    transactionId,
    transaction
}) => {
    const normalizedId = toPositiveInt(parkedSaleId);
    const normalizedTransactionId = toPositiveInt(transactionId);
    if (!normalizedId || !normalizedTransactionId || !transaction) {
        throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'A parked sale, completed transaction, and database transaction are required.', 422);
    }
    const scope = await resolveOwnedOpenShift({
        posRepository,
        payload,
        user,
        transaction,
        terminalRequired: true
    });
    const row = await posRepository.getParkedSaleById(normalizedId, { transaction, lock: true });
    if (!row) throw buildParkedSaleError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Parked POS sale not found.', 404);
    assertParkedSaleScope(row, scope);
    if (row.status === 'completed' && toPositiveInt(row.completed_transaction_id) === normalizedTransactionId) {
        return toPublicParkedSale(row, { idempotent_replay: true });
    }
    if (row.status !== 'claimed'
        || toPositiveInt(row.claimed_by) !== scope.userId
        || normalizeTerminalId(row.claimed_terminal_id) !== scope.terminalId) {
        throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'Only the sale claimed by this terminal can be completed.', 409, {
            reason_code: 'PARKED_SALE_NOT_CLAIMED_BY_TERMINAL'
        });
    }
    const completed = await posRepository.updateParkedSale(normalizedId, {
        status: 'completed',
        completed_transaction_id: normalizedTransactionId,
        completed_at: new Date()
    }, { transaction, lock: true });
    await posRepository.createAuditLog({
        user_id: scope.userId,
        entity_type: 'pos_parked_sale',
        entity_id: normalizedId,
        action: 'UPDATE',
        event_type: 'pos_parked_sale_completed',
        terminal_id: scope.terminalId,
        shift_id: scope.shiftId,
        location_id: scope.locationId,
        changes: {
            event: 'pos_parked_sale_completed',
            operator_session_id: scope.operatorSessionId,
            completed_transaction_id: normalizedTransactionId,
            terminal_id: scope.terminalId,
            shift_id: scope.shiftId,
            location_id: scope.locationId
        }
    }, { transaction });
    return completed;
};

export const buildListPosParkedSalesUseCase = ({ posRepository }) => async ({ query = {}, user }) => {
    try {
        const scope = await resolveOwnedOpenShift({
            posRepository,
            payload: query,
            user,
            terminalRequired: false,
            allowShared: true
        });
        const statuses = query.status ? [query.status] : ACTIVE_PARKED_STATUSES;
        const sales = await posRepository.listParkedSales({
            locationId: scope.locationId,
            sharedLocation: true,
            statuses,
            limit: query.limit
        });
        return ok({
            parked_sales: sales.map((row) => toPublicParkedSale(row)),
            count: sales.length,
            shift_id: scope.shiftId,
            location_id: scope.locationId
        });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to list parked POS sales'));
    }
};

export const buildClaimPosParkedSaleUseCase = ({ posRepository }) => async ({ parkedSaleId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedId = toPositiveInt(parkedSaleId);
        if (!normalizedId) throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'parked sale id must be a positive integer.', 400);
        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({
            posRepository,
            payload,
            user,
            transaction,
            terminalRequired: true,
            allowShared: true
        });
        const row = await posRepository.getParkedSaleById(normalizedId, { transaction, lock: true });
        if (!row) throw buildParkedSaleError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Parked POS sale not found.', 404);
        assertParkedSaleLocationScope(row, scope);

        if (row.status === 'claimed') {
            if (toPositiveInt(row.claimed_by) === scope.userId && normalizeTerminalId(row.claimed_terminal_id) === scope.terminalId) {
                await finishTransaction(transaction, 'commit');
                return ok(toPublicParkedSale(row, { idempotent_replay: true }), 'Parked POS sale already claimed');
            }
            throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'Parked POS sale is already claimed by another terminal.', 409, {
                reason_code: 'PARKED_SALE_ALREADY_CLAIMED'
            });
        }
        if (row.status !== 'parked') {
            throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'Only a parked POS sale can be claimed.', 409, {
                reason_code: 'PARKED_SALE_NOT_CLAIMABLE',
                status: row.status
            });
        }

        const claimed = await posRepository.updateParkedSale(normalizedId, {
            status: 'claimed',
            cashier_id: scope.userId,
            shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            claimed_by: scope.userId,
            claimed_terminal_id: scope.terminalId,
            claimed_at: new Date()
        }, { transaction, lock: true });
        await posRepository.createAuditLog({
            user_id: scope.userId,
            entity_type: 'pos_parked_sale',
            entity_id: normalizedId,
            action: 'UPDATE',
            event_type: 'pos_parked_sale_resumed',
            terminal_id: scope.terminalId,
            shift_id: scope.shiftId,
            location_id: scope.locationId,
            changes: {
                event: 'pos_parked_sale_resumed',
                operator_session_id: scope.operatorSessionId,
                origin_cashier_id: toPositiveInt(row.origin_cashier_id) || toPositiveInt(row.cashier_id),
                origin_shift_id: toPositiveInt(row.origin_shift_id) || toPositiveInt(row.shift_id),
                previous_cashier_id: toPositiveInt(row.cashier_id),
                previous_shift_id: toPositiveInt(row.shift_id),
                cashier_id: scope.userId,
                shift_id: scope.shiftId,
                claimed_terminal_id: scope.terminalId,
                location_id: scope.locationId
            }
        }, { transaction });
        await finishTransaction(transaction, 'commit');
        return ok(toPublicParkedSale(claimed, { idempotent_replay: false }), 'Parked POS sale claimed');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to claim parked POS sale'));
    }
};

export const buildCancelPosParkedSaleUseCase = ({ posRepository }) => async ({ parkedSaleId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedId = toPositiveInt(parkedSaleId);
        if (!normalizedId) throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'parked sale id must be a positive integer.', 400);
        const reason = String(payload.reason || '').trim();
        if (reason.length < 3) throw buildParkedSaleError(DomainErrorCode.VALIDATION_FAILED, 'reason is required to cancel a parked POS sale.', 422);
        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({
            posRepository,
            payload,
            user,
            transaction,
            terminalRequired: true
        });
        const row = await posRepository.getParkedSaleById(normalizedId, { transaction, lock: true });
        if (!row) throw buildParkedSaleError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Parked POS sale not found.', 404);
        assertParkedSaleScope(row, scope);
        if (row.status === 'cancelled') {
            await finishTransaction(transaction, 'commit');
            return ok(toPublicParkedSale(row, { idempotent_replay: true }), 'Parked POS sale already cancelled');
        }
        if (row.status === 'completed') {
            throw buildParkedSaleError(DomainErrorCode.CONFLICT, 'A completed POS sale cannot be cancelled as a parked sale.', 409, {
                reason_code: 'PARKED_SALE_ALREADY_COMPLETED'
            });
        }

        const cancelled = await posRepository.updateParkedSale(normalizedId, {
            status: 'cancelled',
            cancelled_by: scope.userId,
            cancelled_at: new Date(),
            cancel_reason: reason
        }, { transaction, lock: true });
        await posRepository.createAuditLog({
            user_id: scope.userId,
            entity_type: 'pos_parked_sale',
            entity_id: normalizedId,
            action: 'UPDATE',
            event_type: 'pos_parked_sale_cancelled',
            terminal_id: scope.terminalId,
            shift_id: scope.shiftId,
            location_id: scope.locationId,
            reason,
            changes: {
                event: 'pos_parked_sale_cancelled',
                operator_session_id: scope.operatorSessionId,
                reason,
                terminal_id: scope.terminalId,
                shift_id: scope.shiftId,
                location_id: scope.locationId
            }
        }, { transaction });
        await finishTransaction(transaction, 'commit');
        return ok(toPublicParkedSale(cancelled, { idempotent_replay: false }), 'Parked POS sale cancelled');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to cancel parked POS sale'));
    }
};
