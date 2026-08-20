// Reversal of a voucher redemption (Phase 105, #455). Modeled directly on
// `employeeCreditUseCases.js`'s `reverseForVoid` -- idempotency-key pre-check, symmetric decrement
// floored at zero, a `reversal` ledger row with the sign flipped, mirrored line allocations.
//
// REQUIRES an open transaction, same contract as `buildRedeemVoucherUseCase` -- this function opens
// none of its own.
//
// KNOWN GAP, named rather than silently left: `buildCancelStoreOrderUseCase` in
// `storeUseCases.js` has no `status: 'voided'` path today -- storefront has no cancel/refund hook
// that calls this use case yet (ADR 0066 Consequences #3: "Storefront has no refund reversal
// path... A real gap this ADR does not close"). This use case is built and unit-tested on its own
// terms so it exists once that hook is built; it is currently unreachable from any real HTTP
// request.

import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { VoucherReasonCode, voucherConflict } from '../domain/voucherErrors.js';

/**
 * @returns {{applied: boolean, idempotentReplay: boolean, reversalId: number|null,
 *   originalRedemptionId: number|null, discountCentavos: number, lineAllocations: Array<Object>}}
 */
export const buildReverseVoucherRedemptionUseCase = ({ repository }) => async ({
    originalRedemptionId,
    reason = null,
    transaction
} = {}) => {
    if (!transaction) {
        throw new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'reverseVoucherRedemptionUseCase requires an open transaction',
            { statusCode: 500 }
        );
    }

    const normalizedId = Number(originalRedemptionId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        voucherConflict(
            'A valid original voucher redemption id is required to reverse it.',
            VoucherReasonCode.VOUCHER_NOT_FOUND,
            { voucher_redemption_id: originalRedemptionId }
        );
    }

    const options = { transaction, lock: true };
    const reversalKey = `reversal:${normalizedId}`;

    // 1-2. Idempotency pre-check -- a replayed reversal returns the existing reversal row rather
    // than reversing twice.
    const existingReversal = await repository.findRedemptionByIdempotencyKey(reversalKey, options);
    if (existingReversal) {
        return {
            applied: true,
            idempotentReplay: true,
            reversalId: existingReversal.voucher_redemption_id,
            originalRedemptionId: normalizedId,
            discountCentavos: Number(existingReversal.discount_centavos),
            lineAllocations: []
        };
    }

    // 3. Row-lock the original redemption.
    const original = await repository.findRedemptionById(normalizedId, options);
    if (!original) {
        voucherConflict(
            'Original voucher redemption was not found.',
            VoucherReasonCode.VOUCHER_NOT_FOUND,
            { voucher_redemption_id: normalizedId }
        );
    }
    if (original.entry_type !== 'redemption') {
        voucherConflict(
            'Only a redemption entry can be reversed.',
            VoucherReasonCode.VOUCHER_INVALID_STATUS_TRANSITION,
            { voucher_redemption_id: normalizedId, entry_type: original.entry_type }
        );
    }

    // 4. Row-lock the voucher.
    const voucher = await repository.findById(original.voucher_id, options);
    if (!voucher) {
        voucherConflict(
            'Voucher for this redemption was not found.',
            VoucherReasonCode.VOUCHER_NOT_FOUND,
            { voucher_id: original.voucher_id }
        );
    }

    const discountCentavos = Number(original.discount_centavos) || 0;
    const benefitQuantity = Number(original.benefit_quantity) || 0;

    // 5. Symmetric decrement, floored at zero.
    await repository.reverseRedemptionCounters(voucher.voucher_id, {
        discountCentavos,
        quantity: benefitQuantity
    }, { transaction });

    const beforeCount = Number(voucher.redeemed_count ?? 0);
    const beforeValue = Number(voucher.redeemed_value_centavos ?? 0);
    const beforeQuantity = Number(voucher.redeemed_quantity ?? 0);

    // 6. Ledger entry, sign flipped.
    const reversalEntry = await repository.createRedemptionLedgerEntry({
        voucher_id: voucher.voucher_id,
        entry_type: 'reversal',
        channel: original.channel,
        location_id: original.location_id,
        store_customer_id: original.store_customer_id,
        code_snapshot: original.code_snapshot,
        benefit_config_snapshot: original.benefit_config_snapshot,
        subtotal_centavos: original.subtotal_centavos,
        discount_centavos: -discountCentavos,
        benefit_quantity: -benefitQuantity,
        redeemed_count_before: beforeCount,
        redeemed_count_after: Math.max(0, beforeCount - 1),
        redeemed_value_before_centavos: beforeValue,
        redeemed_value_after_centavos: Math.max(0, beforeValue - discountCentavos),
        redeemed_quantity_before: beforeQuantity,
        redeemed_quantity_after: Math.max(0, beforeQuantity - benefitQuantity),
        idempotency_key: reversalKey,
        reversal_of_redemption_id: original.voucher_redemption_id,
        reason: reason ? String(reason).slice(0, 500) : null
    }, { transaction });

    // 7. Mirrored lines, discount negated.
    const originalLines = await repository.listRedemptionLines(original.voucher_redemption_id, options);
    const reversalLines = originalLines.map((line) => ({
        voucher_redemption_id: reversalEntry.voucher_redemption_id,
        item_id: line.item_id,
        quantity: line.quantity,
        base_unit_price_centavos: line.base_unit_price_centavos,
        voucher_unit_price_centavos: line.voucher_unit_price_centavos,
        discount_centavos: -Number(line.discount_centavos)
    }));
    if (reversalLines.length > 0) {
        await repository.createRedemptionLines(reversalLines, { transaction });
    }

    return {
        applied: true,
        idempotentReplay: false,
        reversalId: reversalEntry.voucher_redemption_id,
        originalRedemptionId: original.voucher_redemption_id,
        discountCentavos: -discountCentavos,
        lineAllocations: reversalLines
    };
};
