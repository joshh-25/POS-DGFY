import { calculateRouteUseCase } from '../index.js';
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

export const calculateRoute = async (req, res, next) => {
    try {
        const q = req.validatedQuery || req.query;

        const result = await calculateRouteUseCase({
            originLat: Number(q.origin_lat),
            originLng: Number(q.origin_lng),
            destLat: Number(q.dest_lat),
            destLng: Number(q.dest_lng),
            profile: q.profile
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

export default { calculateRoute };
