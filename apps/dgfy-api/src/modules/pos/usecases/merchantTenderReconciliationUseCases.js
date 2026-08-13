import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import dbStore from '../../../utils/dbStore.js';
import { mapPosUseCaseError } from './posUseCaseError.js';

const METHODS = ['gcash', 'maya', 'card', 'bank_transfer'];
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};
const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};
const hashPayload = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
const reconciliationError = (code, message, statusCode, details) => new DomainError(code, message, {
    statusCode,
    ...(details ? { details } : {})
});
const toPlain = (value) => value?.get ? value.get({ plain: true }) : value;

const normalizeObserved = (value = {}) => Object.fromEntries(METHODS.map((method) => [
    method,
    round4(value?.[method])
]));

const expectedAmounts = (expected = {}) => Object.fromEntries(METHODS.map((method) => [
    method,
    round4(expected?.breakdown?.[method]?.amount)
]));

const serializeRecord = (record) => {
    const plain = toPlain(record);
    if (!plain) return null;
    return {
        ...plain,
        expected_total: round4(plain.expected_total),
        observed_total: round4(plain.observed_total),
        variance_total: round4(plain.variance_total)
    };
};

const buildSnapshot = ({ shift, expected, latest }) => {
    const currentAmounts = expectedAmounts(expected);
    const latestExpected = latest?.expected_breakdown || {};
    const isStale = Boolean(latest) && METHODS.some((method) => (
        Math.abs(round4(latestExpected?.[method]?.amount) - currentAmounts[method]) > 0.0001
    ));
    return {
        shift: {
            shift_id: toPositiveInt(shift?.pos_terminal_shift_id),
            business_date: shift?.business_date || null,
            status: shift?.status || null,
            terminal_id: shift?.terminal_id || null,
            location_id: toPositiveInt(shift?.location_id),
            cashier_id: toPositiveInt(shift?.cashier_id),
            opened_at: shift?.opened_at || null,
            closed_at: shift?.closed_at || null
        },
        expected: {
            breakdown: expected?.breakdown || {},
            total: round4(expected?.total)
        },
        latest_reconciliation: serializeRecord(latest),
        is_stale: isStale
    };
};

const resolveShift = async (posRepository, shiftId, options = {}) => {
    const normalizedShiftId = toPositiveInt(shiftId);
    if (!normalizedShiftId) {
        throw reconciliationError(DomainErrorCode.VALIDATION_FAILED, 'shift id must be a positive integer.', 400);
    }
    const shift = await posRepository.getTerminalShiftById(normalizedShiftId, options);
    if (!shift) throw reconciliationError(DomainErrorCode.RESOURCE_NOT_FOUND, 'POS shift not found.', 404);
    return shift;
};

export const buildGetMerchantTenderReconciliationUseCase = ({ posRepository }) => async ({ shiftId }) => {
    try {
        const shift = await resolveShift(posRepository, shiftId);
        const normalizedShiftId = toPositiveInt(shift.pos_terminal_shift_id);
        const [expected, latest] = await Promise.all([
            posRepository.getMerchantTenderExpectedByShift(normalizedShiftId),
            posRepository.getLatestMerchantTenderReconciliation(normalizedShiftId)
        ]);
        return ok(buildSnapshot({ shift, expected, latest }));
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to load merchant tender reconciliation'));
    }
};

export const buildReviewMerchantTenderReconciliationUseCase = ({ posRepository }) => async ({ shiftId, payload = {}, user }) => {
    let transaction = null;
    try {
        const reviewerId = toPositiveInt(user?.user_id || user?.id);
        if (!reviewerId) throw reconciliationError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated manager is required.', 401);
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        if (idempotencyKey.length < 8) throw reconciliationError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required.', 422);
        const observed = normalizeObserved(payload.observed_breakdown);
        const reviewNote = String(payload.review_note || '').trim();
        const requestHash = hashPayload({ observed_breakdown: observed, review_note: reviewNote });

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        transaction = await sequelize.transaction();
        const shift = await resolveShift(posRepository, shiftId, { transaction, lock: true });
        const normalizedShiftId = toPositiveInt(shift.pos_terminal_shift_id);
        const existing = await posRepository.findMerchantTenderReconciliationByIdempotencyKey(
            normalizedShiftId,
            idempotencyKey,
            { transaction, lock: true }
        );
        if (existing) {
            if (String(existing.request_hash || '') !== requestHash) {
                throw reconciliationError(DomainErrorCode.CONFLICT, 'idempotency_key was already used with a different reconciliation.', 409, {
                    reason_code: 'MERCHANT_TENDER_RECONCILIATION_IDEMPOTENCY_CONFLICT'
                });
            }
            const expected = await posRepository.getMerchantTenderExpectedByShift(normalizedShiftId, { transaction });
            await transaction.commit();
            return ok({ ...buildSnapshot({ shift, expected, latest: existing }), reconciliation: serializeRecord(existing), idempotent_replay: true });
        }

        const expected = await posRepository.getMerchantTenderExpectedByShift(normalizedShiftId, { transaction });
        const latest = await posRepository.getLatestMerchantTenderReconciliation(normalizedShiftId, { transaction, lock: true });
        const expectedByMethod = expectedAmounts(expected);
        const variance = Object.fromEntries(METHODS.map((method) => [method, round4(observed[method] - expectedByMethod[method])]));
        const hasVariance = METHODS.some((method) => Math.abs(variance[method]) > 0.0001);
        if (hasVariance && reviewNote.length < 8) {
            throw reconciliationError(DomainErrorCode.VALIDATION_FAILED, 'A review note of at least 8 characters is required when a variance exists.', 422, {
                reason_code: 'MERCHANT_TENDER_VARIANCE_NOTE_REQUIRED'
            });
        }
        const observedTotal = round4(METHODS.reduce((sum, method) => sum + observed[method], 0));
        const varianceTotal = round4(observedTotal - Number(expected.total || 0));
        const created = await posRepository.createMerchantTenderReconciliation({
            reconciliation_reference: `MTR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            shift_id: normalizedShiftId,
            location_id: toPositiveInt(shift.location_id),
            terminal_id: String(shift.terminal_id || '').trim(),
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            status: hasVariance ? 'variance_reviewed' : 'balanced',
            expected_breakdown: expected.breakdown,
            observed_breakdown: observed,
            variance_breakdown: variance,
            expected_total: round4(expected.total),
            observed_total: observedTotal,
            variance_total: varianceTotal,
            review_note: reviewNote || null,
            reviewed_by: reviewerId,
            reviewed_at: new Date(),
            supersedes_reconciliation_id: toPositiveInt(latest?.pos_merchant_tender_reconciliation_id)
        }, { transaction });
        await transaction.commit();
        return ok({
            ...buildSnapshot({ shift, expected, latest: created }),
            reconciliation: serializeRecord(created),
            idempotent_replay: false
        });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        return fail(mapPosUseCaseError(error, 'Failed to review merchant tender reconciliation'));
    }
};
