// Storefront voucher redemption (Phase 105, #455). POS redemption is explicitly out of scope here
// (gated behind #604) -- `channel` is always `'storefront'` in this module.
//
// Two use cases, deliberately different shapes:
//   - `buildPreviewVoucherEligibilityUseCase` -- read-only. No transaction required. Looks up the
//     voucher, evaluates structural eligibility, resolves scope, and calculates the benefit, but
//     never reserves anything against the ledger. Used for the quote/preview checkout path.
//   - `buildRedeemVoucherUseCase` -- the real atomic path. REQUIRES an open transaction (the
//     already-open storefront checkout transaction -- no new transaction is opened here). Performs
//     the same resolution as the preview, then the guarded reservation + ledger insert.
//
// Unlike the CRUD use cases in `voucherUseCases.js`, neither of these wraps its result in
// `ok`/`fail` -- both are called from deep inside `storeUseCases.js`'s own checkout flow (mirroring
// `employeeCreditUseCases.js`'s `finalizeDebit`/`reverseForVoid`, which throw and let the outer
// checkout use case's own try/catch convert to a `fail(...)`). A thrown `DomainError` from
// `voucherError`/`voucherConflict` propagates through the same error-mapping the checkout endpoint
// already uses for promo/other checkout failures -- no new error-mapping layer needed.

import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { evaluateVoucherEligibility } from '../domain/voucherEligibilityPolicy.js';
import { calculateVoucherBenefit, VoucherBenefitError } from '../domain/voucherBenefitPolicy.js';
import { resolveVoucherScopeItemIds } from '../domain/voucherFolderScope.js';
import { VoucherReasonCode, voucherError, voucherConflict } from '../domain/voucherErrors.js';

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();
const toCentavos = (pesoAmount) => Math.round((Number(pesoAmount) || 0) * 100);

const buildBenefitConfigSnapshot = (voucher) => ({
    benefit_class: voucher.benefit_class,
    percent_off_bps: voucher.percent_off_bps != null ? Number(voucher.percent_off_bps) : null,
    amount_off_centavos: voucher.amount_off_centavos != null ? Number(voucher.amount_off_centavos) : null,
    fixed_unit_price_centavos: voucher.fixed_unit_price_centavos != null ? Number(voucher.fixed_unit_price_centavos) : null,
    max_discount_centavos: voucher.max_discount_centavos != null ? Number(voucher.max_discount_centavos) : null
});

/**
 * Shared resolution steps common to preview and redeem: find the voucher, evaluate structural
 * eligibility (channel / fulfillment / order timing / weekday / time window / min spend-quantity
 * -- NOT authoritative exhaustion, ADR 0066 decision 4), check the fixed-price/affiliate conflict
 * (decision 7), resolve scope to a concrete eligible item-id set (decision 11), and calculate the
 * benefit against only the scope-eligible lines.
 *
 * `lines` are prepared checkout lines in PESO, shaped like `prepareCheckoutLines`'s own output:
 * `{item_id, quantity, sale_price, line_subtotal}`.
 *
 * Throws (via `voucherError`/`voucherConflict`) rather than returning a soft failure -- matching
 * how `resolveCommercialPromoApplication` treats an entered-but-invalid promo code: an EMPTY code
 * is a silent no-op (handled by the caller before this function is ever invoked), but an entered
 * code that fails to resolve fails closed with a 422, per ADR 0066 decision 3.
 */
