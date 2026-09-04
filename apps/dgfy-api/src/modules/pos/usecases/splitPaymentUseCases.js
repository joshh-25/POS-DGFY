import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

const PAYMENT_METHODS = new Set(['cash', 'gcash', 'maya', 'card', 'bank_transfer']);
const ALLOCATION_OUTCOMES = new Set(['pending', 'successful', 'failed']);
const GOVERNED_DISCOUNT_TYPES = new Set(['senior', 'pwd', 'employee', 'promo', 'manual', 'voucher']);
const ITEM_DISCOUNT_TYPES = new Set(['senior', 'pwd', 'employee', 'promo', 'manual']);
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const SECRET_KEY_PATTERN = /(password|passwd|pin|token|secret|authorization|access[_-]?token|refresh[_-]?token)/i;

const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'snapshot must be an object', { statusCode: 422 });
    }

    const safeSnapshot = scrubSecrets(snapshot);
    const lines = Array.isArray(safeSnapshot?.lines) ? safeSnapshot.lines : [];
    if (lines.length < 1 || lines.length > 100) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'snapshot.lines must contain between 1 and 100 items',
            { statusCode: 422 }
        );
    }

    const normalizedLines = lines.map((line, index) => {
        if (!isPlainObject(line)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `snapshot.lines[${index}] must be an object`, { statusCode: 422 });
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
            quantity: round4(quantity),
            ...(line.sale_price == null ? {} : { sale_price: round4(line.sale_price) })
        };
    });

    const normalized = { ...safeSnapshot, lines: normalizedLines };
    if (isPlainObject(normalized.governed_discount)) {
        // These fields are server-owned and must never be accepted from the
        // browser. A verified approval proof is attached only after the server
        // has revalidated the discount during payment-session creation.
        delete normalized.governed_discount.approval_proof;
        delete normalized.governed_discount.approval_verified;
    }
    delete normalized.item_discount_approval_proofs;
    if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_SNAPSHOT_BYTES) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'snapshot is too large', { statusCode: 422 });
    }
    return normalized;
};

const extractDiscountApprovalInput = (snapshot) => {
    const governedDiscount = isPlainObject(snapshot?.governed_discount)
        ? snapshot.governed_discount
        : null;
    const discountType = String(governedDiscount?.type || '').trim().toLowerCase();
    if (!GOVERNED_DISCOUNT_TYPES.has(discountType)) return null;

    const managerPin = String(governedDiscount?.manager_pin || '').trim();
    if (!managerPin) return null;

    return {
        discount_type: discountType,
        approver_user_id: toPositiveInt(governedDiscount?.approver_user_id),
        employee_user_id: discountType === 'employee' ? toPositiveInt(governedDiscount?.employee_user_id) : null,
        employee_directory_id: discountType === 'employee' ? toPositiveInt(governedDiscount?.employee_directory_id) : null,
        manager_pin: managerPin
    };
};

const extractItemDiscountApprovalInputs = (snapshot) => (
    (Array.isArray(snapshot?.lines) ? snapshot.lines : []).map((line) => {
        const itemId = toPositiveInt(line?.item_id);
        const itemDiscount = isPlainObject(line?.item_discount) ? line.item_discount : null;
        const approval = isPlainObject(line?.item_discount_approval) ? line.item_discount_approval : null;
        const discountType = String(itemDiscount?.discount_type || itemDiscount?.type || '').trim().toLowerCase();
        const managerPin = String(approval?.manager_pin || '').trim();
        if (!itemId || !ITEM_DISCOUNT_TYPES.has(discountType) || !managerPin) return null;
        return {
            item_id: itemId,
            discount_type: discountType,
            approver_user_id: toPositiveInt(approval?.approver_user_id || itemDiscount?.approver_user_id),
            employee_directory_id: discountType === 'employee'
                ? toPositiveInt(approval?.employee_directory_id || itemDiscount?.employee_directory_id)
                : null,
            manager_pin: managerPin
        };
    }).filter(Boolean)
);

const buildDiscountApprovalProof = ({ snapshot, verifiedApproval = null }) => {
    const governedDiscount = isPlainObject(snapshot?.governed_discount)
        ? snapshot.governed_discount
        : null;
    const discountType = String(governedDiscount?.type || '').trim().toLowerCase();
    const approverUserId = toPositiveInt(verifiedApproval?.approver_user_id);
    if (!GOVERNED_DISCOUNT_TYPES.has(discountType) || !approverUserId) return null;

    return {
        version: 1,
        discount_type: discountType,
        approver_user_id: approverUserId,
        employee_user_id: discountType === 'employee' ? toPositiveInt(verifiedApproval?.employee_user_id) : null,
        employee_directory_id: discountType === 'employee' ? toPositiveInt(verifiedApproval?.employee_directory_id) : null,
        self_approved: discountType === 'employee' && verifiedApproval?.self_approved === true,
        approved_at: verifiedApproval?.approved_at || new Date().toISOString(),
        operator_user_id: toPositiveInt(verifiedApproval?.operator_user_id)
    };
};

const buildItemDiscountApprovalProofs = ({ snapshot, verifiedApprovals = [] }) => {
    const itemDiscountByItemId = new Map((Array.isArray(snapshot?.lines) ? snapshot.lines : []).map((line) => [
        toPositiveInt(line?.item_id),
        isPlainObject(line?.item_discount) ? line.item_discount : null
    ]).filter(([itemId, itemDiscount]) => itemId && itemDiscount));
    return (Array.isArray(verifiedApprovals) ? verifiedApprovals : []).map((approval) => {
        const itemId = toPositiveInt(approval?.item_id);
        const discountType = String(approval?.discount_type || '').trim().toLowerCase();
        const draft = itemDiscountByItemId.get(itemId);
        const draftType = String(draft?.discount_type || draft?.type || '').trim().toLowerCase();
        const approverUserId = toPositiveInt(approval?.approver_user_id);
        if (!itemId || !ITEM_DISCOUNT_TYPES.has(discountType) || discountType !== draftType || !approverUserId) {
            return null;
        }
        return {
            version: 1,
            item_id: itemId,
            discount_type: discountType,
            approver_user_id: approverUserId,
            employee_user_id: discountType === 'employee' ? toPositiveInt(approval?.employee_user_id) : null,
            employee_directory_id: discountType === 'employee' ? toPositiveInt(approval?.employee_directory_id) : null,
            self_approved: discountType === 'employee' && approval?.self_approved === true,
            approved_at: approval?.approved_at || new Date().toISOString(),
            operator_user_id: toPositiveInt(approval?.operator_user_id)
        };
    }).filter(Boolean);
};

const attachDiscountApprovalProof = (snapshot, proof) => {
    if (!proof || !isPlainObject(snapshot?.governed_discount)) return snapshot;
    return {
        ...snapshot,
        governed_discount: {
            ...snapshot.governed_discount,
            approval_proof: proof
        }
    };
};

