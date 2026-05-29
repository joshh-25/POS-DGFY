import {
    cancelDgfyCustomerOrderUseCase,
    createDgfyCustomerAddressUseCase,
    deleteDgfyCustomerAddressUseCase,
    getDgfyCustomerDashboardUseCase,
    getDgfyCustomerLoyaltyUseCase,
    listDgfyCustomerReviewsForModerationUseCase,
    listDgfyCustomerAddressesUseCase,
    listDgfyCustomerActivitiesUseCase,
    listDgfyCustomerBookingsUseCase,
    listDgfyCustomerOrdersUseCase,
    listPublicDgfyCustomerReviewsUseCase,
    moderateDgfyCustomerReviewUseCase,
    reorderDgfyCustomerOrderUseCase,
    requestDgfyTrackingRecoveryUseCase,
    submitDgfyCustomerReviewUseCase,
    submitDgfyGuestReviewInviteUseCase,
    trackDgfyCustomerReferenceUseCase,
    updateDgfyCustomerAddressUseCase,
    validateDgfyReviewInviteUseCase,
    verifyDgfyTrackingRecoveryUseCase
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

export const getDgfyCustomerDashboard = async (req, res, next) => {
    try {
        return send(res, await getDgfyCustomerDashboardUseCase({ account: req.dgfyAccount }));
    } catch (error) {
        next(error);
    }
};

export const listDgfyCustomerOrders = async (req, res, next) => {
    try {
        return send(res, await listDgfyCustomerOrdersUseCase({ account: req.dgfyAccount, query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const listDgfyCustomerActivities = async (req, res, next) => {
    try {
        return send(res, await listDgfyCustomerActivitiesUseCase({ account: req.dgfyAccount, query: req.query, type: req.query?.type || null }));
    } catch (error) {
        next(error);
    }
};

export const listDgfyCustomerBookings = async (req, res, next) => {
    try {
        return send(res, await listDgfyCustomerBookingsUseCase({ account: req.dgfyAccount, query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const trackDgfyCustomerReference = async (req, res, next) => {
    try {
        return send(res, await trackDgfyCustomerReferenceUseCase({ account: req.dgfyAccount || null, body: req.body }));
    } catch (error) {
        next(error);
    }
};

export const cancelDgfyCustomerOrder = async (req, res, next) => {
    try {
        return send(res, await cancelDgfyCustomerOrderUseCase({ account: req.dgfyAccount, reference: req.params.reference }), {
            message: 'Order cancelled successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const reorderDgfyCustomerOrder = async (req, res, next) => {
    try {
        return send(res, await reorderDgfyCustomerOrderUseCase({ account: req.dgfyAccount, reference: req.params.reference }));
    } catch (error) {
        next(error);
    }
};

export const listDgfyCustomerAddresses = async (req, res, next) => {
    try {
        return send(res, await listDgfyCustomerAddressesUseCase({ account: req.dgfyAccount }));
    } catch (error) {
        next(error);
    }
};

export const createDgfyCustomerAddress = async (req, res, next) => {
    try {
        return send(res, await createDgfyCustomerAddressUseCase({ account: req.dgfyAccount, body: req.body }), {
            status: 201,
            message: 'Address saved successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const updateDgfyCustomerAddress = async (req, res, next) => {
    try {
        return send(res, await updateDgfyCustomerAddressUseCase({ account: req.dgfyAccount, addressId: req.params.address_id, body: req.body }), {
            message: 'Address updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const setDefaultDgfyCustomerAddress = async (req, res, next) => {
    try {
        return send(res, await updateDgfyCustomerAddressUseCase({
            account: req.dgfyAccount,
            addressId: req.params.address_id,
            body: { is_default: true }
        }), {
            message: 'Default address updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const deleteDgfyCustomerAddress = async (req, res, next) => {
    try {
        return send(res, await deleteDgfyCustomerAddressUseCase({ account: req.dgfyAccount, addressId: req.params.address_id }), {
            message: 'Address deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const getDgfyCustomerLoyalty = async (req, res, next) => {
    try {
        return send(res, await getDgfyCustomerLoyaltyUseCase({ account: req.dgfyAccount }));
    } catch (error) {
        next(error);
    }
};

export const submitDgfyCustomerReview = async (req, res, next) => {
    try {
        return send(res, await submitDgfyCustomerReviewUseCase({ account: req.dgfyAccount, body: req.body }), {
            status: 201,
            message: 'Review submitted for approval'
        });
    } catch (error) {
        next(error);
    }
};

export const listPublicDgfyCustomerReviews = async (req, res, next) => {
    try {
        return send(res, await listPublicDgfyCustomerReviewsUseCase({ query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const validateDgfyReviewInvite = async (req, res, next) => {
    try {
        return send(res, await validateDgfyReviewInviteUseCase({ token: req.params.token }));
    } catch (error) {
        next(error);
    }
};

export const submitDgfyGuestReviewInvite = async (req, res, next) => {
    try {
        return send(res, await submitDgfyGuestReviewInviteUseCase({ token: req.params.token, body: req.body }), {
            status: 201,
            message: 'Review submitted for approval'
        });
    } catch (error) {
        next(error);
    }
};

export const listDgfyCustomerReviewsForModeration = async (req, res, next) => {
    try {
        return send(res, await listDgfyCustomerReviewsForModerationUseCase({ query: req.query }));
    } catch (error) {
        next(error);
    }
};

export const moderateDgfyCustomerReview = async (req, res, next) => {
    try {
        return send(res, await moderateDgfyCustomerReviewUseCase({ admin: req.admin || req.user || null, reviewId: req.params.review_id, body: req.body }), {
            message: 'Review moderation updated'
        });
    } catch (error) {
        next(error);
    }
};

export const requestDgfyTrackingRecovery = async (req, res, next) => {
    try {
        return send(res, await requestDgfyTrackingRecoveryUseCase({ body: req.body }), {
            message: 'If matching orders exist, a recovery code has been sent by email.'
        });
    } catch (error) {
        next(error);
    }
};

export const verifyDgfyTrackingRecovery = async (req, res, next) => {
    try {
        return send(res, await verifyDgfyTrackingRecoveryUseCase({ body: req.body }));
    } catch (error) {
        next(error);
    }
};
