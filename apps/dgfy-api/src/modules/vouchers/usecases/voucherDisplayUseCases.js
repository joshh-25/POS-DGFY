// Storefront catalog display seam (#603). A third sibling of `voucherRedemptionUseCases.js`'s
// preview/redeem pair, deliberately NOT built on `resolveEligibleBenefit` -- that function requires
// prepared cart lines and throws on ineligibility, both wrong for a browse page that has no cart yet
// and must never fail the whole catalog response over one voucher.
//
// Fail-open by design, mirroring `storeUseCases.js`'s `applyAffiliateDisplayPrice` (the template
// this module follows): any resolution failure -- voucher not found, an unresolvable timezone, a
// malformed benefit config, one bad item in a large batch -- falls back to showing the plain catalog
// price rather than blocking the page or throwing. Checkout re-validates and fails closed at the
// point that actually matters (ADR 0066 decision 3); display never does.

import logger from '../../../config/logger.js';
import { evaluateVoucherEligibility, VOUCHER_ELIGIBILITY_REASON_CODES } from '../domain/voucherEligibilityPolicy.js';
import { calculateVoucherBenefit, VoucherBenefitError } from '../domain/voucherBenefitPolicy.js';
import { resolveVoucherScopeItemIds } from '../domain/voucherFolderScope.js';
import { VoucherReasonCode } from '../domain/voucherErrors.js';

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();

// Only the campaign-level (structural) reasons block display. Basket minimums, fulfillment method,
// and order timing are unknowable before a cart exists -- `evaluateVoucherEligibility` still
// evaluates them (context.fulfillmentMethod/orderTiming are absent, so they'd otherwise always
// resolve to "not eligible" and blank every storefront voucher's display price). Exhaustion previews
// (11-13 in that module's numbering) are a derived cache per ADR 0066 decision 4, not something
// display should block on. Sourced from the policy module's own reason-code enum rather than
// duplicated string literals, so a rename there doesn't silently desync this filter.
const DISPLAY_RELEVANT_REASON_CODES = new Set([
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_NOT_ACTIVE,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_NOT_STARTED,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_EXPIRED,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_WEEKDAY_NOT_ELIGIBLE,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_TIME_WINDOW_BLOCKED,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_TIME_WINDOW_DEGENERATE,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_TIMEZONE_UNRESOLVABLE,
    VOUCHER_ELIGIBILITY_REASON_CODES.VOUCHER_CHANNEL_NOT_ELIGIBLE
]);

// percent_off and fixed_price both resolve to a well-defined per-unit price at quantity 1.
// amount_off does not: its order-level max_discount_centavos cap has no meaning distributed across
// a single item shown in isolation on a browse card, so it gets a "voucher applies" badge only, no
// price rewrite.
const DISPLAY_PRICEABLE_BENEFIT_CLASSES = new Set(['percent_off', 'fixed_price']);

const notApplied = (overrides = {}) => ({
    applied: false,
    voucherId: null,
    code: null,
    benefitClass: null,
    badgeOnly: false,
    reasonCode: null,
    pricesByItemId: {},
    ...overrides
});

/**
 * Resolve display-time voucher prices for a batch of catalog items, once per request.
 *
 * @param {{repository: Object}} deps
 * @returns {(args: {
 *   code: string,
 *   items: Array<{item_id: number, folder_id: number|null, default_sale_price: number, cost_per_unit?: number|null}>,
 *   channel?: string,
 *   affiliatePricingActive?: boolean
 * }) => Promise<{
 *   applied: boolean,
 *   voucherId: number|null,
 *   code: string|null,
 *   benefitClass: string|null,
 *   badgeOnly: boolean,
 *   reasonCode: string|null,
 *   pricesByItemId: Record<number, {original_price: number, voucher_price: number}>
 * }>}
 */
