import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import {
    buildAdjustmentEvidenceDocument,
    buildFiscalReceiptEvidence
} from '../domain/fiscalEvidenceContract.js';

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
};
const hashPayload = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const assertOwnedOpenShift = ({ shift, actorUserId, shiftOwnerUserId, terminalId, locationId }) => {
    if (!shift || String(shift.status || '').trim().toLowerCase() !== 'open') {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'An open cashier shift is required to record a return',
            { statusCode: 422, details: { reason_code: 'POS_SHIFT_NOT_OPEN' } }
        );
    }
    if (Number(shift.cashier_id) !== Number(shiftOwnerUserId || actorUserId)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only the cashier who owns the open shift can record the return',
            { statusCode: 403, details: { reason_code: 'POS_RETURN_SHIFT_OWNER_REQUIRED' } }
        );
    }
    if (terminalId && String(shift.terminal_id || '') !== String(terminalId)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Return shift terminal does not match the registered POS terminal',
            { statusCode: 422, details: { reason_code: 'POS_RETURN_TERMINAL_MISMATCH' } }
        );
    }
    if (locationId && Number(shift.location_id) !== Number(locationId)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Return shift location does not match the registered POS terminal',
            { statusCode: 403, details: { reason_code: 'POS_RETURN_LOCATION_MISMATCH' } }
        );
    }
};

const normalizeReturnedLines = ({ requestedLines = [], transactionLines = [] }) => {
    if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'returned_lines must contain at least one original transaction line',
            { statusCode: 422, details: { reason_code: 'POS_RETURN_LINES_REQUIRED' } }
        );
    }

    const sourceLines = new Map((Array.isArray(transactionLines) ? transactionLines : []).map((line) => [
        parsePositiveInt(line?.line_id),
        line
    ]));
    const seenLineIds = new Set();
    const normalized = requestedLines.map((requestedLine) => {
        const lineId = parsePositiveInt(requestedLine?.line_id);
        const sourceLine = sourceLines.get(lineId);
        const quantity = round4(requestedLine?.quantity);
        if (!lineId || !sourceLine || quantity <= 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Every return line must reference an existing transaction line and a positive quantity',
                { statusCode: 422, details: { reason_code: 'POS_RETURN_LINE_INVALID', line_id: lineId } }
            );
        }
        if (seenLineIds.has(lineId)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A transaction line may appear only once in a return request',
                { statusCode: 422, details: { reason_code: 'POS_RETURN_LINE_DUPLICATE', line_id: lineId } }
            );
        }
        seenLineIds.add(lineId);
        const originalQuantity = round4(sourceLine.quantity);
        if (quantity > originalQuantity) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Returned quantity cannot exceed the original issued quantity',
                {
                    statusCode: 409,
                    details: {
                        reason_code: 'POS_RETURN_QUANTITY_EXCEEDS_ORIGINAL',
                        line_id: lineId,
                        original_quantity: originalQuantity,
                        requested_quantity: quantity
                    }
                }
            );
        }
        const originalLineSubtotal = round4(sourceLine.line_subtotal);
        const unitAmount = originalQuantity > 0
            ? originalLineSubtotal / originalQuantity
            : round4(sourceLine.sale_price);
        return {
            line_id: lineId,
            item_id: parsePositiveInt(sourceLine.item_id),
            item_name: sourceLine.item_name_snapshot || sourceLine.item?.name || null,
            original_quantity: originalQuantity,
            quantity,
            sale_price: round4(sourceLine.sale_price),
            line_subtotal: round4(unitAmount * quantity),
            stock_effect_type: sourceLine.stock_effect_type || null
        };
    });

    return normalized;
};

