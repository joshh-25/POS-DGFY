import {
  registerUseCase,
  loginUseCase,
  refreshTokenUseCase,
  blacklistTokenUseCase,
  lookupEmailUseCase,
  validateCompanyTokenUseCase,
  validateInviteTokenUseCase,
  acceptInvitationUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { complianceRepository } from '../../compliance/index.js';
import { requestEmailOtp, EMAIL_OTP_PURPOSES } from '../../../services/emailOtpService.js';
import {
  clearTenantSessionCookies,
  getSubmittedRefreshToken,
  getTenantRefreshToken,
  isMobileClientRequest,
  issueCsrfToken,
  setTenantSessionCookies,
  stripBrowserRefreshToken
} from '../../../utils/browserSessionCookies.js';
import dbStore from '../../../utils/dbStore.js';

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

const withTenantCompanyPayload = (session = {}, tenantToken = null, req = null) => {
  // Mobile clients can't use the httpOnly refresh cookie, so they need the
  // refresh token in the body to persist it themselves; browser clients
  // keep the existing httpOnly-cookie-only (more XSS-resistant) behavior.
  const payload = isMobileClientRequest(req) ? { ...session } : stripBrowserRefreshToken(session);
  const token = String(tenantToken || payload?.company?.token || '').trim();
  if (!token || !payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    company: {
      ...(payload.company || {}),
      token
    }
  };
};

export const resolveAuthEmailOtpTenantId = (req, purpose) => {
  if (purpose === EMAIL_OTP_PURPOSES.DGFY_ACCOUNT_VERIFICATION) {
    return null;
  }
  return req.tenant?.id || null;
};

const persistSecurityAuditEvent = async (req, {
  eventType,
  operation,
  actorUserId = null,
  metadata = {}
} = {}) => {
  const tenantId = req?.tenant?.id;
  if (!tenantId) return;

  try {
    await complianceRepository.createAuditLog({
      tenant_id: tenantId,
      event_type: eventType,
      operation,
      decision: 'allow',
      reason_code: 'ALLOWED',
      actor_user_id: actorUserId,
      metadata: {
        ip_address: req?.ip || null,
        user_agent: req?.headers?.['user-agent'] || null,
        ...metadata
      }
    });
  } catch {
    // Security audit evidence is best-effort and must not block auth flows.
  }
};

const persistTenantAuditEvent = async (req, {
  eventType,
  action = 'UPDATE',
  entityType = 'auth_session',
  metadata = {}
} = {}) => {
  try {
    const AuditLog = dbStore.get('AuditLog');
    if (!AuditLog || !req?.user) return;
    const terminalId = String(req.headers?.['x-pos-terminal-id'] || '').trim().toUpperCase() || null;
    await AuditLog.create({
      user_id: Number.parseInt(req.user.user_id, 10) || null,
      entity_type: entityType,
      entity_id: Number.parseInt(req.user.user_id, 10) || null,
      action,
      event_type: eventType,
      actor_username: String(req.user.username || req.user.email || '').trim().slice(0, 120) || null,
      terminal_id: terminalId,
      request_id: requestId(req),
      changes: {
        event: eventType,
        terminal_id: terminalId,
        request_id: requestId(req),
        ...metadata
      }
    });
  } catch {
    // Security audit is best-effort and must not block logout.
  }
};

export const register = async (req, res, next) => {
  try {
    const userData = req.validatedData;
    const result = await registerUseCase({ userData });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User registered successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const requestAuthEmailOtp = async (req, res) => {
  try {
    const { purpose, email, invitation_token: invitationToken } = req.validatedData;
    let targetEmail = email;
    let tenantId = resolveAuthEmailOtpTenantId(req, purpose);

    if (purpose === EMAIL_OTP_PURPOSES.INVITATION_ACCEPTANCE) {
      const inviteResult = await validateInviteTokenUseCase({ token: invitationToken });
      if (!inviteResult?.success) {
        return sendUseCaseResult(res, inviteResult, {
          errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
      }
      targetEmail = inviteResult.data?.email;
      tenantId = req.tenant?.id || inviteResult.data?.tenant_id || null;
    }

    const otp = await requestEmailOtp({
      purpose,
      email: targetEmail,
      tenantId,
      metadata: {
        request_id: requestId(req, res),
        ip_address: req.ip || null
      }
    });

    return res.status(202).json({
      success: true,
      data: otp,
      message: 'Email verification code sent',
      timestamp: timestamp()
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      data: null,
      message: error.message || 'Email verification failed',
      error_code: error.code || 'EMAIL_OTP_ERROR',
      timestamp: timestamp()
    });
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.validatedData;
    const result = await loginUseCase({ email, password });

    if (result?.success) {
      setTenantSessionCookies(res, {
        refreshToken: result.data?.refreshToken,
        tenantToken: req.headers?.['x-company-token'] || req.tenant?.company_token || null
      });
    }

    if (result?.success) {
      await persistSecurityAuditEvent(req, {
        eventType: 'security_login',
        operation: 'auth.login',
        actorUserId: Number.parseInt(result?.data?.user_id, 10) || null,
        metadata: {
          actor_email: String(result?.data?.email || email || '').trim() || null
        }
      });
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: withTenantCompanyPayload(
          result.data,
          req.headers?.['x-company-token'] || req.tenant?.company_token || null,
          req
        ),
        message: 'Login successful',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = getSubmittedRefreshToken(req);
    const result = await refreshTokenUseCase({ refreshToken });

    if (result?.success) {
      setTenantSessionCookies(res, {
        refreshToken: result.data?.refreshToken,
        tenantToken: req.headers?.['x-company-token'] || req.tenant?.company_token || null
      });
    }

    if (result?.success) {
      await persistSecurityAuditEvent(req, {
        eventType: 'security_sensitive_action',
        operation: 'auth.refresh_token',
        actorUserId: null,
        metadata: {
          action: 'refresh_token_rotation'
        }
      });
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: withTenantCompanyPayload(
          result.data,
          req.headers?.['x-company-token'] || req.tenant?.company_token || null,
          req
        ),
        message: 'Token refreshed successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const issueBrowserCsrfToken = async (_req, res) => {
  issueCsrfToken(res);
  return res.status(200).json({
    success: true,
    data: null,
    message: 'CSRF token issued',
    timestamp: timestamp()
  });
};

export const logout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token) {
      const result = await blacklistTokenUseCase({ token });
      unwrapApplicationResultOrThrow(result, 'Logout failed');
    }

    const refreshToken = getTenantRefreshToken(req);
    if (refreshToken) {
      const result = await blacklistTokenUseCase({ token: refreshToken });
      unwrapApplicationResultOrThrow(result, 'Refresh token logout failed');
    }
    clearTenantSessionCookies(res);

    await persistSecurityAuditEvent(req, {
      eventType: 'security_logout',
      operation: 'auth.logout',
      actorUserId: Number.parseInt(req?.user?.user_id, 10) || null,
      metadata: {
        actor_email: String(req?.user?.email || '').trim() || null
      }
    });
    await persistTenantAuditEvent(req, {
      eventType: req.headers?.['x-pos-terminal-id'] ? 'terminal_logout' : 'auth_logout',
      metadata: { actor_email: String(req?.user?.email || '').trim() || null }
    });

    return res.status(200).json({
      success: true,
      data: null,
      message: 'Logout successful',
      timestamp: timestamp()
    });
  } catch (error) {
    next(error);
  }
};

export const lookupEmail = async (req, res, next) => {
  try {
    const { email } = req.validatedData;
    const result = await lookupEmailUseCase({ email });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => {
        const tenants = result.data || [];
        return tenants.length === 0 ? 404 : 200;
      },
      successPayloadResolver: () => {
        const tenants = result.data || [];

        if (tenants.length === 0) {
          return {
            success: false,
            data: null,
            message: 'Email not registered in any company',
            timestamp: timestamp()
          };
        }

        if (tenants.length === 1) {
          return {
            success: true,
            data: {
              company_token: tenants[0].company_token,
              company_name: tenants[0].name,
              tenant_id: tenants[0].id,
              status: tenants[0].status,
              plan: tenants[0].plan || 'standard',
              rejection_reason: tenants[0].rejection_reason || null
            },
            message: 'Tenant found',
            timestamp: timestamp()
          };
        }

        return {
          success: true,
          data: {
            multiple: true,
            tenants: tenants.map((tenant) => ({
              id: tenant.id,
              name: tenant.name,
              company_token: tenant.company_token,
              status: tenant.status,
              plan: tenant.plan || 'standard',
              rejection_reason: tenant.rejection_reason || null
            }))
          },
          message: 'Multiple tenants found',
          timestamp: timestamp()
        };
      },
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const validateToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Token is required',
        timestamp: timestamp()
      });
    }

    const result = await validateCompanyTokenUseCase({ token });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => (result.data ? 200 : 404),
      successPayloadResolver: () => {
        if (!result.data) {
          return {
            success: false,
            data: null,
            message: 'Invalid or expired company token',
            timestamp: timestamp()
          };
        }

        return {
          success: true,
          data: {
            company_name: result.data.name,
            tenant_id: result.data.id,
            status: result.data.status || null,
            rejection_reason: result.data.rejection_reason || null
          },
          message: 'Token is valid',
          timestamp: timestamp()
        };
      },
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const validateInviteToken = async (req, res, next) => {
  try {
    const { token } = req.validatedData;
    const result = await validateInviteTokenUseCase({ token });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Invitation token is valid',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        timestamp: timestamp()
      })
    });
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const { token, username, password, phone_number: phoneNumber, email_otp_code: emailOtpCode } = req.validatedData;
    const result = await acceptInvitationUseCase({ token, username, password, phoneNumber, emailOtpCode });

    if (result?.success) {
      setTenantSessionCookies(res, {
        refreshToken: result.data?.refreshToken,
        tenantToken: result.data?.company?.token || req.headers?.['x-company-token'] || null
      });
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: {
          user: {
            user_id: result.data.user_id,
            username: result.data.username,
            email: result.data.email,
            phone_number: result.data.phone_number || null,
            role: result.data.role,
            permissions: result.data.permissions || [],
            is_master_admin: result.data.is_master_admin || false
          },
          token: result.data.token,
          expiresIn: result.data.expiresIn,
          company: result.data.company || null
        },
        message: 'Account created successfully. You are now logged in.',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        timestamp: timestamp()
      })
    });
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  requestAuthEmailOtp,
  login,
  refreshToken,
  issueBrowserCsrfToken,
  logout,
  lookupEmail,
  validateToken,
  validateInviteToken,
  acceptInvitation
};
