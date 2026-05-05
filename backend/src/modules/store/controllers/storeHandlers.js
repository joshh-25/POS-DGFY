import {
    listStoreCatalogUseCase,
    resolveStoreQrUseCase,
    listStoreLocationsUseCase,
    registerStoreCustomerUseCase,
    loginStoreCustomerUseCase,
    getStoreCustomerMeUseCase,
    listStoreCustomerAddressesUseCase,
    createStoreCustomerAddressUseCase,
    updateStoreCustomerAddressUseCase,
    setDefaultStoreCustomerAddressUseCase,
    deleteStoreCustomerAddressUseCase,
    storeCartQuoteUseCase,
    storeCheckoutUseCase,
    trackStoreOrderUseCase,
    claimStoreOrderUseCase,
    cancelStoreOrderUseCase,
    listStoreCustomerOrdersUseCase,
    getStorefrontFollowStatusUseCase,
    followStorefrontUseCase,
    unfollowStorefrontUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;

const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

const resolveTenantId = (req) => req.tenant?.id || null;
const resolveStoreCustomer = (req) => req.storeCustomer || null;

export const registerStoreCustomer = async (req, res, next) => {
    try {
        const result = await registerStoreCustomerUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Store customer registered successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listStoreCatalog = async (req, res, next) => {
    try {
        const result = await listStoreCatalogUseCase({
            query: req.validatedQuery || req.query
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const resolveStoreQr = async (req, res, next) => {
    try {
        const result = await resolveStoreQrUseCase({
            query: req.validatedQuery || req.query
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listStoreLocations = async (req, res, next) => {
    try {
        const result = await listStoreLocationsUseCase();

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const loginStoreCustomer = async (req, res, next) => {
    try {
        const result = await loginStoreCustomerUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Store customer login successful',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getStoreCustomerMe = async (req, res, next) => {
    try {
        const result = await getStoreCustomerMeUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listStoreCustomerAddresses = async (req, res, next) => {
    try {
        const result = await listStoreCustomerAddressesUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const createStoreCustomerAddress = async (req, res, next) => {
    try {
        const result = await createStoreCustomerAddressUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id,
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Address saved successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateStoreCustomerAddress = async (req, res, next) => {
    try {
        const result = await updateStoreCustomerAddressUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id,
            addressId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Address updated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const setDefaultStoreCustomerAddress = async (req, res, next) => {
    try {
        const result = await setDefaultStoreCustomerAddressUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id,
            addressId: req.validatedParams?.id || req.params.id
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Default address updated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const deleteStoreCustomerAddress = async (req, res, next) => {
    try {
        const result = await deleteStoreCustomerAddressUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id,
            addressId: req.validatedParams?.id || req.params.id
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Address deleted successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const cartQuote = async (req, res, next) => {
    try {
        const result = await storeCartQuoteUseCase({
            payload: req.validatedData || req.body,
            storeCustomer: resolveStoreCustomer(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const checkout = async (req, res, next) => {
    try {
        const result = await storeCheckoutUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            storeCustomer: resolveStoreCustomer(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Store checkout completed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const trackOrder = async (req, res, next) => {
    try {
        const result = await trackStoreOrderUseCase({
            trackingPin: req.validatedParams?.tracking_pin || req.params.tracking_pin,
            tenantId: resolveTenantId(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const claimOrder = async (req, res, next) => {
    try {
        const result = await claimStoreOrderUseCase({
            trackingPin: req.validatedParams?.tracking_pin || req.params.tracking_pin,
            tenantId: resolveTenantId(req),
            storeCustomer: resolveStoreCustomer(req),
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Order linked successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const cancelOrder = async (req, res, next) => {
    try {
        const result = await cancelStoreOrderUseCase({
            trackingPin: req.validatedParams?.tracking_pin || req.params.tracking_pin,
            tenantId: resolveTenantId(req),
            storeCustomer: resolveStoreCustomer(req),
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Order cancelled successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listStoreCustomerOrders = async (req, res, next) => {
    try {
        const result = await listStoreCustomerOrdersUseCase({
            customerId: resolveStoreCustomer(req)?.customer_id,
            query: req.validatedQuery || req.query
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getStorefrontFollowStatus = async (req, res, next) => {
    try {
        const result = await getStorefrontFollowStatusUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedQuery || req.query,
            storeCustomer: resolveStoreCustomer(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const followStorefront = async (req, res, next) => {
    try {
        const result = await followStorefrontUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            storeCustomer: resolveStoreCustomer(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Storefront followed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const unfollowStorefront = async (req, res, next) => {
    try {
        const result = await unfollowStorefrontUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            storeCustomer: resolveStoreCustomer(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Storefront unfollowed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export default {
    listStoreCatalog,
    resolveStoreQr,
    listStoreLocations,
    registerStoreCustomer,
    loginStoreCustomer,
    getStoreCustomerMe,
    listStoreCustomerAddresses,
    createStoreCustomerAddress,
    updateStoreCustomerAddress,
    setDefaultStoreCustomerAddress,
    deleteStoreCustomerAddress,
    cartQuote,
    checkout,
    trackOrder,
    claimOrder,
    cancelOrder,
    listStoreCustomerOrders,
    getStorefrontFollowStatus,
    followStorefront,
    unfollowStorefront
};
