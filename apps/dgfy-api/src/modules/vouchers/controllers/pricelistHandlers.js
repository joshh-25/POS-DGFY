import {
    archivePricelistUseCase,
    createPricelistUseCase,
    getPricelistUseCase,
    listPricelistsUseCase,
    publishPricelistUseCase,
    replacePricelistItemsUseCase,
    updatePricelistUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();

const respond = (req, res, result, message, successStatusCode = 200) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => successStatusCode,
    successPayloadResolver: () => ({ success: true, data: result.data, message, timestamp: timestamp() }),
    errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        request_id: req.requestId || res.locals?.requestId || null,
        timestamp: timestamp()
    })
});

export const listPricelists = async (req, res, next) => {
    try {
        const result = await listPricelistsUseCase({ query: req.validatedQuery });
        return respond(req, res, result, 'Pricelists retrieved successfully');
    } catch (error) {
        return next(error);
    }
};

export const getPricelist = async (req, res, next) => {
    try {
        const result = await getPricelistUseCase({ pricelistId: req.validatedParams.pricelist_id });
        return respond(req, res, result, 'Pricelist retrieved successfully');
    } catch (error) {
        return next(error);
    }
};

export const createPricelist = async (req, res, next) => {
    try {
        const result = await createPricelistUseCase({ payload: req.validatedData });
        return respond(req, res, result, 'Pricelist created successfully', 201);
    } catch (error) {
        return next(error);
    }
};

export const updatePricelist = async (req, res, next) => {
    try {
        const result = await updatePricelistUseCase({
            pricelistId: req.validatedParams.pricelist_id,
            payload: req.validatedData
        });
        return respond(req, res, result, 'Pricelist updated successfully');
    } catch (error) {
        return next(error);
    }
};

export const replacePricelistItems = async (req, res, next) => {
    try {
        const result = await replacePricelistItemsUseCase({
            pricelistId: req.validatedParams.pricelist_id,
            payload: req.validatedData
        });
        return respond(req, res, result, 'Pricelist items updated successfully');
    } catch (error) {
        return next(error);
    }
};

export const publishPricelist = async (req, res, next) => {
    try {
        const result = await publishPricelistUseCase({ pricelistId: req.validatedParams.pricelist_id });
        return respond(req, res, result, 'Pricelist published successfully');
    } catch (error) {
        return next(error);
    }
};

export const archivePricelist = async (req, res, next) => {
    try {
        const result = await archivePricelistUseCase({ pricelistId: req.validatedParams.pricelist_id });
        return respond(req, res, result, 'Pricelist archived successfully');
    } catch (error) {
        return next(error);
    }
};
