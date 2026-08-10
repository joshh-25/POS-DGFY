import logger from '../../../config/logger.js';
import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';

const DEFAULT_RATE_BPS = 500;

const roundBpsAmount = (baseCentavos, rateBps) => (
    Math.round((Number(baseCentavos) || 0) * (Number(rateBps) || 0) / 10000)
);

// Shared rate resolution: enrollment-level override, else the tenant's configured default, else the
// hardcoded fallback. Used by both the in-store and online accrual paths so a rate change in either
// place can never drift between channels. Exported so storeUseCases.js (Phase 1 affiliate pricing
// rule engine) can resolve the same rate for a buyer-facing preview and pass it through via
// resolvedCommission, rather than re-deriving a potentially different value.
export const resolveCommissionRateBps = (enrollment, settings) => (
    Number.isInteger(enrollment?.commission_rate_bps)
        ? enrollment.commission_rate_bps
        : (Number.isInteger(settings?.default_rate_bps) ? settings.default_rate_bps : DEFAULT_RATE_BPS)
);

// Pre-commit lookup: validates a cashier/customer-entered affiliate code against the tenant's
// program state before the sale is written, so an invalid code can be rejected with clear feedback
// instead of silently losing the commission (unlike the post-commit, best-effort accrual below).
// Returns null (never throws) when the code is blank, invalid, or the tenant hasn't enabled the
// program - callers treat null as "no attribution", not a lookup failure.
export const resolveActiveAffiliateEnrollment = async ({
    tenantId,
    affiliateCode,
    repository = dgfyAffiliateRepository
}) => {
    const code = String(affiliateCode || '').trim();
    if (!tenantId || !code) return null;

    const settings = await repository.getSettings(tenantId);
    if (!settings?.program_enabled) return null;

    return repository.findActiveEnrollmentByShareCode(tenantId, code);
};

// Post-commit, best-effort accrual for an in-store POS sale that already resolved an active
// enrollment via resolveActiveAffiliateEnrollment above. Callers must wrap this in try/catch (or
// .catch()) and log rather than fail the sale - mirrors recordDgfyOrderActivity's post-commit,
// non-blocking convention. Idempotent via the commission ledger's unique (tenant_id,
// order_reference) index, so a retried/duplicate call never double-accrues.
export const accrueEarnedForInStoreSale = async ({
    tenantId,
    enrollment,
    orderReference,
    posTransactionId = null,
    commissionableBaseCentavos,
    buyerDgfyAccountId = null,
    storeSlug = null,
    // Phase 1 affiliate pricing rule engine override (see
    // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). When provided, bypasses the
    // internal rate-resolution ladder entirely: { rateBps, amountCentavos } are used as-is. This
    // exists because NONE and RESELLER_MARGIN commission types don't fit the
    // bps-of-commissionableBase formula below (NONE always earns 0 regardless of rate;
    // RESELLER_MARGIN's amount is a price gap, not a percentage) - the caller (storeUseCases.js)
    // pre-resolves the correct amount via calculateAffiliateSale and hands it through here so this
    // module doesn't need to know about selling-price rules at all. Omitted entirely by every
    // existing caller (in-store POS), so default behavior is provably unchanged.
    resolvedCommission = null,
    // Optional Phase 1 snapshot fields, persisted alongside the commission row for audit/reporting.
    // All default to null - a row accrued with no affiliate price rule attached leaves them NULL.
    snapshot = null,
    repository = dgfyAffiliateRepository
}) => {
    if (!tenantId || !enrollment || !orderReference) return null;

    // Self-referral guard: an affiliate cannot earn commission on their own purchase. Only
    // enforceable when the buyer's DGFY account identity is known - in-store checkout does not
    // capture a buyer identity today, so this is currently a no-op there but is ready for when it
    // does (and for the online lifecycle path, which does know the buyer).
    if (buyerDgfyAccountId && String(buyerDgfyAccountId) === String(enrollment.dgfy_account_id)) {
        logger.warn('[AffiliateCommissionAccrual] Skipped self-referral commission', {
            tenantId,
            enrollmentId: enrollment.enrollment_id,
            orderReference
        });
        return null;
    }

    const settings = await repository.getSettings(tenantId);
    const baseCentavos = Math.max(0, Math.round(Number(commissionableBaseCentavos) || 0));
    const rateBps = resolvedCommission
        ? Math.max(0, Math.round(Number(resolvedCommission.rateBps) || 0))
        : resolveCommissionRateBps(enrollment, settings);
    const amountCentavos = resolvedCommission
        ? Math.max(0, Math.round(Number(resolvedCommission.amountCentavos) || 0))
        : roundBpsAmount(baseCentavos, rateBps);

    await repository.recordAttribution({
        tenantId,
        enrollmentId: enrollment.enrollment_id,
        channel: 'in_store',
        posTransactionId,
        storeSlug
    });

    const { commission } = await repository.createEarnedCommissionIfMissing({
        enrollmentId: enrollment.enrollment_id,
        tenantId,
        dgfyAccountId: enrollment.dgfy_account_id,
        posTransactionId,
        orderReference,
        commissionableBaseCentavos: baseCentavos,
        rateBpsSnapshot: rateBps,
        amountCentavos,
        reason: 'in_store_sale',
        baseSubtotalCentavos: snapshot?.baseSubtotalCentavos ?? null,
        buyerSubtotalCentavos: snapshot?.buyerSubtotalCentavos ?? null,
        resellerMarginCentavos: snapshot?.resellerMarginCentavos ?? null,
        priceRuleTypeSnapshot: snapshot?.priceRuleTypeSnapshot ?? null,
        settlementPolicySnapshot: snapshot?.settlementPolicySnapshot ?? null
    });

    return commission;
};

