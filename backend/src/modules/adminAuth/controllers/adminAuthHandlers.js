import { adminLoginUseCase, adminLogoutUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import logger from '../../../config/logger.js';
import {
  clearSessionCookie,
  getCookie,
  SESSION_COOKIE_NAMES,
  setBearerSessionCookie
} from '../../../utils/browserSessionCookies.js';
import { createPlatformAdminRepository } from '../../platformAdmin/repositories/platformAdminRepository.js';

export const adminLogin = async (req, res) => {
  try {
    const username = req.body?.username || '';
    const sourceIp = req.headers?.['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const result = await adminLoginUseCase({
      username,
      password: req.body?.password,
      sourceIp,
      userAgent: req.headers?.['user-agent'] || ''
    });

    if (result?.success === false) {
      logger.warn('[AdminAuth] Login failed', {
        username,
        source_ip: sourceIp,
        request_id: req.requestId || req.headers?.['x-request-id'] || null,
        reason: result.error?.code || 'AUTHENTICATION_FAILED'
      });
    } else {
      if (result.data?.token) {
        setBearerSessionCookie(res, SESSION_COOKIE_NAMES.admin, result.data.token, {
          maxAgeMs: 8 * 60 * 60 * 1000
        });
      }
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

export const adminLogout = async (req, res) => {
  try {
    const authHeader = req.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : getCookie(req, SESSION_COOKIE_NAMES.admin);

    if (req.admin?.session_id) await createPlatformAdminRepository().revokeSession(req.admin.session_id, 'logout');
    const result = await adminLogoutUseCase({ token });
    clearSessionCookie(res, SESSION_COOKIE_NAMES.admin);

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        message: 'Admin logout successful',
        data: result.data
      })
    });
  } catch (error) {
    logger.error('[AdminAuth] Logout handler error', {
      message: error?.message || 'Unknown admin logout error'
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const adminMe = async (req, res) => res.json({
  success: true,
  data: {
    id: req.admin.id,
    username: req.admin.username,
    is_master: req.admin.is_master,
    permissions: req.admin.permissions,
    temporary_password_active: req.admin.temporary_password_active
  }
});

export default {
  adminLogin,
  adminLogout,
  adminMe
};
