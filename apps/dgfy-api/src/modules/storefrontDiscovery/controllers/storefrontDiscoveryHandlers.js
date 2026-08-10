import {
    listStorefrontDiscoveryUseCase,
    listStorefrontMapPinsUseCase,
    getStorefrontProfileUseCase,
    upsertExternalStorefrontListingUseCase,
    deleteExternalStorefrontListingUseCase,
    listExternalStorefrontListingsUseCase
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

export const listStorefrontDiscovery = async (req, res, next) => {
    try {
        const result = await listStorefrontDiscoveryUseCase({
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

export const listStorefrontMapPins = async (req, res, next) => {
    try {
        const result = await listStorefrontMapPinsUseCase({
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

export const getStorefrontProfile = async (req, res, next) => {
    try {
        const result = await getStorefrontProfileUseCase({
            slug: req.validatedParams?.slug || req.params.slug
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

export const upsertExternalListing = async (req, res, next) => {
    try {
        const result = await upsertExternalStorefrontListingUseCase({
            slug: req.validatedParams?.slug || req.params.slug,
            payload: req.validatedData || req.body
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => (result.data?.status === 'created' ? 201 : 200),
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

export const deleteExternalListing = async (req, res, next) => {
    try {
        const result = await deleteExternalStorefrontListingUseCase({
            slug: req.validatedParams?.slug || req.params.slug
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

export const listExternalListings = async (req, res, next) => {
    try {
        const result = await listExternalStorefrontListingsUseCase();

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

export default {
    listStorefrontDiscovery,
    listStorefrontMapPins,
    getStorefrontProfile,
    upsertExternalListing,
    deleteExternalListing,
    listExternalListings
};