const attachItemDiscountApprovalProofs = (snapshot, proofs) => (
    Array.isArray(proofs) && proofs.length > 0
        ? { ...snapshot, item_discount_approval_proofs: proofs }
        : snapshot
);

const extractTrustedDiscountApproval = (snapshot) => {
    const proof = isPlainObject(snapshot?.governed_discount?.approval_proof)
        ? snapshot.governed_discount.approval_proof
        : null;
    if (Number(proof?.version) !== 1) return null;
    const discountType = String(proof.discount_type || '').trim().toLowerCase();
    const approverUserId = toPositiveInt(proof.approver_user_id);
    if (!GOVERNED_DISCOUNT_TYPES.has(discountType) || !approverUserId) return null;

    return {
        discount_type: discountType,
        approver_user_id: approverUserId,
        employee_user_id: discountType === 'employee' ? toPositiveInt(proof.employee_user_id) : null,
        employee_directory_id: discountType === 'employee' ? toPositiveInt(proof.employee_directory_id) : null,
        self_approved: proof.self_approved === true,
        approved_at: proof.approved_at || null,
        operator_user_id: toPositiveInt(proof.operator_user_id)
    };
};

const extractTrustedItemDiscountApprovals = (snapshot) => (
    (Array.isArray(snapshot?.item_discount_approval_proofs)
        ? snapshot.item_discount_approval_proofs
        : []).map((proof) => {
        if (Number(proof?.version) !== 1) return null;
        const itemId = toPositiveInt(proof.item_id);
        const discountType = String(proof.discount_type || '').trim().toLowerCase();
        const approverUserId = toPositiveInt(proof.approver_user_id);
        if (!itemId || !ITEM_DISCOUNT_TYPES.has(discountType) || !approverUserId) return null;
        return {
            item_id: itemId,
            discount_type: discountType,
            approver_user_id: approverUserId,
            employee_user_id: discountType === 'employee' ? toPositiveInt(proof.employee_user_id) : null,
            employee_directory_id: discountType === 'employee' ? toPositiveInt(proof.employee_directory_id) : null,
            self_approved: proof.self_approved === true,
            approved_at: proof.approved_at || null,
            operator_user_id: toPositiveInt(proof.operator_user_id)
        };
    }).filter(Boolean)
);

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

const paymentError = (code, message, statusCode, details = undefined) => (
    new DomainError(code, message, { statusCode, ...(details ? { details } : {}) })
);

const resolveOwnedOpenShift = async ({ posRepository, payload = {}, user, transaction }) => {
    const userId = toPositiveInt(user?.user_id || user?.id);
    const shiftOwnerUserId = toPositiveInt(user?.register_shift_owner_user_id) || userId;
    if (!userId) throw paymentError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required.', 401);

    const shiftId = toPositiveInt(payload.shift_id);
    if (!shiftId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'shift_id is required.', 422);
    const terminalId = normalizeTerminalId(payload.terminal_id);
    if (!terminalId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'terminal_id is required.', 422);

    const shift = await posRepository.getTerminalShiftById(shiftId, { transaction, lock: Boolean(transaction) });
    if (!shift) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS shift not found.', 404);
    if (String(shift.status || '').toLowerCase() !== 'open') {
        throw paymentError(DomainErrorCode.CONFLICT, 'Payment collection requires an open POS shift.', 409, {
            reason_code: 'POS_SHIFT_NOT_OPEN'
        });
    }
    if (toPositiveInt(shift.cashier_id) !== shiftOwnerUserId) {
        throw paymentError(DomainErrorCode.AUTHORIZATION_FAILED, 'Only the active register operator may collect this payment.', 403, {
            reason_code: 'POS_SHIFT_OWNER_REQUIRED'
        });
    }
    if (normalizeTerminalId(shift.terminal_id) !== terminalId) {
        throw paymentError(DomainErrorCode.CONFLICT, 'terminal_id does not match the active POS shift.', 409, {
            reason_code: 'POS_SHIFT_TERMINAL_MISMATCH'
        });
    }

    const locationId = toPositiveInt(shift.location_id);
    if (!locationId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'The active POS shift has no location scope.', 422);
    if (payload.location_id != null && toPositiveInt(payload.location_id) !== locationId) {
        throw paymentError(DomainErrorCode.AUTHORIZATION_FAILED, 'location_id does not match the active POS shift.', 403, {
            reason_code: 'POS_SHIFT_LOCATION_MISMATCH'
        });
    }

    return { userId, shiftId, terminalId, locationId, shift };
};

const assertSessionScope = (session, scope) => {
    if (toPositiveInt(session?.cashier_id) !== scope.userId || toPositiveInt(session?.shift_id) !== scope.shiftId) {
        throw paymentError(DomainErrorCode.AUTHORIZATION_FAILED, 'Payment session is outside the active cashier shift.', 403, {
            reason_code: 'POS_PAYMENT_SESSION_SCOPE_DENIED'
        });
    }
    if (toPositiveInt(session?.location_id) !== scope.locationId || normalizeTerminalId(session?.terminal_id) !== scope.terminalId) {
        throw paymentError(DomainErrorCode.AUTHORIZATION_FAILED, 'Payment session scope does not match the active terminal.', 403, {
            reason_code: 'POS_PAYMENT_SESSION_SCOPE_MISMATCH'
        });
    }
};

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

const calculateBalance = (session, allocations = []) => {
    const total = round4(session?.total_amount);
    const paid = round4(allocations
        .filter((allocation) => allocation?.status === 'successful')
        .reduce((sum, allocation) => sum + Number(allocation.applied_amount || 0), 0));
    const remaining = round4(Math.max(total - paid, 0));
    const status = ['cancelled', 'completed'].includes(session?.status)
        ? session.status
        : remaining <= 0
            ? 'ready_to_complete'
            : paid > 0
                ? 'partially_paid'
                : 'open';
    return { paid, remaining, status };
};

const publicAllocation = (row) => {
    const allocation = toPlain(row) || {};
    return {
        ...allocation,
        applied_amount: round4(allocation.applied_amount),
        cash_tendered: allocation.cash_tendered == null ? null : round4(allocation.cash_tendered),
        change_amount: allocation.change_amount == null ? null : round4(allocation.change_amount)
    };
};

const publicSession = (row, allocations = []) => {
    const session = toPlain(row) || {};
    const balance = calculateBalance(session, allocations);
    return {
        ...session,
        snapshot: parseStoredSnapshot(session.snapshot),
        total_amount: round4(session.total_amount),
        subtotal_amount: round4(session.subtotal_amount),
        paid_amount: balance.paid,
        remaining_amount: balance.remaining,
        status: balance.status,
        allocations: allocations.map(publicAllocation)
    };
};