export const buildReturnPosTransactionUseCase = ({ posRepository }) => {
    if (!posRepository) throw new Error('posRepository is required');

    return async ({ posTransactionId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const shiftId = parsePositiveInt(payload?.shift_id);
        const terminalId = String(payload?.terminal_id || '').trim().toUpperCase() || null;
        const locationId = parsePositiveInt(payload?.terminal_location_id);
        const reason = String(payload?.reason || '').trim();
        const idempotencyKey = String(payload?.idempotency_key || '').trim();

        if (!normalizedTransactionId || !actorUserId || !shiftId || reason.length < 3 || idempotencyKey.length < 8) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId, shift_id, reason, and idempotency_key are required',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const existing = toSerializable(await posRepository.getTransactionById(normalizedTransactionId, {
                transaction,
                lock: true
            }));
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'POS transaction not found',
                    { statusCode: 404 }
                );
            }
            if (String(existing.status || '').trim().toLowerCase() === 'voided') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A voided POS transaction cannot receive a separate return adjustment',
                    { statusCode: 409, details: { reason_code: 'POS_RETURN_TRANSACTION_VOIDED' } }
                );
            }

            const shift = await posRepository.getTerminalShiftById(shiftId, { transaction, lock: true });
            assertOwnedOpenShift({
                shift,
                actorUserId,
                shiftOwnerUserId: parsePositiveInt(user?.register_shift_owner_user_id) || actorUserId,
                terminalId,
                locationId
            });
            if (locationId && Number(existing.location_id) !== locationId) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Return location does not match the original transaction location',
                    { statusCode: 403, details: { reason_code: 'POS_RETURN_LOCATION_MISMATCH' } }
                );
            }

            const receiptEvidence = buildFiscalReceiptEvidence({ transaction: existing });
            if (existing.document_type === 'fiscal_invoice' && receiptEvidence.snapshot_integrity !== 'verified') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A fiscal return requires an intact original server-owned document snapshot',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'POS_RETURN_ORIGINAL_SNAPSHOT_UNVERIFIED',
                            snapshot_integrity: receiptEvidence.snapshot_integrity,
                            snapshot_validation: receiptEvidence.snapshot_validation
                        }
                    }
                );
            }

            const returnedLines = normalizeReturnedLines({
                requestedLines: payload.returned_lines,
                transactionLines: existing.lines
            });
            const amount = round4(returnedLines.reduce((total, line) => total + line.line_subtotal, 0));
            if (amount <= 0) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Return amount must be greater than zero',
                    { statusCode: 422, details: { reason_code: 'POS_RETURN_AMOUNT_ZERO' } }
                );
            }

            const requestPayload = {
                pos_transaction_id: normalizedTransactionId,
                shift_id: shiftId,
                terminal_id: terminalId,
                location_id: locationId,
                reason,
                returned_lines: returnedLines
            };
            const requestHash = hashPayload(requestPayload);
            const existingAdjustment = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
                normalizedTransactionId,
                idempotencyKey,
                { transaction, lock: true }
            );
            if (existingAdjustment) {
                if (String(existingAdjustment.request_hash || '') !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Return idempotency_key was already used with a different request',
                        { statusCode: 409, details: { reason_code: 'POS_RETURN_IDEMPOTENCY_CONFLICT' } }
                    );
                }
                await transaction.commit();
                return ok({
                    transaction: existing,
                    adjustment: toSerializable(existingAdjustment),
                    adjustment_document: buildAdjustmentEvidenceDocument({
                        transaction: existing,
                        adjustment: existingAdjustment
                    }),
                    idempotent_replay: true,
                    replay_outcome: 'idempotent_replay'
                });
            }

            const returnedAt = new Date();
            let fiscalEvent = null;
            if (existing.document_type === 'fiscal_invoice' && typeof posRepository.createFiscalEvent === 'function') {
                fiscalEvent = await posRepository.createFiscalEvent({
                    pos_transaction_id: normalizedTransactionId,
                    event_type: 'reversal',
                    document_type: existing.document_type,
                    invoice_number: existing.invoice_number,
                    terminal_id: existing.terminal_id || terminalId,
                    fiscal_document_hash: existing.fiscal_document_hash || null,
                    payload: {
                        adjustment_type: 'return',
                        reason,
                        original_document_number: existing.invoice_number || null,
                        original_document_hash: existing.fiscal_document_hash || null,
                        returned_lines: returnedLines
                    },
                    actor_user_id: actorUserId,
                    occurred_at: returnedAt
                }, { transaction });
            }

            const adjustment = await posRepository.createPosTransactionAdjustment({
                adjustment_reference: `POS-RETURN-${normalizedTransactionId}-${requestHash.slice(0, 8)}`.slice(0, 40),
                pos_transaction_id: normalizedTransactionId,
                original_cashier_id: parsePositiveInt(existing.cashier_id),
                original_shift_id: parsePositiveInt(existing.shift_id),
                original_terminal_id: existing.terminal_id || null,
                original_location_id: parsePositiveInt(existing.location_id),
                actor_user_id: actorUserId,
                actor_shift_id: shiftId,
                actor_terminal_id: terminalId,
                actor_location_id: locationId,
                adjustment_type: 'return',
                tender_type: String(existing.payment_type || 'unknown').trim().toLowerCase() || 'unknown',
                amount,
                currency: 'PHP',
                status: 'succeeded',
                reason,
                idempotency_key: idempotencyKey,
                request_hash: requestHash,
                completed_at: returnedAt,
                metadata: {
                    evidence_contract_version: receiptEvidence.contract_version,
                    original_document_number: existing.invoice_number || null,
                    original_document_hash: existing.fiscal_document_hash || null,
                    original_snapshot_integrity: receiptEvidence.snapshot_integrity,
                    returned_lines: returnedLines,
                    signed_amount: -amount,
                    inventory_reversal: { status: 'not_requested' },
                    payment_adjustment_reference: null,
                    fiscal_event_hash: fiscalEvent?.event_hash || null,
                    return_semantics: 'RETURN-READINESS-0.1'
                }
            }, { transaction });
            if (!adjustment || String(adjustment.request_hash || '') !== requestHash) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Return evidence could not be recorded consistently',
                    { statusCode: 409 }
                );
            }

            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: 'pos_transaction_returned',
                terminal_id: terminalId || existing.terminal_id || null,
                shift_id: shiftId,
                location_id: existing.location_id || locationId || null,
                reason,
                changes: {
                    event: 'pos_transaction_returned',
                    adjustment_reference: adjustment.adjustment_reference,
                    original_document_number: existing.invoice_number || null,
                    amount,
                    returned_lines: returnedLines,
                    inventory_reversal: 'not_requested',
                    payment_refund: 'separate_adjustment_required',
                    fiscal_event_hash: fiscalEvent?.event_hash || null
                }
            }, { transaction });

            await transaction.commit();
            return ok({
                transaction: existing,
                adjustment: toSerializable(adjustment),
                adjustment_document: buildAdjustmentEvidenceDocument({
                    transaction: existing,
                    adjustment
                }),
                fiscal_event_hash: fiscalEvent?.event_hash || null,
                inventory_reversal: { status: 'not_requested' },
                payment_refund: { status: 'separate_adjustment_required' },
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to record POS return adjustment'));
        }
    };
};
