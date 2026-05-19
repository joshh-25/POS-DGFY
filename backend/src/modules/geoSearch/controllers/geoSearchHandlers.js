import { geoSearchUseCase } from '../index.js';
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

export const searchNearbyStores = async (req, res, next) => {
    try {
        const q = req.validatedQuery || req.query;

        const result = await geoSearchUseCase({
            query: q.query,
            latitude: Number(q.latitude),
            longitude: Number(q.longitude),
            radius: Number(q.radius),
            stockFilter: q.stock_filter,
            page: Number(q.page),
            limit: Number(q.limit)
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

export default { searchNearbyStores };
