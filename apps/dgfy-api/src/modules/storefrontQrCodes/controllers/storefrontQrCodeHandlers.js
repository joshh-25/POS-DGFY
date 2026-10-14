import {
    createStorefrontQrCodeUseCase,
    deactivateStorefrontQrCodeUseCase,
    listStorefrontQrCodesUseCase,
    updateStorefrontQrCodeUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;

const errorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

const respond = (req, res, result, successStatusCodeResolver = () => 200) => sendUseCaseResult(res, result, {
    successStatusCodeResolver,
    successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
    errorPayloadResolver: (failure) => errorPayload(req, res, failure)
});

export const list = async (req, res, next) => {
    try {
        const result = await listStorefrontQrCodesUseCase({
            query: req.validatedQuery || req.query,
            user: req.user,
            tenantSlug: req.tenant?.slug || null
        });
        return respond(req, res, result);
    } catch (error) { return next(error); }
};

export const create = async (req, res, next) => {
    try {
        const result = await createStorefrontQrCodeUseCase({
            payload: req.validatedData || req.body,
            user: req.user,
            tenantSlug: req.tenant?.slug || null
        });
        return respond(req, res, result, () => 201);
    } catch (error) { return next(error); }
};

export const update = async (req, res, next) => {
    try {
        const result = await updateStorefrontQrCodeUseCase({
            id: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body,
            user: req.user,
            tenantSlug: req.tenant?.slug || null
        });
        return respond(req, res, result);
    } catch (error) { return next(error); }
};

export const deactivate = async (req, res, next) => {
    try {
        const result = await deactivateStorefrontQrCodeUseCase({
            id: req.validatedParams?.id || req.params.id,
            user: req.user,
            tenantSlug: req.tenant?.slug || null
        });
        return respond(req, res, result);
    } catch (error) { return next(error); }
};
