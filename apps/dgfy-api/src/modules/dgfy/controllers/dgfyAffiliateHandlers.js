import {
    acceptAffiliateInviteUseCase,
    approveAffiliateCashoutUseCase,
    cancelAffiliateCashoutUseCase,
    cancelAffiliateInviteUseCase,
    captureAffiliateAttributionUseCase,
    createAffiliatePayoutMethodUseCase,
    deleteAffiliatePayoutMethodUseCase,
    enrollSelfServeAffiliateUseCase,
    getAffiliateEarningsUseCase,
    getAffiliateInvitePreviewUseCase,
    getAffiliateQrPayloadUseCase,
    getAffiliateSettingsUseCase,
    inviteAffiliateUseCase,
    listAffiliateCashoutsUseCase,
    listAffiliateInvitesUseCase,
    listAffiliatesUseCase,
    listAffiliatePayoutMethodsUseCase,
    listMyAffiliateCashoutsUseCase,
    listMyAffiliateEnrollmentsUseCase,
    markAffiliateCashoutPaidUseCase,
    provisionAffiliateUseCase,
    reactivateAffiliateEnrollmentUseCase,
    rejectAffiliateCashoutUseCase,
    requestAffiliateCashoutUseCase,
    setDefaultAffiliatePayoutMethodUseCase,
    updateAffiliateEnrollmentUseCase,
    updateAffiliatePayoutMethodUseCase,
    updateAffiliateSettingsUseCase,
    listAffiliatePriceRulesUseCase,
    upsertAffiliatePriceRuleUseCase,
    deactivateAffiliatePriceRuleUseCase,
    listAffiliateCategoryRatesUseCase,
    upsertAffiliateCategoryRateUseCase,
    deactivateAffiliateCategoryRateUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { setAffiliateAttributionCookie } from '../../../utils/browserSessionCookies.js';

const timestamp = () => new Date().toISOString();

const errorPayload = (failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    timestamp: timestamp()
});

const send = (res, result, { status = 200, message = null } = {}) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => status,
    successPayloadResolver: () => ({
        success: true,
        data: result.data,
        ...(message ? { message } : {}),
        timestamp: timestamp()
    }),
    errorPayloadResolver: errorPayload
});

// --- Owner/admin (tenant staff, gated by AFFILIATES permissions) ---

export const getAffiliateSettings = async (req, res, next) => {
    try {
        return send(res, await getAffiliateSettingsUseCase({ tenantId: req.user?.tenant_id }));
    } catch (error) {
        next(error);
    }
};

