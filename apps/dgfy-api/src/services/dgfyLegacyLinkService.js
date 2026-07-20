import { requestEmailOtp, verifyEmailOtp, EMAIL_OTP_PURPOSES } from './emailOtpService.js';
import { verifyToken, isTokenBlacklisted } from './authService.js';
import { getCookie, SESSION_COOKIE_NAMES } from '../utils/browserSessionCookies.js';
import * as landlordService from './landlordService.js';
import { buildLegacyDgfyLinkStatus } from './dgfyLegacyAccessPolicy.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getDgfyTokenFromRequest = (req, explicitToken = '') => {
  const normalizedExplicit = String(explicitToken || '').trim();
  if (normalizedExplicit) return normalizedExplicit;
  return getCookie(req, SESSION_COOKIE_NAMES.dgfy) || '';
};

const getActiveDgfyAccountFromToken = async (token) => {
  if (!token) {
    const error = new Error('DGFY account authentication is required to link this IMS/POS user.');
    error.statusCode = 401;
    throw error;
  }

  const decoded = verifyToken(token);
  if (decoded?.token_scope !== 'dgfy' || !decoded?.dgfy_account_id) {
    const error = new Error('A valid DGFY account session is required to link this IMS/POS user.');
    error.statusCode = 401;
    throw error;
  }
  if (await isTokenBlacklisted(token)) {
    const error = new Error('DGFY account session has been revoked.');
    error.statusCode = 401;
    throw error;
  }

  const { dgfyAccountRepository } = await import('../modules/dgfy/index.js');
  const account = await dgfyAccountRepository.findById(decoded.dgfy_account_id);
  if (!account || !account.is_active || account.deleted_at) {
    const error = new Error('DGFY account is unavailable.');
    error.statusCode = 401;
    throw error;
  }
  return account;
};

export const requestLegacyLinkEmailOtp = async ({ req, metadata = {} } = {}) => {
  const tenantId = req?.tenant?.id || null;
  const user = req?.user || null;
  const email = normalizeEmail(user?.email);
  if (!tenantId || !user?.user_id || !email) {
    const error = new Error('Authenticated tenant user context is required.');
    error.statusCode = 401;
    throw error;
  }

  return requestEmailOtp({
    purpose: EMAIL_OTP_PURPOSES.DGFY_LEGACY_LINK,
    email,
    tenantId,
    metadata: {
      user_id: user.user_id,
      ...metadata
    }
  });
};

export const completeLegacyLink = async ({ req, body = {}, metadata = {} } = {}) => {
  const tenant = req?.tenant || null;
  const user = req?.user || null;
  const tenantId = tenant?.id || null;
  const email = normalizeEmail(user?.email);
  if (!tenantId || !user?.user_id || !email) {
    const error = new Error('Authenticated tenant user context is required.');
    error.statusCode = 401;
    throw error;
  }

  await verifyEmailOtp({
    purpose: EMAIL_OTP_PURPOSES.DGFY_LEGACY_LINK,
    email,
    code: body?.email_otp_code || body?.emailOtpCode || body?.code,
    tenantId
  });

  const account = await getActiveDgfyAccountFromToken(
    getDgfyTokenFromRequest(req, body?.dgfy_account_token || body?.dgfyAccountToken)
  );

  if (normalizeEmail(account.email) !== email) {
    const error = new Error('The signed-in DGFY account email must match this IMS/POS user email.');
    error.statusCode = 409;
    error.code = 'DGFY_LEGACY_LINK_EMAIL_MISMATCH';
    throw error;
  }

  const { dgfyAccountRepository } = await import('../modules/dgfy/index.js');
  const isFounder = user.is_master_admin === true
    && (!tenant.owner_dgfy_account_id || String(tenant.owner_dgfy_account_id) === String(account.id));
  let membership;
  try {
    membership = await dgfyAccountRepository.transaction(async (transaction) => {
      const linkedMembership = await dgfyAccountRepository.upsertAcceptedLegacyMembership({
        dgfyAccountId: account.id,
        tenantId,
        tenantUserId: user.user_id,
        role: user.role || 'staff',
        source: isFounder ? 'founder' : 'invite'
      }, { transaction });

      if (isFounder && tenant && !tenant.owner_dgfy_account_id) {
        await tenant.update({ owner_dgfy_account_id: account.id }, { transaction });
      }
      await landlordService.addEmailTenantMapping(email, tenantId, { transaction });
      await dgfyAccountRepository.createBusinessAuditLogStrict?.({
        dgfy_account_id: account.id,
        tenant_id: tenantId,
        membership_id: linkedMembership.id,
        action: 'legacy_link_completed',
        result: 'success',
        request_id: metadata.request_id || null,
        ip_address: metadata.ip_address || null,
        user_agent: metadata.user_agent || null,
        metadata: {
          tenant_user_id: user.user_id,
          source: linkedMembership.source
        }
      }, { transaction });

      return linkedMembership;
    });
  } catch (error) {
    await dgfyAccountRepository.createBusinessAuditLog?.({
      dgfy_account_id: account.id,
      tenant_id: tenantId,
      membership_id: null,
      action: 'legacy_link_failed',
      result: 'failure',
      reason: error.message || 'Legacy DGFY link failed.',
      request_id: metadata.request_id || null,
      ip_address: metadata.ip_address || null,
      user_agent: metadata.user_agent || null,
      metadata: {
        tenant_user_id: user.user_id,
        source: isFounder ? 'founder' : 'invite'
      }
    });
    throw error;
  }

  const status = await buildLegacyDgfyLinkStatus({ tenantId, user });
  return {
    membership_id: membership.id,
    tenant_id: tenantId,
    dgfy_account_id: account.id,
    ...status
  };
};

export const startLegacyRegistrationHandoff = async ({ req } = {}) => {
  const user = req?.user || null;
  const email = normalizeEmail(user?.email);
  if (!email) {
    const error = new Error('Authenticated tenant user email is required.');
    error.statusCode = 401;
    throw error;
  }

  return {
    email,
    intent: 'legacy-link',
    return_to: '/dgfy/auth?intent=legacy-link',
    message: 'Create a DGFY account with this email, then return here to complete linking.'
  };
};

export default {
  requestLegacyLinkEmailOtp,
  completeLegacyLink,
  startLegacyRegistrationHandoff
};