const loadSession = async (posRepository, sessionId, options = {}) => {
    const session = await posRepository.getPosPaymentSessionById(sessionId, options);
    if (!session) return null;
    const allocations = await posRepository.listPosPaymentAllocationsForSession(sessionId, options);
    return { session, allocations };
};

const updateBalance = async (posRepository, session, allocations, options) => {
    const balance = calculateBalance(session, allocations);
    const updated = await posRepository.updatePosPaymentSession(session.pos_payment_session_id, {
        paid_amount: balance.paid,
        remaining_amount: balance.remaining,
        status: balance.status
    }, options);
    return { session: updated || { ...session, ...balance }, allocations, balance };
};

const buildPricingPayload = ({ snapshot, scope, parkedSaleId, idempotencyKey }) => {
    const pricingPayload = {
        ...snapshot,
        lines: snapshot.lines,
        idempotency_key: `split-quote:${idempotencyKey}`,
        shift_id: scope.shiftId,
        terminal_id: scope.terminalId,
        location_id: scope.locationId,
        parked_sale_id: parkedSaleId || undefined,
        payment_type: 'cash'
    };
    delete pricingPayload.total_amount;
    delete pricingPayload.subtotal_amount;
    delete pricingPayload.paid_amount;
    delete pricingPayload.remaining_amount;
    return pricingPayload;
};