const resolveEligibleBenefit = async ({ repository, code, context = {}, lines = [], options = {} }) => {
    const normalizedCode = normalizeCode(code);
    const voucher = await repository.findByCode(normalizedCode, options);
    if (!voucher) {
        voucherError('Voucher code was not found.', VoucherReasonCode.VOUCHER_NOT_FOUND, { code: normalizedCode });
    }

    // Structural checks only. The three exhaustion reasons this also returns (11-13 in the
    // policy's own numbering) are PREVIEW ONLY per that module's docstring -- real enforcement is
    // the atomic `reserveRedemption` UPDATE below. Treating a positive here as an additional
    // fail-closed signal (rather than filtering exhaustion reasons out) is deliberate: a stale
    // cache saying "exhausted" is a safe direction to fail closed in, even though it is not the
    // final authority.
    const eligibility = evaluateVoucherEligibility({ voucher, context });
    if (!eligibility.eligible) {
        const [firstReason] = eligibility.reasons;
        voucherError(
            firstReason?.message || 'Voucher is not eligible.',
            firstReason?.reason_code || VoucherReasonCode.VOUCHER_NOT_ACTIVE,
            { voucher_id: voucher.voucher_id, reasons: eligibility.reasons }
        );
    }

    // ADR 0066 decision 7: a fixed-price voucher is refused outright under an active affiliate
    // attribution.
    if (voucher.benefit_class === 'fixed_price' && context.affiliatePricing) {
        voucherError(
            'A fixed-price voucher cannot be combined with active affiliate pricing.',
            VoucherReasonCode.VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT,
            { voucher_id: voucher.voucher_id }
        );
    }

    const scopes = await repository.listScopes([voucher.voucher_id], options);
    let eligibleItemIds = null;
    if (scopes.length > 0) {
        const folderScopeRefIds = scopes
            .filter((scope) => scope.scope_type === 'item_folder')
            .map((scope) => scope.scope_ref_id);
        const cartItemIds = [...new Set((lines || []).map((line) => Number(line.item_id)))];
        const [folders, itemFolderLinks] = await Promise.all([
            folderScopeRefIds.length > 0 ? repository.listItemFolderAdjacency(options) : Promise.resolve([]),
            repository.listItemFolderLinksForItems(cartItemIds, options)
        ]);
        const resolved = resolveVoucherScopeItemIds({ scopes, folders, items: itemFolderLinks });
        eligibleItemIds = resolved.itemIds;
    }

    const benefitLines = (lines || []).map((line) => ({
        item_id: line.item_id,
        quantity: line.quantity,
        baseUnitPriceCentavos: toCentavos(line.sale_price),
        eligible: eligibleItemIds == null || eligibleItemIds.has(Number(line.item_id))
    }));

    // ADR 0066 decision 3: an unresolvable scope (zero cart-eligible items) fails closed, it does
    // not silently apply a zero discount.
    if (eligibleItemIds != null && !benefitLines.some((line) => line.eligible)) {
        voucherError(
            'Voucher scope does not match any items in this order.',
            VoucherReasonCode.VOUCHER_SCOPE_NO_ELIGIBLE_ITEMS,
            { voucher_id: voucher.voucher_id }
        );
    }

    let benefit;
    try {
        benefit = calculateVoucherBenefit({
            benefitClass: voucher.benefit_class,
            percentOffBps: voucher.percent_off_bps,
            amountOffCentavos: voucher.amount_off_centavos,
            fixedUnitPriceCentavos: voucher.fixed_unit_price_centavos,
            maxDiscountCentavos: voucher.max_discount_centavos,
            lines: benefitLines
        });
    } catch (error) {
        if (error instanceof VoucherBenefitError) {
            voucherError(error.message, VoucherReasonCode.VOUCHER_BENEFIT_CONFIG_INVALID, error.details);
        }
        throw error;
    }

    return { voucher, benefit };
};

/**
 * Read-only quote path. No transaction, no reservation -- just eligibility + benefit calc, so a
 * cart preview can show "voucher applies, -₱X" without touching the ledger.
 *
 * @returns {{applied: boolean, voucherId: number|null, code: string|null, benefitClass:
 *   string|null, discountCentavos: number, lineAllocations: Array<Object>}}
 */
export const buildPreviewVoucherEligibilityUseCase = ({ repository }) => async ({
    code,
    context = {},
    lines = []
} = {}) => {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
        return { applied: false, voucherId: null, code: null, benefitClass: null, discountCentavos: 0, lineAllocations: [] };
    }

    const { voucher, benefit } = await resolveEligibleBenefit({ repository, code, context, lines });

    return {
        applied: true,
        voucherId: voucher.voucher_id,
        code: voucher.code,
        benefitClass: voucher.benefit_class,
        discountCentavos: benefit.discountCentavos,
        lineAllocations: benefit.lineAllocations
    };
};

/**
 * The real atomic redemption path. REQUIRES `transaction` (the already-open storefront checkout
 * transaction) -- this function opens no transaction of its own.
 *
 * DB operation sequence (ADR 0066, #455 Phase 105 spec):
 *   1-6. Resolve + evaluate (shared with preview, above).
 *   7-8. Idempotency pre-check (`storefront:<checkoutIdempotencyKey>:<voucher_id>`) -- a replay
 *        returns the existing row's discount/allocations and moves nothing.
 *   9.   `reserveRedemption` -- ONE guarded UPDATE. `0` affected rows -> re-read to find which
 *        guard failed and map it to the specific exhaustion reason code (fail closed, never cap).
 *   10-11. Ledger entry + per-line allocations, both snapshotting base and voucher unit price
 *        (decision 11 -- a later folder move must not retroactively change what this meant).
 *
 * @returns {{applied: boolean, idempotentReplay: boolean, redemptionId: number|null,
 *   voucherId: number|null, discountCentavos: number, lineAllocations: Array<Object>}}
 */
