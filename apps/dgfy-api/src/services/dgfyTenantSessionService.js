import {
  DgfyAccountTenantMembership,
  Tenant
} from '../models/index.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import tenantConnector from '../utils/TenantConnector.js';
import dbStore from '../utils/dbStore.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import {
  generateRefreshToken,
  generateToken
} from './authService.js';
import { onboardingRepository } from '../modules/onboarding/repositories/onboardingRepository.js';

const normalizePermissionArray = (rawPermissions) => {
  let normalized = rawPermissions;
  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = [];
    }
  }
  if (!Array.isArray(normalized)) return [];
  return Array.from(new Set(normalized.map((entry) => String(entry || '').trim()).filter(Boolean)));
};

const resolveEffectivePermissionsForUser = (user) => {
  const explicit = normalizePermissionArray(user?.permissions);
  if (explicit.length > 0) return explicit;
  const role = String(user?.role || 'staff').trim().toLowerCase();
  return Array.isArray(DEFAULT_ROLE_PERMISSIONS[role]) ? [...DEFAULT_ROLE_PERMISSIONS[role]] : [];
};

const findAcceptedMembership = async ({ account, tenantId, companyToken }) => {
  const where = {
    dgfy_account_id: account.id,
    status: 'accepted'
  };
  if (tenantId) where.tenant_id = tenantId;

  const memberships = await DgfyAccountTenantMembership.findAll({
    where,
    include: [{
      model: Tenant,
      as: 'tenant',
      attributes: ['id', 'name', 'db_name', 'company_token', 'status', 'plan']
    }],
    order: [['updated_at', 'DESC']]
  });

  const normalizedCompanyToken = String(companyToken || '').trim();
  return memberships.find((membership) => {
    const tenant = membership?.tenant;
    if (!tenant || tenant.status !== 'active') return false;
    if (!normalizedCompanyToken) return true;
    return String(tenant.company_token || '').trim() === normalizedCompanyToken;
  }) || null;
};

export const createTenantSessionForDgfyAccount = async ({
  account,
  tenantId = '',
  companyToken = ''
} = {}) => {
  if (!account?.id) {
    const error = new Error('DGFY account authentication is required.');
    error.statusCode = 401;
    throw error;
  }

  const membership = await findAcceptedMembership({ account, tenantId, companyToken });
  const tenant = membership?.tenant;
  if (!membership || !tenant?.company_token || tenant.status !== 'active') {
    const error = new Error('No active company membership is available for this DGFY account.');
    error.statusCode = 403;
    throw error;
  }

  const sequelize = await tenantConnector.getConnection(tenant);
  const tenantModels = getTenantModels(sequelize);
  const context = {
    sequelize,
    tenantId: tenant.id,
    tenantToken: tenant.company_token,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    ...tenantModels
  };

  return dbStore.run(context, async () => {
    const User = dbStore.get('User');
    const tenantUserId = Number.parseInt(membership.tenant_user_id, 10);
    let user = Number.isInteger(tenantUserId) && tenantUserId > 0
      ? await User.findByPk(tenantUserId)
      : null;

    if (!user && String(process.env.DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED || '').trim().toLowerCase() === 'true') {
      user = await User.findOne({ where: { email: String(account.email || '').trim().toLowerCase() } });
      if (user) {
        await membership.update({ tenant_user_id: user.user_id }).catch(() => null);
      }
    }

    if (!user || String(user.email || '').trim().toLowerCase() !== String(account.email || '').trim().toLowerCase()) {
      const error = new Error('The DGFY account is not linked to a tenant user for this company.');
      error.statusCode = 403;
      throw error;
    }

    if (!user.is_active || user.deleted_at) {
      const error = new Error('The linked tenant user is inactive.');
      error.statusCode = 403;
      throw error;
    }

    const token = generateToken(user, { tenantId: tenant.id });
    const refreshToken = generateRefreshToken(user, { tenantId: tenant.id });
    await user.update({ last_login: new Date() });

    let onboarding = null;
    if (user.is_master_admin === true) {
      onboarding = await onboardingRepository.getStatus({
        storeNameBaseline: tenant.name || ''
      }).catch(() => null);
    }

    return {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      phone_number: user.phone_number || null,
      role: user.role,
      permissions: resolveEffectivePermissionsForUser(user),
      is_master_admin: user.is_master_admin || false,
      onboarding,
      token,
      refreshToken,
      expiresIn: 24 * 60 * 60,
      company: {
        id: tenant.id,
        name: tenant.name,
        token: tenant.company_token,
        plan: tenant.plan || null
      }
    };
  });
};

export default createTenantSessionForDgfyAccount;
