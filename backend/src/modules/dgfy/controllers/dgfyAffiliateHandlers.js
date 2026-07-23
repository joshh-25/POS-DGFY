import {
    approveAffiliateCashoutUseCase,
    cancelAffiliateCashoutUseCase,
    createAffiliatePayoutMethodUseCase,
    deleteAffiliatePayoutMethodUseCase,
    enrollSelfServeAffiliateUseCase,
    getAffiliateEarningsUseCase,
    getAffiliateQrPayloadUseCase,
    getAffiliateSettingsUseCase,
    listAffiliateCashoutsUseCase,
    listAffiliatesUseCase,
    listAffiliatePayoutMethodsUseCase,
    listMyAffiliateCashoutsUseCase,
    listMyAffiliateEnrollmentsUseCase,
    markAffiliateCashoutPaidUseCase,
    provisionAffiliateUseCase,
    rejectAffiliateCashoutUseCase,
    requestAffiliateCashoutUseCase,
    setDefaultAffiliatePayoutMethodUseCase,
    updateAffiliateEnrollmentUseCase,
    updateAffiliatePayoutMethodUseCase,
    updateAffiliateSettingsUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

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

export const updateAffiliateEnrollment = async (req, res, next) => {
    try {
        return send(res, await updateAffiliateEnrollmentUseCase({
            tenantId: req.user?.tenant_id,
            enrollmentId: req.params.enrollment_id,
            body: req.body
        }), {
            message: 'Affiliate enrollment updated successfully'
        });
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