export const buildRedeemVoucherUseCase = ({ repository }) => async ({
    code,
    context = {},
    lines = [],
    idempotencyKey,
    channel = 'storefront',
    storeCustomerId = null,
    locationId = null,
    transaction
} = {}) => {
    if (!transaction) {
        throw new DomainError(
            DomainErrorCode.INTERNAL_ERROR,
            'redeemVoucherUseCase requires an open transaction',
            { statusCode: 500 }
        );
    }

    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
        return { applied: false, idempotentReplay: false, redemptionId: null, voucherId: null, discountCentavos: 0, lineAllocations: [] };
    }

    const normalizedIdempotencyKey = String(idempotencyKey || '').trim();
    if (!normalizedIdempotencyKey) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'idempotencyKey is required to redeem a voucher',
            { statusCode: 422 }
        );
    }

    const options = { transaction, lock: true };
    const { voucher, benefit } = await resolveEligibleBenefit({ repository, code, context, lines, options });

    const ledgerIdempotencyKey = `storefront:${normalizedIdempotencyKey}:${voucher.voucher_id}`;

    const existing = await repository.findRedemptionByIdempotencyKey(ledgerIdempotencyKey, options);
    if (existing) {
        return {
            applied: true,
            idempotentReplay: true,
            redemptionId: existing.voucher_redemption_id,
            voucherId: voucher.voucher_id,
            discountCentavos: Number(existing.discount_centavos),
            lineAllocations: []
        };
    }

    const reservedQuantity = Math.round(Number(benefit.eligibleQuantity) || 0);
    const affected = await repository.reserveRedemption(voucher.voucher_id, {
        discountCentavos: benefit.discountCentavos,
        quantity: reservedQuantity
    }, { transaction });

    if (affected === 0) {
        const refreshed = await repository.findById(voucher.voucher_id, options) || voucher;
        if (refreshed.max_redemptions != null && Number(refreshed.redeemed_count) >= Number(refreshed.max_redemptions)) {
            voucherConflict(
                'Voucher has reached its redemption limit.',
                VoucherReasonCode.VOUCHER_REDEMPTION_LIMIT_REACHED,
                { voucher_id: voucher.voucher_id }
            );
        }
        if (
            refreshed.max_total_discount_centavos != null
            && Number(refreshed.redeemed_value_centavos) + benefit.discountCentavos > Number(refreshed.max_total_discount_centavos)
        ) {
            voucherConflict(
                'Voucher has exhausted its total discount budget.',
                VoucherReasonCode.VOUCHER_BUDGET_EXHAUSTED,
                { voucher_id: voucher.voucher_id }
            );
        }
        if (
            refreshed.max_benefit_quantity != null
            && Number(refreshed.redeemed_quantity) + reservedQuantity > Number(refreshed.max_benefit_quantity)
        ) {
            voucherConflict(
                'Voucher has exhausted its benefit quantity limit.',
                VoucherReasonCode.VOUCHER_QUANTITY_LIMIT_REACHED,
                { voucher_id: voucher.voucher_id }
            );
        }
        // Row gone or some other conflict between the read above and this UPDATE.
        voucherConflict(
            'Voucher could not be reserved.',
            VoucherReasonCode.VOUCHER_VERSION_CONFLICT,
            { voucher_id: voucher.voucher_id }
        );
    }

    const beforeCount = Number(voucher.redeemed_count ?? 0);
    const beforeValue = Number(voucher.redeemed_value_centavos ?? 0);
    const beforeQuantity = Number(voucher.redeemed_quantity ?? 0);

    const ledgerEntry = await repository.createRedemptionLedgerEntry({
        voucher_id: voucher.voucher_id,
        entry_type: 'redemption',
        channel,
        location_id: locationId,
        store_customer_id: storeCustomerId,
        code_snapshot: voucher.code,
        benefit_config_snapshot: buildBenefitConfigSnapshot(voucher),
        subtotal_centavos: benefit.eligibleSubtotalCentavos,
        discount_centavos: benefit.discountCentavos,
        benefit_quantity: reservedQuantity,
        redeemed_count_before: beforeCount,
        redeemed_count_after: beforeCount + 1,
        redeemed_value_before_centavos: beforeValue,
        redeemed_value_after_centavos: beforeValue + benefit.discountCentavos,
        redeemed_quantity_before: beforeQuantity,
        redeemed_quantity_after: beforeQuantity + reservedQuantity,
        idempotency_key: ledgerIdempotencyKey
    }, { transaction });

    const redemptionLines = benefit.lineAllocations
        .filter((line) => line.quantity > 0 && line.discountCentavos > 0)
        .map((line) => ({
            voucher_redemption_id: ledgerEntry.voucher_redemption_id,
            item_id: line.item_id,
            quantity: line.quantity,
            base_unit_price_centavos: line.baseUnitPriceCentavos,
            voucher_unit_price_centavos: line.voucherUnitPriceCentavos,
            discount_centavos: line.discountCentavos
        }));

    if (redemptionLines.length > 0) {
        await repository.createRedemptionLines(redemptionLines, { transaction });
    }

    return {
        applied: true,
        idempotentReplay: false,
        redemptionId: ledgerEntry.voucher_redemption_id,
        voucherId: voucher.voucher_id,
        discountCentavos: benefit.discountCentavos,
        lineAllocations: redemptionLines
    };
};
