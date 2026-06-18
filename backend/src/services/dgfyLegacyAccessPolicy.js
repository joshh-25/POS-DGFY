const DEFAULT_GRACE_END = '2027-06-17';

const normalizeDateOnly = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return DEFAULT_GRACE_END;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : DEFAULT_GRACE_END;
};

const graceEndDate = () => {
  const dateOnly = normalizeDateOnly(process.env.LEGACY_TENANT_LOGIN_GRACE_END);
  return new Date(`${dateOnly}T23:59:59.999Z`);
};

export const getLegacyTenantLoginGraceEndDate = () => graceEndDate();

export const isLegacyTenantLoginGraceEnabled = () => {
  return String(process.env.LEGACY_TENANT_LOGIN_GRACE_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
};

export const findAcceptedDgfyMembershipForTenantUser = async ({ tenantId, tenantUserId } = {}) => {
  const resolvedTenantId = String(tenantId || '').trim();
  const resolvedTenantUserId = Number.parseInt(tenantUserId, 10);
  if (!resolvedTenantId || !Number.isInteger(resolvedTenantUserId) || resolvedTenantUserId <= 0) {
    return null;
  }

  const { DgfyAccountTenantMembership } = await import('../models/index.js');
  return DgfyAccountTenantMembership.findOne({
    where: {
      tenant_id: resolvedTenantId,
      tenant_user_id: resolvedTenantUserId,
      status: 'accepted'
    }
  });
};

export const buildLegacyDgfyLinkStatus = async ({ tenantId, user, now = new Date() } = {}) => {
  const graceEndsAt = getLegacyTenantLoginGraceEndDate();
  const membership = await findAcceptedDgfyMembershipForTenantUser({
    tenantId,
    tenantUserId: user?.user_id
  });

  if (membership) {
    return {
      dgfy_link_status: 'linked',
      legacy_grace_expires_at: graceEndsAt.toISOString(),
      dgfy_membership_id: membership.id,
      dgfy_account_id: membership.dgfy_account_id || null,
      can_legacy_login: false,
      legacy_login_block_reason: null
    };
  }

  const graceEnabled = isLegacyTenantLoginGraceEnabled();
  const graceActive = graceEnabled && now.getTime() <= graceEndsAt.getTime();
  return {
    dgfy_link_status: graceActive ? 'not_linked' : 'legacy_grace_expired',
    legacy_grace_expires_at: graceEndsAt.toISOString(),
    dgfy_membership_id: null,
    dgfy_account_id: null,
    can_legacy_login: graceActive,
    legacy_login_block_reason: graceActive ? null : 'DGFY_LINK_REQUIRED'
  };
};

export const assertLegacyTenantLoginAllowed = async ({ tenantId, user, now = new Date() } = {}) => {
  const status = await buildLegacyDgfyLinkStatus({ tenantId, user, now });
  if (status.dgfy_link_status === 'linked' || status.can_legacy_login) {
    return status;
  }

  const error = new Error('Create or link your DGFY account to keep IMS/POS access after June 17, 2027.');
  error.statusCode = 403;
  error.code = status.legacy_login_block_reason || 'DGFY_LINK_REQUIRED';
  error.details = status;
  throw error;
};
