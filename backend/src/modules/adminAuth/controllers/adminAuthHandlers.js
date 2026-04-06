import { adminLoginUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import logger from '../../../config/logger.js';

export const adminLogin = async (req, res) => {
  try {
    const username = req.body?.username || '';
    const sourceIp = req.headers?.['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const result = await adminLoginUseCase({
      username,
      password: req.body?.password,
      sourceIp
    });

    if (result?.success === false) {
      logger.warn('[AdminAuth] Login failed', {
        username,
        source_ip: sourceIp,
        request_id: req.requestId || req.headers?.['x-request-id'] || null,
        reason: result.error?.code || 'AUTHENTICATION_FAILED'
      });
    } else {
      logger.info('[AdminAuth] Login succeeded', {
        username,
        source_ip: sourceIp,
        request_id: req.requestId || req.headers?.['x-request-id'] || null
      });
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        message: 'Admin login successful',
        token: result.data?.token,
        admin: result.data?.admin
      })
    });
  } catch (error) {
    logger.error('[AdminAuth] Login handler error', {
      message: error?.message || 'Unknown admin login error'
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export default {
  adminLogin
};