// Reverses (pending/earned -> reversed) the commission tied to a voided/cancelled order, keyed by
// the same order_reference used at accrual time. Best-effort - never throws in a way that should
// block the void itself; callers should log a failure and move on.
export const reverseAffiliateCommissionForOrder = async ({
    tenantId,
    orderReference,
    repository = dgfyAffiliateRepository
}) => {
    if (!tenantId || !orderReference) return { reversed: false, reason: 'missing_reference' };
    return repository.reverseCommissionByOrderReference(tenantId, orderReference);
};

// By-id twin of resolveActiveAffiliateEnrollment, used where the caller already has an enrollment id
// (from the attribution cookie) rather than a typed-in share code. Same null-means-no-attribution
// contract: dormant/suspended enrollments and a disabled program both resolve to null, never throw.
export const resolveActiveAffiliateEnrollmentById = async ({
    tenantId,
    enrollmentId,
    repository = dgfyAffiliateRepository
}) => {
    if (!tenantId || !enrollmentId) return null;

    const settings = await repository.getSettings(tenantId);
    if (!settings?.program_enabled) return null;

    const enrollment = await repository.findEnrollmentById(tenantId, enrollmentId);
    return enrollment?.status === 'active' ? enrollment : null;
};

// Post-commit, best-effort accrual for an online (storefront) order. Unlike the in-store path,
// online orders are born pending - the actual order lifecycle (completed vs cancelled/rejected)
// isn't known yet at checkout, so this writes a `pending` commission that settleAffiliateCommission-
// ForOrder later flips to earned or reversed. Same idempotency guarantee via the (tenant_id,
// order_reference) index, and callers must wrap this in try/catch, mirroring
// recordDgfyOrderActivity's non-blocking convention.
export const accruePendingForOnlineOrder = async ({
    tenantId,
    enrollment,
    orderReference,
    commissionableBaseCentavos,
    buyerDgfyAccountId = null,
    storeSlug = null,
    // See accrueEarnedForInStoreSale's resolvedCommission/snapshot for the full rationale - same
    // Phase 1 affiliate pricing rule engine override, mirrored here for the online path.
    resolvedCommission = null,
    snapshot = null,
    repository = dgfyAffiliateRepository
}) => {
    if (!tenantId || !enrollment || !orderReference) return null;

    // Self-referral guard: live here (unlike the in-store path) since online checkout knows the
    // buyer's DGFY account identity.
    if (buyerDgfyAccountId && String(buyerDgfyAccountId) === String(enrollment.dgfy_account_id)) {
        logger.warn('[AffiliateCommissionAccrual] Skipped self-referral commission', {
            tenantId,
            enrollmentId: enrollment.enrollment_id,
            orderReference
        });
        return null;
    }

    const settings = await repository.getSettings(tenantId);
    const baseCentavos = Math.max(0, Math.round(Number(commissionableBaseCentavos) || 0));
    const rateBps = resolvedCommission
        ? Math.max(0, Math.round(Number(resolvedCommission.rateBps) || 0))
        : resolveCommissionRateBps(enrollment, settings);
    const amountCentavos = resolvedCommission
        ? Math.max(0, Math.round(Number(resolvedCommission.amountCentavos) || 0))
        : roundBpsAmount(baseCentavos, rateBps);

    await repository.recordAttribution({
        tenantId,
        enrollmentId: enrollment.enrollment_id,
        channel: 'link',
        dgfyAccountId: buyerDgfyAccountId,
        storeSlug
    });

    const { commission } = await repository.createPendingCommissionIfMissing({
        enrollmentId: enrollment.enrollment_id,
        tenantId,
        dgfyAccountId: enrollment.dgfy_account_id,
        orderReference,
        commissionableBaseCentavos: baseCentavos,
        rateBpsSnapshot: rateBps,
        amountCentavos,
        reason: 'online_order',
        baseSubtotalCentavos: snapshot?.baseSubtotalCentavos ?? null,
        buyerSubtotalCentavos: snapshot?.buyerSubtotalCentavos ?? null,
        resellerMarginCentavos: snapshot?.resellerMarginCentavos ?? null,
        priceRuleTypeSnapshot: snapshot?.priceRuleTypeSnapshot ?? null,
        settlementPolicySnapshot: snapshot?.settlementPolicySnapshot ?? null
    });

    return commission;
};

// Settles a pending online-order commission once the order's real outcome is known: 'earned' when
// the order completes, 'reversed' when it's cancelled/rejected. Best-effort, non-blocking - same
// convention as the rest of this module.
export const settleAffiliateCommissionForOrder = async ({
    tenantId,
    orderReference,
    outcome,
    repository = dgfyAffiliateRepository
}) => {
    if (!tenantId || !orderReference) return { updated: false, reason: 'missing_reference' };
    if (outcome === 'earned') {
        return repository.markCommissionEarnedByOrderReference(tenantId, orderReference);
    }
    if (outcome === 'reversed') {
        const result = await repository.reverseCommissionByOrderReference(tenantId, orderReference);
        return { updated: result.reversed, reason: result.reason, commission: result.commission };
    }
    return { updated: false, reason: 'invalid_outcome' };
};

export default {
    resolveActiveAffiliateEnrollment,
    resolveActiveAffiliateEnrollmentById,
    resolveCommissionRateBps,
    accrueEarnedForInStoreSale,
    accruePendingForOnlineOrder,
    settleAffiliateCommissionForOrder,
    reverseAffiliateCommissionForOrder
};