export const buildResolveVoucherDisplayPricesUseCase = ({ repository }) => async ({
    code,
    items = [],
    channel = 'storefront',
    affiliatePricingActive = false
} = {}) => {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) return notApplied();

    let voucher;
    try {
        voucher = await repository.findByCode(normalizedCode);
    } catch (error) {
        logger.warn('[VoucherDisplay] Failed to look up voucher code, showing catalog prices instead', {
            error: error?.message
        });
        return notApplied();
    }
    if (!voucher) return notApplied();

    const eligibility = evaluateVoucherEligibility({ voucher, context: { channel } });
    const blockingReason = eligibility.reasons.find((reason) => DISPLAY_RELEVANT_REASON_CODES.has(reason.reason_code));
    if (blockingReason) {
        return notApplied({
            voucherId: voucher.voucher_id,
            code: voucher.code,
            benefitClass: voucher.benefit_class,
            reasonCode: blockingReason.reason_code
        });
    }

    // ADR 0066 decision 7: mirrors the checkout-time refusal so a displayed price never contradicts
    // what checkout will actually allow once affiliate attribution is active.
    if (voucher.benefit_class === 'fixed_price' && affiliatePricingActive) {
        return notApplied({
            voucherId: voucher.voucher_id,
            code: voucher.code,
            benefitClass: voucher.benefit_class,
            reasonCode: VoucherReasonCode.VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT
        });
    }

    if (!DISPLAY_PRICEABLE_BENEFIT_CLASSES.has(voucher.benefit_class)) {
        return {
            applied: true,
            voucherId: voucher.voucher_id,
            code: voucher.code,
            benefitClass: voucher.benefit_class,
            badgeOnly: true,
            reasonCode: null,
            pricesByItemId: {}
        };
    }

    let scopeItemIds = null;
    // #696: a pricelist-backed voucher's price map IS the scope -- same rule as the redemption path,
    // `voucher_scopes` is not consulted when one is attached.
    let fixedUnitPriceByItemId = null;
    try {
        if (voucher.pricelist_id != null) {
            fixedUnitPriceByItemId = await repository.listPricelistItemPrices(voucher.pricelist_id);
            scopeItemIds = new Set(Object.keys(fixedUnitPriceByItemId).map(Number));
        } else {
            const scopes = await repository.listScopes([voucher.voucher_id]);
            if (scopes.length > 0) {
                const folderScopeRefIds = scopes
                    .filter((scope) => scope.scope_type === 'item_folder')
                    .map((scope) => scope.scope_ref_id);
                const folders = folderScopeRefIds.length > 0
                    ? await repository.listItemFolderAdjacency()
                    : [];
                const resolved = resolveVoucherScopeItemIds({
                    scopes,
                    folders,
                    items: (Array.isArray(items) ? items : []).map((item) => ({
                        item_id: item.item_id,
                        folder_id: item.folder_id
                    }))
                });
                scopeItemIds = resolved.itemIds;
            }
        }
    } catch (error) {
        logger.warn('[VoucherDisplay] Failed to resolve voucher scope, showing catalog prices instead', {
            voucher_id: voucher.voucher_id,
            error: error?.message
        });
        return notApplied({ voucherId: voucher.voucher_id, code: voucher.code, benefitClass: voucher.benefit_class });
    }

    const pricesByItemId = {};
    for (const item of (Array.isArray(items) ? items : [])) {
        const itemId = Number(item?.item_id);
        if (!Number.isInteger(itemId) || itemId <= 0) continue;
        if (scopeItemIds != null && !scopeItemIds.has(itemId)) continue;

        const catalogPrice = Number(item?.default_sale_price);
        if (!(catalogPrice > 0)) continue;
        const baseUnitPriceCentavos = Math.round(catalogPrice * 100);
        const costPerUnitCentavos = item?.cost_per_unit == null ? null : Math.round(Number(item.cost_per_unit) * 100);

        try {
            const benefit = calculateVoucherBenefit({
                benefitClass: voucher.benefit_class,
                percentOffBps: voucher.percent_off_bps,
                fixedUnitPriceCentavos: voucher.fixed_unit_price_centavos,
                fixedUnitPriceByItemId,
                // Order-level cap is not meaningful for a single item shown at quantity 1 in
                // isolation on a browse card -- omit it, mirroring why amount_off is excluded above.
                maxDiscountCentavos: null,
                lines: [{ item_id: itemId, quantity: 1, baseUnitPriceCentavos, costPerUnitCentavos, eligible: true }]
            });
            const [allocation] = benefit.lineAllocations;
            if (!allocation || allocation.discountCentavos <= 0) continue;
            // #697: fail OPEN per item -- show the plain catalog price rather than a voucher price
            // that undercuts cost. Never blocks the rest of the batch, mirroring
            // `applyAffiliateDisplayPrice`'s own asymmetry with the checkout-side guard. But when
            // the voucher is explicitly configured with allow_below_cost: true, redemption will
            // honor that price (voucherRedemptionUseCases.js's own `!== true` check) -- displaying
            // the plain catalog price here regardless would contradict what checkout actually does,
            // so only fall back when the flag is not set.
            if (benefit.belowCostLines.length > 0 && voucher.allow_below_cost !== true) {
                logger.warn('[VoucherDisplay] Voucher price would sell below cost, showing catalog price instead', {
                    voucher_id: voucher.voucher_id,
                    item_id: itemId
                });
                continue;
            }
            pricesByItemId[itemId] = {
                original_price: catalogPrice,
                voucher_price: allocation.voucherUnitPriceCentavos / 100
            };
        } catch (error) {
            // Fail open per item -- one item with a malformed benefit config must not blank the
            // voucher price for every other item in the same batch.
            if (!(error instanceof VoucherBenefitError)) throw error;
            logger.warn('[VoucherDisplay] Failed to resolve display price for item, skipping', {
                voucher_id: voucher.voucher_id,
                item_id: itemId,
                error: error?.message
            });
        }
    }

    return {
        applied: true,
        voucherId: voucher.voucher_id,
        code: voucher.code,
        benefitClass: voucher.benefit_class,
        badgeOnly: false,
        reasonCode: null,
        pricesByItemId
    };
};