export const buildCreatePosPaymentSessionUseCase = ({ posRepository, quotePosCheckoutUseCase }) => async ({ payload = {}, user }) => {
    let transaction = null;
    try {
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        if (idempotencyKey.length < 8) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required.', 422);
        if (typeof quotePosCheckoutUseCase !== 'function') {
            throw paymentError(DomainErrorCode.INTERNAL_ERROR, 'POS pricing service is unavailable.', 500);
        }

        const discountApproval = extractDiscountApprovalInput(payload.snapshot);
        const itemDiscountApprovals = extractItemDiscountApprovalInputs(payload.snapshot);
        const snapshot = normalizeSnapshot(payload.snapshot);

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const parkedSaleId = payload.parked_sale_id == null ? null : toPositiveInt(payload.parked_sale_id);
        if (payload.parked_sale_id != null && !parkedSaleId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'parked_sale_id must be a positive integer.', 422);
        if (parkedSaleId) {
            const parkedSale = await posRepository.getParkedSaleById(parkedSaleId, { transaction, lock: true });
            if (!parkedSale) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Parked POS sale not found.', 404);
            if (toPositiveInt(parkedSale.shift_id) !== scope.shiftId || toPositiveInt(parkedSale.cashier_id) !== scope.userId || toPositiveInt(parkedSale.location_id) !== scope.locationId) {
                throw paymentError(DomainErrorCode.AUTHORIZATION_FAILED, 'Parked POS sale is outside the active cashier shift.', 403, { reason_code: 'PARKED_SALE_SCOPE_DENIED' });
            }
            if (parkedSale.status !== 'claimed') {
                throw paymentError(DomainErrorCode.CONFLICT, 'Parked POS sale must be claimed before payment collection.', 409, { reason_code: 'PARKED_SALE_NOT_CLAIMED' });
            }
        }

        const requestPayload = {
            shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            location_id: scope.locationId,
            parked_sale_id: parkedSaleId,
            snapshot,
            line_count: snapshot.lines.length,
            quantity_total: round4(snapshot.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0))
        };
        const requestHash = hashPayload(requestPayload);
        const existing = await posRepository.findPosPaymentSessionByIdempotencyKey(idempotencyKey, { transaction, lock: true });
        if (existing) {
            if (String(existing.request_hash || '') !== requestHash) {
                throw paymentError(DomainErrorCode.CONFLICT, 'idempotency_key was already used with a different payment-session payload.', 409, { reason_code: 'POS_PAYMENT_SESSION_IDEMPOTENCY_CONFLICT' });
            }
            const loaded = await loadSession(posRepository, existing.pos_payment_session_id, { transaction });
            await finishTransaction(transaction, 'commit');
            return ok({ ...publicSession(loaded.session, loaded.allocations), idempotent_replay: true }, 'POS payment session replayed');
        }

        const activeSession = await posRepository.findActivePosPaymentSessionForScope({
            cashierId: scope.userId,
            shiftId: scope.shiftId,
            terminalId: scope.terminalId,
            locationId: scope.locationId
        }, { transaction, lock: true });
        if (activeSession) {
            const loaded = await loadSession(posRepository, activeSession.pos_payment_session_id, { transaction });
            await finishTransaction(transaction, 'commit');
            return ok({
                ...publicSession(loaded.session, loaded.allocations),
                idempotent_replay: false,
                resumed_active_session: true
            }, 'Active POS payment session resumed');
        }

        const quoteResult = await quotePosCheckoutUseCase({
            payload: buildPricingPayload({ snapshot, scope, parkedSaleId, idempotencyKey }),
            userId: scope.userId,
            user,
            transaction,
            quoteOnly: true,
            discountApproval,
            itemDiscountApprovals
        });
        if (!quoteResult?.success) {
            throw quoteResult?.error || paymentError(DomainErrorCode.CONFLICT, 'POS payment total could not be validated.', 409);
        }
        const subtotalAmount = round4(quoteResult.data?.quote?.subtotal_amount);
        const totalAmount = round4(quoteResult.data?.quote?.total_amount);
        if (totalAmount <= 0) {
            throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'The server-calculated payment total must be greater than 0.', 422);
        }
        const persistedSnapshot = attachItemDiscountApprovalProofs(
            attachDiscountApprovalProof(
                snapshot,
                buildDiscountApprovalProof({
                    snapshot,
                    verifiedApproval: quoteResult.data?.quote?.discount_approval
                })
            ),
            buildItemDiscountApprovalProofs({
                snapshot,
                verifiedApprovals: quoteResult.data?.quote?.item_discount_approvals
            })
        );

        const created = await posRepository.createPosPaymentSession({
            session_reference: `PAY-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            status: 'open',
            cashier_id: scope.userId,
            shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            location_id: scope.locationId,
            parked_sale_id: parkedSaleId,
            snapshot: persistedSnapshot,
            line_count: requestPayload.line_count,
            quantity_total: requestPayload.quantity_total,
            subtotal_amount: subtotalAmount,
            total_amount: totalAmount,
            paid_amount: 0,
            remaining_amount: totalAmount
        }, { transaction });
        if (String(created?.request_hash || '') !== requestHash) {
            throw paymentError(DomainErrorCode.CONFLICT, 'idempotency_key was already used with a different payment-session payload.', 409, { reason_code: 'POS_PAYMENT_SESSION_IDEMPOTENCY_CONFLICT' });
        }
        await finishTransaction(transaction, 'commit');
        return ok({ ...publicSession(created, []), idempotent_replay: false }, 'POS payment session created');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to create POS payment session'));
    }
};

export const buildGetPosPaymentSessionUseCase = ({ posRepository }) => async ({ paymentSessionId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedId = toPositiveInt(paymentSessionId);
        if (!normalizedId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session id must be a positive integer.', 400);
        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);
        await finishTransaction(transaction, 'commit');
        return ok(publicSession(loaded.session, loaded.allocations));
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to retrieve POS payment session'));
    }
};

export const buildGetActivePosPaymentSessionUseCase = ({ posRepository }) => async ({ payload = {}, user }) => {
    let transaction = null;
    try {
        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const activeSession = await posRepository.findActivePosPaymentSessionForScope({
            cashierId: scope.userId,
            shiftId: scope.shiftId,
            terminalId: scope.terminalId,
            locationId: scope.locationId
        }, { transaction, lock: true });
        if (!activeSession) {
            await finishTransaction(transaction, 'commit');
            return ok(null, 'No active POS payment session');
        }
        const loaded = await loadSession(posRepository, activeSession.pos_payment_session_id, { transaction, lock: true });
        assertSessionScope(loaded.session, scope);
        await finishTransaction(transaction, 'commit');
        return ok(publicSession(loaded.session, loaded.allocations), 'Active POS payment session retrieved');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to retrieve active POS payment session'));
    }
};

export const buildAddPosPaymentAllocationUseCase = ({ posRepository }) => async ({ paymentSessionId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedSessionId = toPositiveInt(paymentSessionId);
        if (!normalizedSessionId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session id must be a positive integer.', 400);
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        if (idempotencyKey.length < 8) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required.', 422);
        const paymentMethod = String(payload.payment_method || '').trim().toLowerCase();
        if (!PAYMENT_METHODS.has(paymentMethod)) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported split-payment method.', 422);
        const paymentHandoffMode = String(payload.payment_handoff_mode || (paymentMethod === 'cash' ? 'internal' : 'external')).trim().toLowerCase();
        if (!['external', 'internal'].includes(paymentHandoffMode)) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported payment handoff mode.', 422);
        const manualPaymentReceived = paymentMethod !== 'cash' && payload.manual_payment_received === true;
        const paymentProvider = manualPaymentReceived
            ? 'merchant_owned'
            : String(payload.payment_provider || '').trim().toLowerCase();
        const requestedAmount = round4(payload.amount);
        if (requestedAmount <= 0) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'amount must be greater than 0.', 422);

        let outcome = String(payload.outcome || '').trim().toLowerCase();
        if (!outcome) outcome = paymentMethod === 'cash' || manualPaymentReceived ? 'successful' : 'pending';
        if (manualPaymentReceived) outcome = 'successful';
        if (!ALLOCATION_OUTCOMES.has(outcome)) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported payment allocation outcome.', 422);
        if (paymentMethod !== 'cash' && paymentHandoffMode === 'internal') {
            throw paymentError(DomainErrorCode.CONFLICT, 'Internal non-cash handoff is unavailable until POS compliance controls are enabled.', 409, { reason_code: 'PAYMENT_HANDOFF_COMPLIANCE_REQUIRED' });
        }
        if (paymentMethod !== 'cash' && outcome === 'successful' && !manualPaymentReceived) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Non-cash allocations require provider confirmation before success.', 409, { reason_code: 'PAYMENT_CONFIRMATION_REQUIRED' });
        }
        if (paymentMethod !== 'cash' && !manualPaymentReceived && !String(payload.payment_reference || '').trim()) {
            throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment_reference is required for non-cash allocations.', 422);
        }

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedSessionId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);

        const existing = await posRepository.findPosPaymentAllocationByIdempotencyKey(normalizedSessionId, idempotencyKey, { transaction, lock: true });
        const requestHash = hashPayload({
            payment_method: paymentMethod,
            payment_handoff_mode: paymentHandoffMode,
            amount: requestedAmount,
            outcome,
            manual_payment_received: manualPaymentReceived,
            payment_reference: String(payload.payment_reference || '').trim(),
            payment_provider: paymentProvider
        });
        if (existing) {
            if (String(existing.request_hash || '') !== requestHash) throw paymentError(DomainErrorCode.CONFLICT, 'Allocation idempotency_key was already used with a different payload.', 409, { reason_code: 'POS_PAYMENT_ALLOCATION_IDEMPOTENCY_CONFLICT' });
            await finishTransaction(transaction, 'commit');
            return ok({ session: publicSession(loaded.session, loaded.allocations), allocation: publicAllocation(existing), idempotent_replay: true }, 'POS payment allocation replayed');
        }

        const balance = calculateBalance(loaded.session, loaded.allocations);
        if (loaded.session.status === 'cancelled' || loaded.session.status === 'completed') throw paymentError(DomainErrorCode.CONFLICT, 'Payment session is no longer collectable.', 409, { reason_code: 'POS_PAYMENT_SESSION_CLOSED' });
        if (balance.remaining <= 0) throw paymentError(DomainErrorCode.CONFLICT, 'Payment session is already fully allocated.', 409, { reason_code: 'POS_PAYMENT_SESSION_ALREADY_PAID' });
        if (paymentMethod !== 'cash' && requestedAmount > balance.remaining) {
            throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'Non-cash allocation cannot exceed the remaining balance.', 422, { reason_code: 'NON_CASH_OVERPAYMENT' });
        }

        const cashTendered = paymentMethod === 'cash' ? requestedAmount : null;
        // Keep the intended allocation amount even while a digital attempt is
        // pending. Paid/remaining only include successful rows, so this value
        // can be reconciled against the provider without counting it early.
        const appliedAmount = round4(Math.min(requestedAmount, balance.remaining));
        const allocation = await posRepository.createPosPaymentAllocation({
            allocation_reference: `ALLOC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            session_id: normalizedSessionId,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            status: outcome,
            payment_method: paymentMethod,
            payment_handoff_mode: paymentHandoffMode,
            applied_amount: appliedAmount,
            cash_tendered: cashTendered,
            change_amount: outcome === 'successful' && paymentMethod === 'cash' ? round4(Math.max(cashTendered - appliedAmount, 0)) : null,
            payment_reference: String(payload.payment_reference || '').trim() || null,
            payment_provider: paymentProvider || null,
            failure_code: outcome === 'failed' ? String(payload.failure_code || '').trim() || 'PAYMENT_FAILED' : null,
            failure_reason: outcome === 'failed' ? String(payload.failure_reason || '').trim() || null : null,
            cashier_id: scope.userId,
            shift_id: scope.shiftId,
            terminal_id: scope.terminalId,
            location_id: scope.locationId,
            confirmed_at: outcome === 'successful' ? new Date() : null
        }, { transaction });
        if (String(allocation?.request_hash || '') !== requestHash) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Allocation idempotency_key was already used with a different payload.', 409, { reason_code: 'POS_PAYMENT_ALLOCATION_IDEMPOTENCY_CONFLICT' });
        }
        const allocations = [...loaded.allocations, allocation];
        const refreshed = await updateBalance(posRepository, loaded.session, allocations, { transaction, lock: true });
        await finishTransaction(transaction, 'commit');
        return ok({ session: publicSession(refreshed.session, allocations), allocation: publicAllocation(allocation), idempotent_replay: false }, 'POS payment allocation recorded');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to record POS payment allocation'));
    }
};

