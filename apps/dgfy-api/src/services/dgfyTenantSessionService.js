import {
  DgfyAccountTenantMembership,
  Tenant
} from '../models/index.js';
import tenantConnector from '../utils/TenantConnector.js';
import dbStore from '../utils/dbStore.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import {
  generateRefreshToken,
  generateToken
} from './authService.js';
import { onboardingRepository } from '../modules/onboarding/repositories/onboardingRepository.js';
import { resolveEffectivePermissions } from '../utils/userPermissions.js';
import { updateOwnPosDayClosePinForVerifiedDgfyAccount } from './userService.js';
import { isPermissionEffective } from '@sieitzz/shared-constants/permissionDependencies';

const isEnabledFlag = (value) => (
  value === true
  || value === 1
  || value === '1'
  || (typeof value === 'string' && value.trim().toLowerCase() === 'true')
);

const parseCapabilityBoolean = (value, fallback = true) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
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
    const SystemSetting = dbStore.get('SystemSetting');
    const tenantUserId = Number.parseInt(membership.tenant_user_id, 10);
    let user = Number.isInteger(tenantUserId) && tenantUserId > 0
      ? await User.findByPk(tenantUserId, { include: [{ model: dbStore.get('StaffRole'), as: 'staffRole', required: false }] })
      : null;

    if (!user && String(process.env.DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED || '').trim().toLowerCase() === 'true') {
      user = await User.findOne({ where: { email: String(account.email || '').trim().toLowerCase() }, include: [{ model: dbStore.get('StaffRole'), as: 'staffRole', required: false }] });
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

    const isMasterAdmin = isEnabledFlag(user.is_master_admin);
    const token = generateToken(user, { tenantId: tenant.id });
    const refreshToken = generateRefreshToken(user, { tenantId: tenant.id });
    await user.update({ last_login: new Date() });

    let onboarding = null;
    if (isMasterAdmin) {
      onboarding = await onboardingRepository.getStatus({
        storeNameBaseline: tenant.name || ''
      }).catch(() => null);
    }

    const permissions = resolveEffectivePermissions(user);
    const tenantPosEnabledSetting = SystemSetting?.findOne
      ? await SystemSetting.findOne({
        where: { setting_key: 'tenant_pos_enabled' },
        attributes: ['setting_value']
      })
      : null;
    const tenantPosEnabled = parseCapabilityBoolean(tenantPosEnabledSetting?.setting_value, true);

    return {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      phone_number: user.phone_number || null,
      role: user.role,
      permissions,
      pos_global_pin_configured: Boolean(String(user.pos_cashier_pin_hash || '').trim()),
      // Keep the legacy response field for older POS clients. The canonical
      // global PIN is valid for day close as well.
      pos_day_close_pin_configured: Boolean(String(user.pos_cashier_pin_hash || user.pos_day_close_pin_hash || '').trim()),
      can_configure_pos_global_pin: isPermissionEffective(permissions, 'pos:transact', isMasterAdmin),
      is_master_admin: isMasterAdmin,
      onboarding,
      token,
      refreshToken,
      expiresIn: 24 * 60 * 60,
      company: {
        id: tenant.id,
        name: tenant.name,
        token: tenant.company_token,
        plan: tenant.plan || null,
        pos_enabled: tenantPosEnabled
      },
      tenant_capabilities: {
        pos_enabled: tenantPosEnabled
      }
    };
  });
};

export const configureTenantDayClosePinForDgfyAccount = async ({
  account,
  tenantId = '',
  pin = ''
} = {}) => {
  if (!account?.id) {
    const error = new Error('DGFY account authentication is required.');
    error.statusCode = 401;
    throw error;
  }

  const membership = await findAcceptedMembership({ account, tenantId });
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
    const user = Number.isInteger(tenantUserId) && tenantUserId > 0
      ? await User.findByPk(tenantUserId, { include: [{ model: dbStore.get('StaffRole'), as: 'staffRole', required: false }] })
      : null;

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

    return updateOwnPosDayClosePinForVerifiedDgfyAccount(user.user_id, {
      pin,
      dgfyAccountId: account.id
    });
  });
};

export default createTenantSessionForDgfyAccount;
