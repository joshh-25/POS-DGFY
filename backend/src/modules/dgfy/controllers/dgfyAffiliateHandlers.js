import {
    enrollSelfServeAffiliateUseCase,
    getAffiliateEarningsUseCase,
    getAffiliateQrPayloadUseCase,
    getAffiliateSettingsUseCase,
    listAffiliatesUseCase,
    listMyAffiliateEnrollmentsUseCase,
    provisionAffiliateUseCase,
    updateAffiliateEnrollmentUseCase,
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
