import {
  generateTokenUseCase,
  validateTokenUseCase,
  receiveViaTokenUseCase,
  markTokenUsedUseCase
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

export const generateToken = async (req, res, next) => {
  try {
    const { order_type: orderType, order_id: orderId, expiry_days: expiryDays } = req.body;
    const userId = req.user.user_id;

    const result = await generateTokenUseCase({
      orderType,
      orderId,
      userId,
      expiryDays
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'receive_token_generated',
      surface: 'receive_tokens',
      action: 'generate_receive_token',
      result,
      successMetadataResolver: () => ({
        order_type: orderType,
        order_id: orderId
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Token generated successfully'
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const validateToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await validateTokenUseCase({ token });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'receive_token_validated',
      surface: 'receive_tokens',
      action: 'validate_receive_token',
      result
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Token is valid'
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const receiveViaToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await receiveViaTokenUseCase({ token, payload: req.body });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'receive_token_consumed',
      surface: 'receive_tokens',
      action: 'receive_via_token',
      result
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Received successfully'
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const markTokenUsed = async (req, res, next) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.user_id || null;

    const result = await markTokenUsedUseCase({ tokenId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'receive_token_marked_used',
      surface: 'receive_tokens',
      action: 'mark_receive_token_used',
      result,
      successMetadataResolver: () => ({
        token_id: tokenId
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Token marked as used'
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  generateToken,
  validateToken,
  receiveViaToken,
  markTokenUsed
};