export const buildCancelPosPaymentAllocationUseCase = ({ posRepository }) => async ({ paymentSessionId, allocationId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedSessionId = toPositiveInt(paymentSessionId);
        const normalizedAllocationId = toPositiveInt(allocationId);
        if (!normalizedSessionId || !normalizedAllocationId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session and allocation ids must be positive integers.', 400);
        const reason = String(payload.reason || '').trim();
        if (reason.length < 3) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'reason is required to cancel a payment allocation.', 422);

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedSessionId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);
        const allocation = await posRepository.getPosPaymentAllocationById(normalizedAllocationId, { transaction, lock: true });
        if (!allocation || toPositiveInt(allocation.session_id) !== normalizedSessionId) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment allocation not found.', 404);
        if (allocation.status === 'cancelled') {
            await finishTransaction(transaction, 'commit');
            return ok({ session: publicSession(loaded.session, loaded.allocations), allocation: publicAllocation(allocation), idempotent_replay: true }, 'POS payment allocation already cancelled');
        }
        if (allocation.status === 'reversed') {
            await finishTransaction(transaction, 'commit');
            return ok({ session: publicSession(loaded.session, loaded.allocations), allocation: publicAllocation(allocation), idempotent_replay: true }, 'POS payment allocation already reversed');
        }
        if (['completed', 'cancelled'].includes(loaded.session.status)) throw paymentError(DomainErrorCode.CONFLICT, 'Closed payment sessions cannot be changed.', 409, { reason_code: 'POS_PAYMENT_SESSION_CLOSED' });
        const isMerchantOwnedManualDigital = allocation.status === 'successful'
            && allocation.payment_method !== 'cash'
            && String(allocation.payment_provider || '').trim().toLowerCase() === 'merchant_owned';
        if (allocation.status === 'successful' && allocation.payment_method !== 'cash' && !isMerchantOwnedManualDigital) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Provider-confirmed digital payments require a provider refund before reversal.', 409, {
                reason_code: 'PAYMENT_PROVIDER_REFUND_REQUIRED'
            });
        }
        const successfulManualReversal = allocation.status === 'successful'
            && (allocation.payment_method === 'cash' || isMerchantOwnedManualDigital);
        const cancelled = await posRepository.updatePosPaymentAllocation(normalizedAllocationId, successfulManualReversal ? {
            status: 'reversed',
            reversed_by: scope.userId,
            reversed_at: new Date(),
            reversal_reason: reason
        } : {
            status: 'cancelled',
            cancelled_by: scope.userId,
            cancelled_at: new Date(),
            cancel_reason: reason
        }, { transaction, lock: true });
        const allocations = loaded.allocations.map((row) => toPositiveInt(row.pos_payment_allocation_id) === normalizedAllocationId ? cancelled : row);
        const refreshed = await updateBalance(posRepository, loaded.session, allocations, { transaction, lock: true });
        await finishTransaction(transaction, 'commit');
        return ok({ session: publicSession(refreshed.session, allocations), allocation: publicAllocation(cancelled), idempotent_replay: false }, successfulManualReversal
            ? 'POS payment allocation reversed'
            : 'POS payment allocation cancelled');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to cancel POS payment allocation'));
    }
};

export const buildConfirmPosPaymentAllocationUseCase = ({ posRepository, providerConfirmationVerifier }) => async ({ paymentSessionId, allocationId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedSessionId = toPositiveInt(paymentSessionId);
        const normalizedAllocationId = toPositiveInt(allocationId);
        const providerEventId = String(payload.provider_event_id || '').trim();
        if (!normalizedSessionId || !normalizedAllocationId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session and payment allocation ids must be positive integers.', 400);
        if (providerEventId.length < 8) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'provider_event_id is required.', 422);
        if (typeof providerConfirmationVerifier !== 'function') {
            throw paymentError(DomainErrorCode.INTERNAL_ERROR, 'POS payment provider confirmation service is unavailable.', 503, {
                reason_code: 'PAYMENT_PROVIDER_CONFIRMATION_UNAVAILABLE'
            });
        }

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedSessionId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);

        const allocation = await posRepository.getPosPaymentAllocationById(normalizedAllocationId, { transaction, lock: true });
        if (!allocation || toPositiveInt(allocation.session_id) !== normalizedSessionId) {
            throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment allocation not found.', 404);
        }
        if (allocation.payment_method === 'cash') {
            throw paymentError(DomainErrorCode.CONFLICT, 'Cash allocations are confirmed at collection time.', 409, {
                reason_code: 'CASH_PROVIDER_CONFIRMATION_NOT_ALLOWED'
            });
        }
        if (allocation.status === 'successful') {
            if (allocation.provider_event_id && allocation.provider_event_id !== providerEventId) {
                throw paymentError(DomainErrorCode.CONFLICT, 'A different provider event has already confirmed this allocation.', 409, {
                    reason_code: 'PAYMENT_PROVIDER_EVENT_MISMATCH'
                });
            }
            await finishTransaction(transaction, 'commit');
            return ok({ session: publicSession(loaded.session, loaded.allocations), allocation: publicAllocation(allocation), idempotent_replay: true }, 'POS payment allocation already confirmed');
        }
        if (allocation.status !== 'pending') {
            throw paymentError(DomainErrorCode.CONFLICT, 'Only pending digital allocations can be provider-confirmed.', 409, {
                reason_code: 'PAYMENT_ALLOCATION_NOT_PENDING'
            });
        }
        const existingProviderEvent = typeof posRepository.findPosPaymentAllocationByProviderEventId === 'function'
            ? await posRepository.findPosPaymentAllocationByProviderEventId(providerEventId, { transaction, lock: true })
            : null;
        if (existingProviderEvent && toPositiveInt(existingProviderEvent.pos_payment_allocation_id) !== normalizedAllocationId) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Provider event has already been accepted for another payment allocation.', 409, {
                reason_code: 'PAYMENT_PROVIDER_EVENT_REPLAY'
            });
        }

        let verification;
        try {
            verification = await providerConfirmationVerifier({
                session: loaded.session,
                allocation,
                payload
            });
        } catch (error) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Provider confirmation could not be verified.', 409, {
                reason_code: 'PAYMENT_PROVIDER_CONFIRMATION_INVALID',
                cause: error?.message
            });
        }
        if (verification?.verified !== true) {
            throw paymentError(DomainErrorCode.CONFLICT, verification?.reason || 'Provider confirmation could not be verified.', 409, {
                reason_code: 'PAYMENT_PROVIDER_CONFIRMATION_INVALID'
            });
        }

        const confirmed = await posRepository.updatePosPaymentAllocation(normalizedAllocationId, {
            status: 'successful',
            applied_amount: round4(allocation.applied_amount),
            provider_event_id: String(verification.provider_event_id || providerEventId).trim(),
            confirmed_at: verification.provider_confirmed_at || new Date()
        }, { transaction, lock: true });
        const allocations = loaded.allocations.map((row) => (
            toPositiveInt(row.pos_payment_allocation_id) === normalizedAllocationId ? confirmed : row
        ));
        const refreshed = await updateBalance(posRepository, loaded.session, allocations, { transaction, lock: true });
        await finishTransaction(transaction, 'commit');
        return ok({ session: publicSession(refreshed.session, allocations), allocation: publicAllocation(confirmed), idempotent_replay: false }, 'POS payment allocation provider-confirmed');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to confirm POS payment allocation'));
    }
};

