// Storefront voucher redemption (Phase 105, #455). POS redemption itself is still out of scope --
// every live caller today passes `channel: 'storefront'` -- but `buildRedeemVoucherUseCase` now
// (#604) fails closed on `channel === 'pos'` unless the tenant-wide POS master switch is on, so the
// gate is ready ahead of a POS caller existing rather than retrofitted after one does.
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
import { resolveVoucherPosRedemptionEnabled } from './voucherPosRedemptionSettingCache.js';

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();
const toCentavos = (pesoAmount) => Math.round((Number(pesoAmount) || 0) * 100);

// #1331: matches voucherValidator.js's own MAX_CENTAVOS -- comfortably above any real campaign
// budget and comfortably below Number.MAX_SAFE_INTEGER. Used only as the "waive the whole fee"
// sentinel below, never persisted.
const MAX_CENTAVOS = 999999999999;

const buildBenefitConfigSnapshot = (voucher) => ({
    benefit_class: voucher.benefit_class,
    // #1331: orthogonal axis, captured alongside benefit_class for the same reason every other
    // benefit-class amount already is -- a point-in-time record independent of later voucher edits.
    benefit_target: voucher.benefit_target ?? 'items',
    percent_off_bps: voucher.percent_off_bps != null ? Number(voucher.percent_off_bps) : null,
    amount_off_centavos: voucher.amount_off_centavos != null ? Number(voucher.amount_off_centavos) : null,
    fixed_unit_price_centavos: voucher.fixed_unit_price_centavos != null ? Number(voucher.fixed_unit_price_centavos) : null,
    delivery_amount_off_centavos: voucher.delivery_amount_off_centavos != null ? Number(voucher.delivery_amount_off_centavos) : null,
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

    // #696: a pricelist-backed voucher uses the pricelist itself as the scope -- `voucher_scopes` is
    // not consulted at all when one is attached, avoiding two sources of truth for "which items does
    // this voucher cover". The price map's keys ARE the eligible item-id set.
    let eligibleItemIds = null;
    let fixedUnitPriceByItemId = null;
    if (voucher.pricelist_id != null) {
        // #717: `assertPricelistRef` (voucherUseCases.js) only checks status at ATTACH time. A
        // pricelist archived after a voucher already attached it was previously never re-checked,
        // so the voucher kept redeeming at the archived prices indefinitely. Fails closed here --
        // checkout is the higher-stakes side of the fail-open/fail-closed split (ADR 0066 decision
        // 3); voucherDisplayUseCases.js takes the opposite, fail-open branch for the same check.
        const pricelistStatus = await repository.findPricelistStatus(voucher.pricelist_id, options);
        if (!pricelistStatus || pricelistStatus.status !== 'active') {
            voucherError(
                'This voucher\'s pricelist is no longer active.',
                VoucherReasonCode.VOUCHER_PRICELIST_NOT_ACTIVE,
                { voucher_id: voucher.voucher_id, pricelist_id: voucher.pricelist_id, status: pricelistStatus?.status || null }
            );
        }
        fixedUnitPriceByItemId = await repository.listPricelistItemPrices(voucher.pricelist_id, options);
        eligibleItemIds = new Set(Object.keys(fixedUnitPriceByItemId).map(Number));
    } else {
        const scopes = await repository.listScopes([voucher.voucher_id], options);
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
    }

    const benefitLines = (lines || []).map((line) => ({
        line_ref: String(line?.line_ref || '').trim() || null,
        item_id: line.item_id,
        quantity: line.quantity,
        baseUnitPriceCentavos: toCentavos(line.sale_price),
        // #697: optional -- `storeUseCases.js` supplies `cost_snapshot` (peso, nullable) on every
        // prepared checkout line; converted here the same way `sale_price` already is.
        costPerUnitCentavos: line.cost_snapshot == null ? null : toCentavos(line.cost_snapshot),
        eligible: eligibleItemIds == null || eligibleItemIds.has(Number(line.item_id))
    }));

    // ADR 0066 decision 3: an unresolvable scope (zero cart-eligible items) fails closed, it does
    // not silently apply a zero discount. Same rule for a pricelist that matches nothing in the cart.
    if (eligibleItemIds != null && !benefitLines.some((line) => line.eligible)) {
        voucherError(
            'Voucher scope does not match any items in this order.',
            VoucherReasonCode.VOUCHER_SCOPE_NO_ELIGIBLE_ITEMS,
            { voucher_id: voucher.voucher_id }
        );
    }

    // #1331 (Phase 240): Phase 239's `voucherBenefitPolicy.js` is pure math over exactly three
    // benefit classes plus the items/delivery target axis -- deliberately unchanged by this phase
    // (its own header names this invariant explicitly). `free_delivery`'s semantics -- "waive up to
    // delivery_amount_off_centavos of the benefit base, or the whole base when null" -- are
    // byte-for-byte the module's existing 'amount_off' math (`Math.min(amount, benefitBaseCentavos)`),
    // so a free_delivery voucher is translated to that class at this single call site rather than
    // teaching the math module a fourth class it doesn't need. NULL ("waive the whole fee") maps to
    // MAX_CENTAVOS so the existing clamp does the "whole fee" job with no new code path in that
    // module. `benefitTarget`/`deliveryFeeCentavos` are the one-line call-site change
    // `voucherBenefitPolicy.js`'s own header already specifies for this phase -- every existing
    // caller passes neither, so behaviour for an 'items'-targeted voucher is byte-identical.
    const benefitTarget = voucher.benefit_target ?? 'items';
    const isDeliveryBenefit = voucher.benefit_class === 'free_delivery';
    const resolvedAmountOffCentavos = isDeliveryBenefit
        ? (voucher.delivery_amount_off_centavos != null ? Number(voucher.delivery_amount_off_centavos) : MAX_CENTAVOS)
        : voucher.amount_off_centavos;

    let benefit;
    try {
        benefit = calculateVoucherBenefit({
            benefitClass: isDeliveryBenefit ? 'amount_off' : voucher.benefit_class,
            benefitTarget,
            deliveryFeeCentavos: context.deliveryFeeCentavos ?? null,
            percentOffBps: voucher.percent_off_bps,
            amountOffCentavos: resolvedAmountOffCentavos,
            fixedUnitPriceCentavos: voucher.fixed_unit_price_centavos,
            fixedUnitPriceByItemId,
            maxDiscountCentavos: voucher.max_discount_centavos,
            lines: benefitLines
        });
    } catch (error) {
        if (error instanceof VoucherBenefitError) {
            // #1331 (Phase 240 plan §5.4): INVALID_DELIVERY_FEE_CENTAVOS can ONLY be thrown when a
            // benefit_target: 'delivery' voucher is resolved through a call site that supplies no
            // deliveryFeeCentavos -- today, exclusively storeUseCases.js's item-voucher path
            // (voucherContext never carries one). It is therefore always the axis-mismatch case in
            // disguise, never a genuine config problem with the voucher itself -- remapped to the
            // precise reason code rather than the generic one, so a delivery voucher entered in the
            // item field gets a clean, correctly-named 422 instead of a misleading one.
            const reasonCode = error.code === 'INVALID_DELIVERY_FEE_CENTAVOS'
                ? VoucherReasonCode.VOUCHER_BENEFIT_TARGET_MISMATCH
                : VoucherReasonCode.VOUCHER_BENEFIT_CONFIG_INVALID;
            voucherError(error.message, reasonCode, error.details);
        }
        throw error;
    }

    // #697: fails closed. `allow_below_cost` defaults to false, so this is a real behavior change
    // for any already-live voucher (of any benefit class -- the check is class-agnostic) that
    // happens to sell below cost; that tradeoff is the point of the flag, not a bug in enforcing it.
    if (benefit.belowCostLines.length > 0 && voucher.allow_below_cost !== true) {
        voucherError(
            'This voucher would sell one or more items below their cost.',
            VoucherReasonCode.VOUCHER_PRICE_BELOW_COST,
            { voucher_id: voucher.voucher_id, below_cost_lines: benefit.belowCostLines }
        );
    }

    return { voucher, benefit };
};

/**
 * Read-only quote path. No transaction, no reservation -- just eligibility + benefit calc, so a
 * cart preview can show "voucher applies, -₱X" without touching the ledger.
 *
 * @returns {{applied: boolean, voucherId: number|null, code: string|null, title: string|null,
 *   badge: string|null, benefitClass: string|null, benefitTarget: string|null,
 *   percentOffBps: number|null, discountCentavos: number, lineAllocations: Array<Object>}}
 */
export const buildPreviewVoucherEligibilityUseCase = ({ repository }) => async ({
    code,
    context = {},
    lines = []
} = {}) => {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
        return {
            applied: false, voucherId: null, code: null, title: null, badge: null,
            benefitClass: null, benefitTarget: null, percentOffBps: null, discountCentavos: 0, lineAllocations: []
        };
    }

    const { voucher, benefit } = await resolveEligibleBenefit({ repository, code, context, lines });

    return {
        applied: true,
        voucherId: voucher.voucher_id,
        code: voucher.code,
        // #667 Phase 110: threaded through so a caller building a fiscal discount-label snapshot
        // (mirroring commercialPromoPolicy.js's `badge || title || fallback`) doesn't need a second
        // lookup -- the voucher row is already in scope here.
        title: voucher.title,
        badge: voucher.badge,
        benefitClass: voucher.benefit_class,
        // #1331: surfaced so a caller (storeUseCases.js) can enforce which payload field a code was
        // submitted in against what it actually resolves to (VOUCHER_BENEFIT_TARGET_MISMATCH).
        benefitTarget: voucher.benefit_target ?? 'items',
        percentOffBps: voucher.percent_off_bps != null ? Number(voucher.percent_off_bps) : null,
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
 *   voucherId: number|null, code: string|null, title: string|null, badge: string|null,
 *   benefitClass: string|null, benefitTarget: string|null, percentOffBps: number|null,
 *   discountCentavos: number, lineAllocations: Array<Object>}}
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

    // #693: the empty-code short-circuit must run BEFORE the POS master-switch guard below, not
    // after. This function's own contract (see the module docstring above) is "an EMPTY code is a
    // silent no-op... an entered code that fails to resolve fails closed" -- an empty code was never
    // supposed to reach any resolution logic, gate included. With the guard ordered first, a POS
    // checkout carrying NO voucher code at all (channel: 'pos', code: '') threw 422
    // VOUCHER_POS_REDEMPTION_DISABLED whenever the tenant-wide switch was off (its default), instead
    // of the benign no-op every other empty-code caller gets. Latent today -- no live caller passes
    // channel: 'pos' yet -- but would have broken the first POS checkout the moment one did.
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
        return {
            applied: false, idempotentReplay: false, redemptionId: null, voucherId: null,
            code: null, title: null, badge: null, benefitClass: null, benefitTarget: null,
            percentOffBps: null, discountCentavos: 0, lineAllocations: []
        };
    }

    // #604: tenant-wide POS voucher redemption master switch, default off. Deliberately checked
    // here rather than in a POS-side checkout use case, since this is the one function every future
    // POS redemption caller will have to go through -- a tenant-wide, channel-aware, un-bypassable
    // gate. Orthogonal to a voucher's own `channels` mask (checked separately, inside
    // resolveEligibleBenefit's evaluateVoucherEligibility call, below) -- this can disable POS
    // redemption tenant-wide even for a voucher whose own channels already include `pos`. No live
    // caller passes `channel: 'pos'` yet (POS redemption itself is not built); this fails closed the
    // moment one does, rather than defaulting open by omission.
    if (channel === 'pos') {
        const posRedemptionEnabled = await resolveVoucherPosRedemptionEnabled();
        if (!posRedemptionEnabled) {
            voucherError(
                'Voucher redemption at POS is disabled for this store.',
                VoucherReasonCode.VOUCHER_POS_REDEMPTION_DISABLED
            );
        }
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

    // #712: derived from the caller's `channel`, not hardcoded -- a hardcoded 'storefront:' prefix
    // would put a POS redemption's idempotency key in the same namespace as a storefront one,
    // letting an unrelated storefront replay collide with (or be collided into by) a POS checkout
    // sharing the same idempotency key value.
    const ledgerIdempotencyKey = `${channel}:${normalizedIdempotencyKey}:${voucher.voucher_id}`;

    const existing = await repository.findRedemptionByIdempotencyKey(ledgerIdempotencyKey, options);
    if (existing) {
        const existingDiscountCentavos = Number(existing.discount_centavos);
        return {
            applied: true,
            idempotentReplay: true,
            redemptionId: existing.voucher_redemption_id,
            voucherId: voucher.voucher_id,
            code: voucher.code,
            title: voucher.title,
            badge: voucher.badge,
            benefitClass: voucher.benefit_class,
            benefitTarget: voucher.benefit_target ?? 'items',
            percentOffBps: voucher.percent_off_bps != null ? Number(voucher.percent_off_bps) : null,
            discountCentavos: existingDiscountCentavos,
            // #667 Phase 110: only trust this replay's freshly-recomputed allocations if they'd sum
            // to the same discount the existing ledger row already recorded -- a re-run whose
            // recomputed benefit disagrees with what was actually reserved (voucher edited between
            // the original attempt and this replay) must not hand the caller allocations that don't
            // match the ledger truth. Empty is safe here: the caller's own defensive guard (checkout
            // use case) only requires non-empty allocations on a FRESH (non-replay) redemption.
            lineAllocations: existingDiscountCentavos === benefit.discountCentavos ? benefit.lineAllocations : []
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

    // Ledger rows only ever record lines this voucher actually discounted -- an ineligible or
    // zero-discount line has nothing to reverse and would just be dead weight in the ledger.
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
        code: voucher.code,
        title: voucher.title,
        badge: voucher.badge,
        benefitClass: voucher.benefit_class,
        benefitTarget: voucher.benefit_target ?? 'items',
        percentOffBps: voucher.percent_off_bps != null ? Number(voucher.percent_off_bps) : null,
        discountCentavos: benefit.discountCentavos,
        // #667 Phase 110: the UNFILTERED allocation set (same length/order as the input `lines`),
        // not `redemptionLines` above -- a caller building a fiscal audit-row allocation needs to
        // map positionally against its own transaction lines (`storeRepository.js`'s
        // `createOnlineTransactionWithLines`, the same shape the promo path already uses), and a
        // filtered, ledger-row-shaped array can't be indexed that way. `redemptionLines` stays the
        // ledger's own record; this is a separate, caller-facing shape.
        lineAllocations: benefit.lineAllocations
    };
};
