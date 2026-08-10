import { Tenant } from '../models/index.js';
import dbStore from '../utils/dbStore.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import { DomainError, DomainErrorCode } from '../modules/shared/contracts/domainErrors.js';
import { PERMISSIONS } from '../config/permissions.js';
import { hasEffectivePermission } from '../utils/userPermissions.js';

const TERMINAL_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

const sanitizeTerminalId = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return TERMINAL_ID_PATTERN.test(normalized) ? normalized : '';
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseBooleanSetting = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const parseJsonSetting = (setting) => {
  const raw = setting?.setting_value ?? setting?.value;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const validateDgfyPosTerminalPolicy = async ({
  tenantId,
  terminalId,
  tenantUserId = null,
  userRole = '',
  permissions = [],
  isMasterAdmin = false
} = {}) => {
  const resolvedTenantId = String(tenantId || '').trim();
  const normalizedTerminalId = sanitizeTerminalId(terminalId);
  if (!resolvedTenantId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Company id is required for POS terminal validation.', { statusCode: 400 });
  }
  if (!normalizedTerminalId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid terminal or counter id is required for POS unlock.', { statusCode: 422 });
  }

  const tenant = await Tenant.findByPk(resolvedTenantId);
  if (!tenant || tenant.status !== 'active' || !tenant.company_token) {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Company is not available for POS unlock.', { statusCode: 403 });
  }

  const sequelize = await tenantConnector.getConnection(tenant);
  const tenantModels = getTenantModels(sequelize);
  return dbStore.run({
    sequelize,
    tenantId: tenant.id,
    tenantToken: tenant.company_token,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    ...tenantModels
  }, async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    const settings = await SystemSetting.findAll({
      where: {
        setting_key: [
          'pos_terminal_registry',
          'pos_terminal_registry_mode',
          'pos_terminal_location_binding_enforced'
        ]
      },
      attributes: ['setting_key', 'setting_value', 'data_type']
    });
    const lookup = new Map(settings.map((setting) => [setting.setting_key, setting]));
    const registry = parseJsonSetting(lookup.get('pos_terminal_registry'))
      .map((entry) => ({
        terminal_id: sanitizeTerminalId(entry?.terminal_id),
        label: String(entry?.label || '').trim(),
        location_id: parsePositiveInt(entry?.location_id),
        is_active: entry?.is_active !== false
      }))
      .filter((entry) => entry.terminal_id && entry.is_active);
    const mode = String(lookup.get('pos_terminal_registry_mode')?.setting_value || 'warn').trim().toLowerCase() === 'enforce'
      ? 'enforce'
      : 'warn';
    const bindingEnforced = parseBooleanSetting(lookup.get('pos_terminal_location_binding_enforced')?.setting_value);
    const registryEntry = registry.find((entry) => entry.terminal_id === normalizedTerminalId) || null;
    const resolvedTenantUserId = parsePositiveInt(tenantUserId);
    const canSwitchLocation = hasEffectivePermission({
      role: userRole,
      permissions,
      is_master_admin: isMasterAdmin
    }, PERMISSIONS.POS.actions.SWITCH_LOCATION_POS);
    const requiresLocationGrant = resolvedTenantUserId && !canSwitchLocation;

    const context = {
      terminal_id: normalizedTerminalId,
      mode,
      registry_size: registry.length,
      binding_enforced: bindingEnforced,
      registry_entry: registryEntry,
      warning: null
    };

    if (mode === 'enforce' && registry.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Terminal registry enforcement is active, but no active terminal entries are configured.',
        { statusCode: 422, details: { terminal_identity_policy: { ...context, reason_code: 'REGISTRY_REQUIRED' } } }
      );
    }
    if (mode === 'enforce' && !registryEntry) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `terminal_id "${normalizedTerminalId}" is not an active registry terminal.`,
        { statusCode: 422, details: { terminal_identity_policy: { ...context, reason_code: 'TERMINAL_NOT_REGISTERED' } } }
      );
    }
    if (bindingEnforced && (!registryEntry || !registryEntry.location_id)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Terminal location binding is enforced, but the selected terminal has no home location.',
        { statusCode: 422, details: { terminal_identity_policy: { ...context, reason_code: 'TERMINAL_LOCATION_REQUIRED' } } }
      );
    }
    if (mode === 'warn' && registry.length > 0 && !registryEntry) {
      if (requiresLocationGrant) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'Cashier POS unlock requires an active registered terminal assigned to an authorized store location.',
          { statusCode: 403, details: { terminal_identity_policy: { ...context, reason_code: 'CASHIER_TERMINAL_REGISTRY_REQUIRED' } } }
        );
      }
      return {
        ...context,
        reason_code: 'WARN_UNREGISTERED_ID',
        warning: {
          reason_code: 'WARN_UNREGISTERED_ID',
          message: `terminal_id "${normalizedTerminalId}" is not an active registry terminal; POS unlock continues in warn mode.`
        }
      };
    }
    if (requiresLocationGrant) {
      if (!registryEntry?.location_id) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'Cashier POS unlock requires a registered terminal with an assigned store location.',
          { statusCode: 403, details: { terminal_identity_policy: { ...context, reason_code: 'CASHIER_TERMINAL_LOCATION_REQUIRED' } } }
        );
      }
      const UserLocationGrant = dbStore.get('UserLocationGrant');
      if (!UserLocationGrant) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'Cashier location grants are unavailable for POS unlock.',
          { statusCode: 403, details: { terminal_identity_policy: { ...context, reason_code: 'CASHIER_LOCATION_GRANTS_UNAVAILABLE' } } }
        );
      }
      const grantCount = await UserLocationGrant.count({
        where: {
          user_id: resolvedTenantUserId,
          location_id: registryEntry.location_id
        }
      });
      if (grantCount <= 0) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'This cashier is not authorized for the selected terminal location.',
          { statusCode: 403, details: { terminal_identity_policy: { ...context, reason_code: 'CASHIER_LOCATION_NOT_GRANTED' } } }
        );
      }
    }

    return {
      ...context,
      reason_code: 'ALLOWED'
    };
  });
};

export default validateDgfyPosTerminalPolicy;