export const buildReconcilePosPaymentAllocationUseCase = ({ posRepository, providerReconciler }) => async ({ paymentSessionId, allocationId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedSessionId = toPositiveInt(paymentSessionId);
        const normalizedAllocationId = toPositiveInt(allocationId);
        if (!normalizedSessionId || !normalizedAllocationId) {
            throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session and payment allocation ids must be positive integers.', 400);
        }
        if (typeof providerReconciler !== 'function') {
            throw paymentError(DomainErrorCode.INTERNAL_ERROR, 'POS payment provider reconciliation service is unavailable.', 503, {
                reason_code: 'PAYMENT_PROVIDER_RECONCILIATION_UNAVAILABLE'
            });
        }

        // Verify cashier scope before the external provider call, then repeat
        // the same checks under a lock before persisting the provider result.
        const preflightScope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction: null });
        const preflightLoaded = await loadSession(posRepository, normalizedSessionId);
        if (!preflightLoaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(preflightLoaded.session, preflightScope);
        if (['completed', 'cancelled'].includes(preflightLoaded.session.status)) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Closed payment sessions cannot be provider-reconciled.', 409, {
                reason_code: 'POS_PAYMENT_SESSION_CLOSED'
            });
        }
        const preflightAllocation = await posRepository.getPosPaymentAllocationById(normalizedAllocationId);
        if (!preflightAllocation || toPositiveInt(preflightAllocation.session_id) !== normalizedSessionId) {
            throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment allocation not found.', 404);
        }
        if (preflightAllocation.payment_method === 'cash') {
            throw paymentError(DomainErrorCode.CONFLICT, 'Cash allocations do not use provider reconciliation.', 409, {
                reason_code: 'CASH_PROVIDER_RECONCILIATION_NOT_ALLOWED'
            });
        }
        if (!['pending', 'successful', 'reversed'].includes(preflightAllocation.status)) {
            throw paymentError(DomainErrorCode.CONFLICT, 'This payment allocation cannot be provider-reconciled.', 409, {
                reason_code: 'PAYMENT_ALLOCATION_NOT_RECONCILABLE'
            });
        }

        let reconciliation;
        try {
            reconciliation = await providerReconciler({
                session: preflightLoaded.session,
                allocation: preflightAllocation,
                payload
            });
        } catch (error) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Payment provider reconciliation failed.', 409, {
                reason_code: 'PAYMENT_PROVIDER_RECONCILIATION_FAILED',
                cause: error?.message
            });
        }
        if (reconciliation?.reconciled !== true) {
            throw paymentError(DomainErrorCode.CONFLICT, reconciliation?.reason || 'Payment provider reconciliation failed.', 409, {
                reason_code: reconciliation?.reason_code || 'PAYMENT_PROVIDER_RECONCILIATION_FAILED',
                ...(reconciliation?.details || {})
            });
        }

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedSessionId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);
        if (['completed', 'cancelled'].includes(loaded.session.status)) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Closed payment sessions cannot be provider-reconciled.', 409, {
                reason_code: 'POS_PAYMENT_SESSION_CLOSED'
            });
        }
        const allocation = await posRepository.getPosPaymentAllocationById(normalizedAllocationId, { transaction, lock: true });
        if (!allocation || toPositiveInt(allocation.session_id) !== normalizedSessionId) {
            throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment allocation not found.', 404);
        }

        const paymentEventId = String(reconciliation.provider_event_id || '').trim();
        if (paymentEventId.length < 8) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Provider reconciliation returned no stable payment event identity.', 409, {
                reason_code: 'PAYMENT_PROVIDER_EVENT_ID_REQUIRED'
            });
        }
        const paymentReplay = await posRepository.findPosPaymentAllocationByProviderEventId(paymentEventId, { transaction, lock: true });
        if (paymentReplay && toPositiveInt(paymentReplay.pos_payment_allocation_id) !== normalizedAllocationId) {
            throw paymentError(DomainErrorCode.CONFLICT, 'Provider payment has already been accepted for another allocation.', 409, {
                reason_code: 'PAYMENT_PROVIDER_EVENT_REPLAY'
            });
        }

        let updatePayload;
        if (reconciliation.action === 'reverse') {
            const refundEventId = String(reconciliation.provider_refund_event_id || '').trim();
            if (refundEventId.length < 8) {
                throw paymentError(DomainErrorCode.CONFLICT, 'Provider refund reconciliation returned no stable event identity.', 409, {
                    reason_code: 'PAYMENT_PROVIDER_REFUND_EVENT_ID_REQUIRED'
                });
            }
            const refundReplay = typeof posRepository.findPosPaymentAllocationByProviderRefundEventId === 'function'
                ? await posRepository.findPosPaymentAllocationByProviderRefundEventId(refundEventId, { transaction, lock: true })
                : null;
            if (refundReplay && toPositiveInt(refundReplay.pos_payment_allocation_id) !== normalizedAllocationId) {
                throw paymentError(DomainErrorCode.CONFLICT, 'Provider refund has already been accepted for another allocation.', 409, {
                    reason_code: 'PAYMENT_PROVIDER_REFUND_EVENT_REPLAY'
                });
            }
            if (allocation.status === 'reversed' && allocation.provider_refund_event_id === refundEventId) {
                await finishTransaction(transaction, 'commit');
                return ok({ session: publicSession(loaded.session, loaded.allocations), allocation: publicAllocation(allocation), idempotent_replay: true }, 'POS payment allocation refund already reconciled');
            }
            if (!['pending', 'successful'].includes(allocation.status)) {
                throw paymentError(DomainErrorCode.CONFLICT, 'Only pending or successful digital allocations can be reversed from provider refund evidence.', 409, {
                    reason_code: 'PAYMENT_ALLOCATION_NOT_REVERSIBLE'
                });
            }
            updatePayload = {
                status: 'reversed',
                provider_event_id: paymentEventId,
                confirmed_at: reconciliation.provider_confirmed_at || allocation.confirmed_at || new Date(),
                provider_refund_ids: reconciliation.provider_refund_ids || [],
                provider_refund_event_id: refundEventId,
                provider_refund_status: reconciliation.provider_refund_status || 'succeeded',
                provider_refunded_at: reconciliation.provider_refunded_at || new Date(),
                reversed_by: scope.userId,
                reversed_at: reconciliation.provider_refunded_at || new Date(),
                reversal_reason: 'Full provider refund reconciled from PayMongo.'
            };
        } else if (reconciliation.action === 'confirm') {
            if (allocation.status === 'successful' && allocation.provider_event_id === paymentEventId) {
                await finishTransaction(transaction, 'commit');
                return ok({ session: publicSession(loaded.session, loaded.allocations), allocation: publicAllocation(allocation), idempotent_replay: true }, 'POS payment allocation already provider-reconciled');
            }
            if (allocation.status !== 'pending') {
                throw paymentError(DomainErrorCode.CONFLICT, 'Only pending digital allocations can be confirmed by provider reconciliation.', 409, {
                    reason_code: 'PAYMENT_ALLOCATION_NOT_PENDING'
                });
            }
            updatePayload = {
                status: 'successful',
                provider_event_id: paymentEventId,
                confirmed_at: reconciliation.provider_confirmed_at || new Date()
            };
        } else {
            throw paymentError(DomainErrorCode.CONFLICT, 'Provider reconciliation returned an unsupported action.', 409, {
                reason_code: 'PAYMENT_PROVIDER_RECONCILIATION_ACTION_INVALID'
            });
        }

        const reconciled = await posRepository.updatePosPaymentAllocation(normalizedAllocationId, updatePayload, { transaction, lock: true });
        const allocations = loaded.allocations.map((row) => (
            toPositiveInt(row.pos_payment_allocation_id) === normalizedAllocationId ? reconciled : row
        ));
        const refreshed = await updateBalance(posRepository, loaded.session, allocations, { transaction, lock: true });
        await finishTransaction(transaction, 'commit');
        return ok({ session: publicSession(refreshed.session, allocations), allocation: publicAllocation(reconciled), idempotent_replay: false }, reconciliation.action === 'reverse'
            ? 'POS payment allocation refund reconciled'
            : 'POS payment allocation provider-reconciled');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to reconcile POS payment allocation'));
    }
};

