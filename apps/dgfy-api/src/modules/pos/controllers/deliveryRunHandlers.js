// Phase 225 (#1273/#1081): transport-only controllers for the delivery run API. No model imports
// here -- all data access happens in deliveryRunUseCases.js / deliveryRunRepository.js, per
// docs/architecture/ARCHITECTURE_BOUNDARIES.md's controller boundary.
import {
    createDeliveryRunUseCase,
    listDeliveryRunsUseCase,
    getDeliveryRunUseCase,
    updateDeliveryRunUseCase,
    setDeliveryRunPersonnelUseCase,
    addDeliveryRunMembersUseCase,
    removeDeliveryRunMemberUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req?.requestId || res?.locals?.requestId || null;

const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

const buildAuditContext = (req) => ({
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
});

export const createDeliveryRun = async (req, res, next) => {
    try {
        const result = await createDeliveryRunUseCase({
            payload: req.validatedData || req.body,
            user: req.user,
            auditContext: buildAuditContext(req)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Delivery run created successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listDeliveryRuns = async (req, res, next) => {
    try {
        const result = await listDeliveryRunsUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Delivery runs retrieved successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getDeliveryRun = async (req, res, next) => {
    try {
        const result = await getDeliveryRunUseCase({
            deliveryRunId: req.validatedParams?.deliveryRunId || req.params.deliveryRunId,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Delivery run retrieved successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryRun = async (req, res, next) => {
    try {
        const result = await updateDeliveryRunUseCase({
            deliveryRunId: req.validatedParams?.deliveryRunId || req.params.deliveryRunId,
            payload: req.validatedData || req.body,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Delivery run updated successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const setDeliveryRunPersonnel = async (req, res, next) => {
    try {
        const result = await setDeliveryRunPersonnelUseCase({
            deliveryRunId: req.validatedParams?.deliveryRunId || req.params.deliveryRunId,
            payload: req.validatedData || req.body,
            user: req.user,
            auditContext: buildAuditContext(req)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Delivery run personnel set successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const addDeliveryRunMembers = async (req, res, next) => {
    try {
        const result = await addDeliveryRunMembersUseCase({
            deliveryRunId: req.validatedParams?.deliveryRunId || req.params.deliveryRunId,
            payload: req.validatedData || req.body,
            user: req.user,
            auditContext: buildAuditContext(req)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Members added to delivery run successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const removeDeliveryRunMember = async (req, res, next) => {
    try {
        const result = await removeDeliveryRunMemberUseCase({
            deliveryRunId: req.validatedParams?.deliveryRunId || req.params.deliveryRunId,
            posTransactionId: req.validatedParams?.posTransactionId || req.params.posTransactionId,
            user: req.user,
            auditContext: buildAuditContext(req)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Member removed from delivery run successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};
