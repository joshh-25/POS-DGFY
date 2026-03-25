import {
    listPosCatalogUseCase,
    checkoutPosUseCase,
    listPosTransactionsUseCase,
    getPosTransactionByIdUseCase,
    closeDayZReadingUseCase,
    getDailyZReadingUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

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

export const listCatalog = async (req, res, next) => {
    try {
        const result = await listPosCatalogUseCase({ query: req.validatedQuery || req.query });
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
        const payload = req.validatedData || req.body;
        const terminalIdHeader = req.headers['x-pos-terminal-id'];
        if (!payload.terminal_id && typeof terminalIdHeader === 'string' && terminalIdHeader.trim()) {
            payload.terminal_id = terminalIdHeader.trim();
        }

        const result = await checkoutPosUseCase({
            payload,
            userId: req.user.user_id
        });

        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_checkout_completed',
            surface: 'pos',
            action: 'checkout',
            result,
            successMetadataResolver: (data) => ({
                pos_transaction_id: data?.transaction?.pos_transaction_id ?? null,
                invoice_number: data?.transaction?.invoice_number ?? null,
                idempotent_replay: Boolean(data?.idempotent_replay)
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS checkout completed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listTransactions = async (req, res, next) => {
    try {
        const result = await listPosTransactionsUseCase({
            query: req.validatedQuery || req.query
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_transactions_viewed',
            surface: 'pos',
            action: 'list_transactions',
            result,
            successMetadataResolver: (data) => ({
                result_count: Array.isArray(data?.transactions) ? data.transactions.length : 0
            })
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

export const getTransactionById = async (req, res, next) => {
    try {
        const result = await getPosTransactionByIdUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_transaction_viewed',
            surface: 'pos',
            action: 'view_transaction',
            result,
            successMetadataResolver: (data) => ({
                pos_transaction_id: data?.pos_transaction_id ?? req.params.id
            })
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

export const closeDayZReading = async (req, res, next) => {
    try {
        const result = await closeDayZReadingUseCase({
            businessDateInput: req.validatedData?.business_date || null
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_z_reading_generated',
            surface: 'pos',
            action: 'close_day',
            result,
            successMetadataResolver: (data) => ({
                business_date: data?.business_date ?? null,
                transaction_count: data?.summary?.transaction_count ?? 0
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Z-reading generated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getDailyZReading = async (req, res, next) => {
    try {
        const result = await getDailyZReadingUseCase({
            businessDateInput: req.validatedParams?.date || req.params.date
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

export default {
    listCatalog,
    checkout,
    listTransactions,
    getTransactionById,
    closeDayZReading,
    getDailyZReading
};