export const updateAffiliateSettings = async (req, res, next) => {
    try {
        return send(res, await updateAffiliateSettingsUseCase({ tenantId: req.user?.tenant_id, body: req.body }), {
            message: 'Affiliate settings updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const listAffiliates = async (req, res, next) => {
    try {
        return send(res, await listAffiliatesUseCase({ tenantId: req.user?.tenant_id }));
    } catch (error) {
        next(error);
    }
};

export const provisionAffiliate = async (req, res, next) => {
    try {
        return send(res, await provisionAffiliateUseCase({ tenantId: req.user?.tenant_id, body: req.body }), {
            status: 201,
            message: 'Affiliate provisioned successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const inviteAffiliate = async (req, res, next) => {
    try {
        return send(res, await inviteAffiliateUseCase({
            tenantId: req.user?.tenant_id,
            body: req.body,
            invitedBy: req.user?.user_id ?? null
        }), {
            status: 201,
            message: 'Affiliate invitation sent'
        });
    } catch (error) {
        next(error);
    }
};

export const listAffiliateInvites = async (req, res, next) => {
    try {
        return send(res, await listAffiliateInvitesUseCase({
            tenantId: req.user?.tenant_id,
            status: req.query?.status || null
        }));
    } catch (error) {
        next(error);
    }
};

export const cancelAffiliateInvite = async (req, res, next) => {
    try {
        return send(res, await cancelAffiliateInviteUseCase({
            tenantId: req.user?.tenant_id,
            inviteId: req.params.invite_id
        }), { message: 'Affiliate invitation cancelled' });
    } catch (error) {
        next(error);
    }
};

export const updateAffiliateEnrollment = async (req, res, next) => {
    try {
        return send(res, await updateAffiliateEnrollmentUseCase({
            tenantId: req.user?.tenant_id,
            enrollmentId: req.params.enrollment_id,
            body: req.body,
            revokedBy: req.user?.user_id ?? null
        }), {
            message: 'Affiliate enrollment updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const reactivateAffiliateEnrollment = async (req, res, next) => {
    try {
        return send(res, await reactivateAffiliateEnrollmentUseCase({
            tenantId: req.user?.tenant_id,
            enrollmentId: req.params.enrollment_id,
            reactivatedBy: req.user?.user_id ?? null
        }), {
            message: 'Affiliate enrollment reactivated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// Phase 1 affiliate pricing rule engine (see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
export const listAffiliatePriceRules = async (req, res, next) => {
    try {
        return send(res, await listAffiliatePriceRulesUseCase({ tenantId: req.user?.tenant_id }));
    } catch (error) {
        next(error);
    }
};

export const upsertAffiliatePriceRule = async (req, res, next) => {
    try {
        return send(res, await upsertAffiliatePriceRuleUseCase({ tenantId: req.user?.tenant_id, body: req.body }), {
            message: 'Affiliate price rule saved successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const deactivateAffiliatePriceRule = async (req, res, next) => {
    try {
        return send(res, await deactivateAffiliatePriceRuleUseCase({
            tenantId: req.user?.tenant_id,
            priceRuleId: req.params.price_rule_id
        }), { message: 'Affiliate price rule deactivated' });
    } catch (error) {
        next(error);
    }
};

// #448 (Phase 209) - affiliate category rates, the category tier of the commission rate ladder.
export const listAffiliateCategoryRates = async (req, res, next) => {
    try {
        return send(res, await listAffiliateCategoryRatesUseCase({ tenantId: req.user?.tenant_id }));
    } catch (error) {
        next(error);
    }
};

export const upsertAffiliateCategoryRate = async (req, res, next) => {
    try {
        return send(res, await upsertAffiliateCategoryRateUseCase({ tenantId: req.user?.tenant_id, body: req.body }), {
            message: 'Affiliate category rate saved successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const deactivateAffiliateCategoryRate = async (req, res, next) => {
    try {
        return send(res, await deactivateAffiliateCategoryRateUseCase({
            tenantId: req.user?.tenant_id,
            categoryRateId: req.params.category_rate_id
        }), { message: 'Affiliate category rate deactivated' });
    } catch (error) {
        next(error);
    }
};

export const getAffiliateQrPayload = async (req, res, next) => {
    try {
        return send(res, await getAffiliateQrPayloadUseCase({
            tenantId: req.user?.tenant_id,
            enrollmentId: req.params.enrollment_id
        }));
    } catch (error) {
        next(error);
    }
};

export const listAffiliateCashouts = async (req, res, next) => {
    try {
        return send(res, await listAffiliateCashoutsUseCase({ tenantId: req.user?.tenant_id, query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const approveAffiliateCashout = async (req, res, next) => {
    try {
        return send(res, await approveAffiliateCashoutUseCase({
            tenantId: req.user?.tenant_id,
            cashoutId: req.params.cashout_id,
            approvedByUserId: req.user?.user_id ?? null
        }), { message: 'Cashout request approved' });
    } catch (error) {
        next(error);
    }
};

export const markAffiliateCashoutPaid = async (req, res, next) => {
    try {
        return send(res, await markAffiliateCashoutPaidUseCase({
            tenantId: req.user?.tenant_id,
            cashoutId: req.params.cashout_id,
            body: req.body
        }), { message: 'Cashout marked as paid' });
    } catch (error) {
        next(error);
    }
};

export const rejectAffiliateCashout = async (req, res, next) => {
    try {
        return send(res, await rejectAffiliateCashoutUseCase({
            tenantId: req.user?.tenant_id,
            cashoutId: req.params.cashout_id,
            body: req.body
        }), { message: 'Cashout request rejected' });
    } catch (error) {
        next(error);
    }
};

// --- Affiliate self-service (authenticateDgfyAccount) ---

export const listMyAffiliateEnrollments = async (req, res, next) => {
    try {
        return send(res, await listMyAffiliateEnrollmentsUseCase({ account: req.dgfyAccount }));
    } catch (error) {
        next(error);
    }
};

export const enrollSelfServeAffiliate = async (req, res, next) => {
    try {
        return send(res, await enrollSelfServeAffiliateUseCase({ account: req.dgfyAccount, body: req.body }), {
            status: 201,
            message: 'You are now enrolled as an affiliate for this store'
        });
    } catch (error) {
        next(error);
    }
};

export const getAffiliateEarnings = async (req, res, next) => {
    try {
        return send(res, await getAffiliateEarningsUseCase({ account: req.dgfyAccount, query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const listAffiliatePayoutMethods = async (req, res, next) => {
    try {
        return send(res, await listAffiliatePayoutMethodsUseCase({ account: req.dgfyAccount }));
    } catch (error) {
        next(error);
    }
};

export const createAffiliatePayoutMethod = async (req, res, next) => {
    try {
        return send(res, await createAffiliatePayoutMethodUseCase({ account: req.dgfyAccount, body: req.body }), {
            status: 201,
            message: 'Payout method saved successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const updateAffiliatePayoutMethod = async (req, res, next) => {
    try {
        return send(res, await updateAffiliatePayoutMethodUseCase({
            account: req.dgfyAccount,
            payoutMethodId: req.params.payout_method_id,
            body: req.body
        }), { message: 'Payout method updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const setDefaultAffiliatePayoutMethod = async (req, res, next) => {
    try {
        return send(res, await setDefaultAffiliatePayoutMethodUseCase({
            account: req.dgfyAccount,
            payoutMethodId: req.params.payout_method_id
        }), { message: 'Default payout method updated' });
    } catch (error) {
        next(error);
    }
};

export const deleteAffiliatePayoutMethod = async (req, res, next) => {
    try {
        return send(res, await deleteAffiliatePayoutMethodUseCase({
            account: req.dgfyAccount,
            payoutMethodId: req.params.payout_method_id
        }), { message: 'Payout method deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export const requestAffiliateCashout = async (req, res, next) => {
    try {
        return send(res, await requestAffiliateCashoutUseCase({ account: req.dgfyAccount, body: req.body }), {
            status: 201,
            message: 'Cashout requested successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const listMyAffiliateCashouts = async (req, res, next) => {
    try {
        return send(res, await listMyAffiliateCashoutsUseCase({ account: req.dgfyAccount, query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const cancelAffiliateCashout = async (req, res, next) => {
    try {
        return send(res, await cancelAffiliateCashoutUseCase({
            account: req.dgfyAccount,
            cashoutId: req.params.cashout_id
        }), { message: 'Cashout request cancelled' });
    } catch (error) {
        next(error);
    }
};

// Public, unauthenticated: no req.user / req.dgfyAccount available. Dormant until a storefront page
// calls it on load (frontend/apps/store is out of scope for this phase). Always responds success
// (captured: true/false) - never a 4xx for an unknown code/store, so the endpoint can't be used to
// enumerate either.
export const captureAffiliateAttribution = async (req, res, next) => {
    try {
        const result = await captureAffiliateAttributionUseCase({
            tenantId: req.body?.tenant_id || null,
            storeSlug: req.body?.store_slug || null,
            shortCode: req.body?.p || req.body?.short_code,
            visitorFingerprint: req.body?.visitor_fingerprint || null
        });
        if (result?.data?.captured) {
            setAffiliateAttributionCookie(req, res, result.data.tenant_id, result.data.enrollment_id);
        }
        return send(res, result);
    } catch (error) {
        next(error);
    }
};

// Public, unauthenticated: the storefront accept/register page reads this to show which business is
// inviting and whether the invitee already has an account (so it can lock the register email field).
export const getAffiliateInvitePreview = async (req, res, next) => {
    try {
        return send(res, await getAffiliateInvitePreviewUseCase({ token: req.params.token }));
    } catch (error) {
        next(error);
    }
};

// Authenticated (authenticateDgfyAccount): the logged-in account explicitly accepts an invite.
export const acceptAffiliateInvite = async (req, res, next) => {
    try {
        return send(res, await acceptAffiliateInviteUseCase({
            account: req.dgfyAccount,
            token: req.body?.token
        }), { message: 'You are now an affiliate' });
    } catch (error) {
        next(error);
    }
};
