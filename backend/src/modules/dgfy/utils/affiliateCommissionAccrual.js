import logger from '../../../config/logger.js';
import { dgfyAffiliateRepository } from '../repositories/dgfyAffiliateRepository.js';

const DEFAULT_RATE_BPS = 500;

const roundBpsAmount = (baseCentavos, rateBps) => (
    Math.round((Number(baseCentavos) || 0) * (Number(rateBps) || 0) / 10000)
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
    const rateBps = Number.isInteger(enrollment.commission_rate_bps)
        ? enrollment.commission_rate_bps
        : (Number.isInteger(settings?.default_rate_bps) ? settings.default_rate_bps : DEFAULT_RATE_BPS);
    const baseCentavos = Math.max(0, Math.round(Number(commissionableBaseCentavos) || 0));
    const amountCentavos = roundBpsAmount(baseCentavos, rateBps);

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
        reason: 'in_store_sale'
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

export default {
    resolveActiveAffiliateEnrollment,
    accrueEarnedForInStoreSale,
    reverseAffiliateCommissionForOrder
};
