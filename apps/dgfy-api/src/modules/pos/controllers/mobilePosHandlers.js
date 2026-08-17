import {
    getMobilePosCatalogBootstrapUseCase,
    getMobilePosSettingsBootstrapUseCase,
    getMobilePosDevicePolicyUseCase,
    syncMobilePosCheckoutsUseCase,
    syncMobilePosItemsUseCase,
    syncMobilePosShiftsUseCase,
    syncMobilePosHardwareEventsUseCase,
    acknowledgeMobilePosCheckpointUseCase
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

const buildSuccessPayload = (result, message = null) => ({
    success: true,
    data: result.data,
    ...(message ? { message } : {}),
    timestamp: timestamp()
});

export const getCatalogBootstrap = async (req, res, next) => {
    try {
        const result = await getMobilePosCatalogBootstrapUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getSettingsBootstrap = async (req, res, next) => {
    try {
        const result = await getMobilePosSettingsBootstrapUseCase({ user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getDevicePolicy = async (req, res, next) => {
    try {
        const result = await getMobilePosDevicePolicyUseCase();
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const syncCheckouts = async (req, res, next) => {
    try {
        const result = await syncMobilePosCheckoutsUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result, 'Mobile POS checkout sync processed'),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const syncItems = async (req, res, next) => {
    try {
        const result = await syncMobilePosItemsUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result, 'Mobile POS item sync processed'),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const syncShifts = async (req, res, next) => {
    try {
        const result = await syncMobilePosShiftsUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result, 'Mobile POS shift sync processed'),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const syncHardwareEvents = async (req, res, next) => {
    try {
        const result = await syncMobilePosHardwareEventsUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result, 'Mobile POS hardware event sync processed'),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const acknowledgeCheckpoint = async (req, res, next) => {
    try {
        const result = await acknowledgeMobilePosCheckpointUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => buildSuccessPayload(result, 'Mobile POS checkpoint acknowledged'),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export default {
    getCatalogBootstrap,
    getSettingsBootstrap,
    getDevicePolicy,
    syncCheckouts,
    syncItems,
    syncShifts,
    syncHardwareEvents,
    acknowledgeCheckpoint
};