export const buildCancelPosPaymentSessionUseCase = ({ posRepository }) => async ({ paymentSessionId, payload = {}, user }) => {
    let transaction = null;
    try {
        const normalizedId = toPositiveInt(paymentSessionId);
        if (!normalizedId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session id must be a positive integer.', 400);
        const reason = String(payload.reason || '').trim();
        if (reason.length < 3) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'reason is required to cancel a payment session.', 422);

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);
        if (loaded.session.status === 'cancelled') {
            await finishTransaction(transaction, 'commit');
            return ok(publicSession(loaded.session, loaded.allocations), 'POS payment session already cancelled');
        }
        if (loaded.session.status === 'completed') throw paymentError(DomainErrorCode.CONFLICT, 'Completed payment sessions cannot be cancelled.', 409, { reason_code: 'POS_PAYMENT_SESSION_COMPLETED' });
        const balance = calculateBalance(loaded.session, loaded.allocations);
        if (balance.paid > 0) throw paymentError(DomainErrorCode.CONFLICT, 'Cancel successful allocations before cancelling the payment session.', 409, { reason_code: 'PAYMENT_ALLOCATION_REVERSAL_REQUIRED' });

        const cancelled = await posRepository.updatePosPaymentSession(normalizedId, {
            status: 'cancelled',
            cancelled_by: scope.userId,
            cancelled_at: new Date(),
            cancel_reason: reason,
            paid_amount: 0,
            remaining_amount: balance.remaining
        }, { transaction, lock: true });
        await finishTransaction(transaction, 'commit');
        return ok(publicSession(cancelled, loaded.allocations), 'POS payment session cancelled');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to cancel POS payment session'));
    }
};

const buildCompletionCheckoutPayload = ({ session, allocations, scope }) => {
    const storedSnapshot = parseStoredSnapshot(session?.snapshot);
    if (!storedSnapshot) {
        throw paymentError(DomainErrorCode.CONFLICT, 'The saved payment session has an invalid checkout snapshot. Keep the session open and contact a manager.', 409, {
            reason_code: 'POS_PAYMENT_SESSION_SNAPSHOT_INVALID'
        });
    }
    const sourceSnapshot = isPlainObject(storedSnapshot.checkout_payload)
        ? storedSnapshot.checkout_payload
        : storedSnapshot;
    const sourceLines = Array.isArray(sourceSnapshot.lines) ? sourceSnapshot.lines : [];
    if (sourceLines.length < 1) {
        throw paymentError(DomainErrorCode.CONFLICT, 'The saved payment session has no checkout lines. Keep the session open and contact a manager.', 409, {
            reason_code: 'POS_PAYMENT_SESSION_LINES_MISSING'
        });
    }
    const lines = sourceLines.map((line) => {
        const safeLine = isPlainObject(line) ? { ...line } : {};
        // The normal checkout use case revalidates any supplied price override
        // against the locked server item and operator permission. The final
        // canonical total is checked against the session total below.
        delete safeLine.base_sale_price;
        return safeLine;
    });
    const successful = allocations.filter((allocation) => allocation?.status === 'successful');
    const cashAllocations = successful.filter((allocation) => allocation?.payment_method === 'cash');
    const primaryAllocation = successful.find((allocation) => allocation?.payment_method === 'cash') || successful[0] || null;
    const paymentType = String(primaryAllocation?.payment_method || 'cash').trim().toLowerCase();
    const cashReceived = round4(cashAllocations.reduce((sum, allocation) => sum + Number(allocation.cash_tendered || 0), 0));
    const changeAmount = round4(cashAllocations.reduce((sum, allocation) => sum + Number(allocation.change_amount || 0), 0));
    const references = [...new Set(successful
        .map((allocation) => String(allocation.payment_reference || '').trim())
        .filter(Boolean))];
    const providers = [...new Set(successful
        .map((allocation) => String(allocation.payment_provider || '').trim())
        .filter(Boolean))];
    const paymentBreakdown = successful.map((allocation) => ({
        payment_type: allocation.payment_method,
        count: 1,
        amount: round4(allocation.applied_amount)
    }));

    const trustedDiscountApproval = extractTrustedDiscountApproval(sourceSnapshot);
    const trustedItemDiscountApprovals = extractTrustedItemDiscountApprovals(sourceSnapshot);
    const checkoutPayload = {
        ...sourceSnapshot,
        ...(isPlainObject(sourceSnapshot.governed_discount)
            ? { governed_discount: { ...sourceSnapshot.governed_discount } }
            : {}),
        lines,
        idempotency_key: `split-checkout:${String(session.session_reference || session.pos_payment_session_id)}`,
        shift_id: scope.shiftId,
        terminal_id: scope.terminalId,
        location_id: scope.locationId,
        payment_type: paymentType,
        payment_handoff_mode: paymentType === 'cash' ? 'internal' : 'external',
        payment_session_reference: String(session.session_reference || '').trim() || null,
        payment_reference: references.length === 1 ? references[0] : (references.length > 1 ? String(session.session_reference || '').trim() : null),
        payment_provider: providers.length === 1 ? providers[0] : (providers.length > 1 ? 'split' : null),
        payment_breakdown: paymentBreakdown,
        ...(cashAllocations.length > 0
            ? { cash_received: cashReceived, change_amount: changeAmount }
            : { cash_received: null, change_amount: null })
    };

    delete checkoutPayload.checkout_payload;
    delete checkoutPayload.total_amount;
    delete checkoutPayload.subtotal_amount;
    delete checkoutPayload.paid_amount;
    delete checkoutPayload.remaining_amount;
    delete checkoutPayload.idempotency_key_input;
    delete checkoutPayload.item_discount_approval_proofs;
    if (isPlainObject(checkoutPayload.governed_discount)) {
        delete checkoutPayload.governed_discount.approval_proof;
        delete checkoutPayload.governed_discount.approval_verified;
    }

    return {
        checkoutPayload,
        trustedDiscountApproval,
        trustedItemDiscountApprovals
    };
};

