import {
    activateVoucherUseCase,
    archiveVoucherUseCase,
    createVoucherUseCase,
    getVoucherUseCase,
    listVouchersUseCase,
    pauseVoucherUseCase,
    updateVoucherUseCase
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

export const listVouchers = async (req, res, next) => {
    try {
        const result = await listVouchersUseCase({ query: req.validatedQuery });
        return respond(req, res, result, 'Vouchers retrieved successfully');
    } catch (error) {
        return next(error);
    }
};

export const getVoucher = async (req, res, next) => {
    try {
        const result = await getVoucherUseCase({ voucherId: req.validatedParams.voucher_id });
        return respond(req, res, result, 'Voucher retrieved successfully');
    } catch (error) {
        return next(error);
    }
};

export const createVoucher = async (req, res, next) => {
    try {
        const result = await createVoucherUseCase({ payload: req.validatedData, user: req.user });
        return respond(req, res, result, 'Voucher created successfully', 201);
    } catch (error) {
        return next(error);
    }
};

export const updateVoucher = async (req, res, next) => {
    try {
        const result = await updateVoucherUseCase({
            voucherId: req.validatedParams.voucher_id,
            payload: req.validatedData,
            user: req.user
        });
        return respond(req, res, result, 'Voucher updated successfully');
    } catch (error) {
        return next(error);
    }
};

export const activateVoucher = async (req, res, next) => {
    try {
        const result = await activateVoucherUseCase({ voucherId: req.validatedParams.voucher_id });
        return respond(req, res, result, 'Voucher activated successfully');
    } catch (error) {
        return next(error);
    }
};

export const pauseVoucher = async (req, res, next) => {
    try {
        const result = await pauseVoucherUseCase({ voucherId: req.validatedParams.voucher_id });
        return respond(req, res, result, 'Voucher paused successfully');
    } catch (error) {
        return next(error);
    }
};

export const archiveVoucher = async (req, res, next) => {
    try {
        const result = await archiveVoucherUseCase({ voucherId: req.validatedParams.voucher_id });
        return respond(req, res, result, 'Voucher archived successfully');
    } catch (error) {
        return next(error);
    }
};