export const buildCompletePosPaymentSessionUseCase = ({ posRepository, checkoutPosUseCase }) => async ({ paymentSessionId, payload = {}, user, operatorSessionId = null }) => {
    let transaction = null;
    try {
        const normalizedId = toPositiveInt(paymentSessionId);
        const completionIdempotencyKey = String(payload.idempotency_key || '').trim();
        if (!normalizedId) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'payment session id must be a positive integer.', 400);
        if (completionIdempotencyKey.length < 8) throw paymentError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required.', 422);
        if (typeof checkoutPosUseCase !== 'function') {
            throw paymentError(DomainErrorCode.INTERNAL_ERROR, 'POS checkout service is unavailable.', 500);
        }

        transaction = await beginTransaction();
        const scope = await resolveOwnedOpenShift({ posRepository, payload, user, transaction });
        const loaded = await loadSession(posRepository, normalizedId, { transaction, lock: true });
        if (!loaded) throw paymentError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS payment session not found.', 404);
        assertSessionScope(loaded.session, scope);

        if (loaded.session.status === 'completed') {
            const completedTransaction = loaded.session.completed_transaction_id
                ? await posRepository.getTransactionById(loaded.session.completed_transaction_id, { transaction })
                : null;
            await finishTransaction(transaction, 'commit');
            return ok({
                session: publicSession(loaded.session, loaded.allocations),
                transaction: completedTransaction,
                idempotent_replay: true
            }, 'POS split payment session already completed');
        }
        if (loaded.session.status === 'cancelled') {
            throw paymentError(DomainErrorCode.CONFLICT, 'Cancelled payment sessions cannot be completed.', 409, { reason_code: 'POS_PAYMENT_SESSION_CANCELLED' });
        }

        const balance = calculateBalance(loaded.session, loaded.allocations);
        const unresolvedAllocations = loaded.allocations.filter((allocation) => ['pending', 'failed'].includes(allocation?.status));
        if (unresolvedAllocations.length > 0) {
            throw paymentError(DomainErrorCode.CONFLICT, 'All pending or failed payment attempts must be resolved before completing the sale.', 409, {
                reason_code: 'PAYMENT_ALLOCATION_UNRESOLVED',
                allocation_ids: unresolvedAllocations.map((allocation) => allocation.pos_payment_allocation_id)
            });
        }
        if (Math.abs(balance.remaining) > 0.0001 || Math.abs(balance.paid - round4(loaded.session.total_amount)) > 0.0001) {
            throw paymentError(DomainErrorCode.CONFLICT, 'The payment session is not fully paid.', 409, {
                reason_code: 'POS_PAYMENT_SESSION_BALANCE_NOT_ZERO',
                total_amount: round4(loaded.session.total_amount),
                paid_amount: balance.paid,
                remaining_amount: balance.remaining
            });
        }

        const completionPayload = buildCompletionCheckoutPayload({
            session: loaded.session,
            allocations: loaded.allocations,
            scope
        });
        let completedSession = null;
        const checkoutResult = await checkoutPosUseCase({
            payload: completionPayload.checkoutPayload,
            userId: scope.userId,
            user,
            operatorSessionId,
            transaction,
            trustedDiscountApproval: completionPayload.trustedDiscountApproval,
            trustedItemDiscountApprovals: completionPayload.trustedItemDiscountApprovals,
            beforeCommit: async ({ transactionId }) => {
                completedSession = await posRepository.updatePosPaymentSession(normalizedId, {
                    status: 'completed',
                    paid_amount: balance.paid,
                    remaining_amount: 0,
                    completed_transaction_id: transactionId,
                    completed_at: new Date()
                }, { transaction, lock: true });
                if (loaded.session.parked_sale_id && typeof posRepository.updateParkedSale === 'function') {
                    await posRepository.updateParkedSale(loaded.session.parked_sale_id, {
                        status: 'completed',
                        completed_transaction_id: transactionId,
                        completed_at: new Date()
                    }, { transaction, lock: true });
                }
            }
        });
        if (!checkoutResult?.success) throw checkoutResult?.error || paymentError(DomainErrorCode.CONFLICT, 'POS checkout could not be completed.', 409);

        const completedTransaction = checkoutResult.data?.transaction || null;
        const canonicalTotal = round4(completedTransaction?.total_amount);
        if (!completedTransaction || Math.abs(canonicalTotal - round4(loaded.session.total_amount)) > 0.0001) {
            throw paymentError(DomainErrorCode.CONFLICT, 'The cart total changed while completing split payment. Restart the payment session.', 409, {
                reason_code: 'POS_PAYMENT_SESSION_TOTAL_CHANGED',
                session_total_amount: round4(loaded.session.total_amount),
                canonical_total_amount: canonicalTotal
            });
        }

        await finishTransaction(transaction, 'commit');
        return ok({
            session: publicSession(completedSession || { ...loaded.session, status: 'completed', completed_transaction_id: completedTransaction.pos_transaction_id }, loaded.allocations),
            transaction: completedTransaction,
            idempotent_replay: Boolean(checkoutResult.data?.idempotent_replay)
        }, 'POS split payment sale completed');
    } catch (error) {
        await finishTransaction(transaction, 'rollback');
        return fail(mapPosUseCaseError(error, 'Failed to complete POS split payment'));
    }
};
