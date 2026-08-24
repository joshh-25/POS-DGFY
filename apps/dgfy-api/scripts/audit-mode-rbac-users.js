import dotenv from 'dotenv';
import fs from 'fs/promises';
import { Op } from 'sequelize';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  getModeRolePreset,
  getRoleCatalogMode
} from '../src/config/modeRolePresets.js';
import { normalizeWorkflowMode } from '../src/modules/shared/constants/workflowModes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let activeTenantConnector = null;
let activeLandlordSequelize = null;

export const DEFAULT_ROLE_PRESET_MAPPING = Object.freeze({
  generic: Object.freeze({ admin: 'generic_admin', manager: 'generic_manager', cashier: 'generic_cashier' }),
  msme: Object.freeze({ admin: 'msme_admin', manager: 'msme_manager', cashier: 'msme_cashier' }),
  food_manufacturing: Object.freeze({
    admin: 'food_manufacturing_admin',
    manager: 'food_manufacturing_manager',
    cashier: 'food_manufacturing_cashier'
  }),
  services: Object.freeze({
    admin: 'services_admin',
    manager: 'services_manager',
    cashier: 'services_front_desk_cashier'
  }),
  fnb: Object.freeze({
    admin: 'fnb_admin',
    manager: 'fnb_restaurant_manager',
    cashier: 'fnb_cashier'
  })
});

const hasFlag = (flag) => process.argv.includes(flag);

const getArgValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] || null;
};

const parseCsvArg = (flag) => String(getArgValue(flag) || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const parseJsonValue = (raw, label) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`);
  }
};

const loadMapping = async () => {
  const mappingFile = getArgValue('--mapping-file');
  const inlineMapping = getArgValue('--mapping');
  if (mappingFile && inlineMapping) {
    throw new Error('Use either --mapping-file or --mapping, not both');
  }
  if (mappingFile) {
    return parseJsonValue(await fs.readFile(mappingFile, 'utf8'), '--mapping-file');
  }
  if (inlineMapping) return parseJsonValue(inlineMapping, '--mapping');
  return DEFAULT_ROLE_PRESET_MAPPING;
};

const normalizeLegacyRole = (role) => String(role || '').trim().toLowerCase();

export const buildLegacyRoleRemapPlan = ({ users = [], workflowMode, mapping = DEFAULT_ROLE_PRESET_MAPPING }) => {
  const mode = getRoleCatalogMode(normalizeWorkflowMode(workflowMode));
  const modeMapping = mapping?.[mode] || {};
  const plan = [];

  for (const user of users) {
    const currentPreset = String(user.role_preset_key || '').trim();
    if (currentPreset) continue;
    if (user.is_master_admin === true) {
      plan.push({ status: 'skipped_master_admin', user_id: user.user_id, role: user.role });
      continue;
    }

    const legacyRole = normalizeLegacyRole(user.role);
    const presetKey = String(modeMapping[legacyRole] || '').trim();
    if (!presetKey) {
      plan.push({
        status: 'needs_manual_mapping',
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: legacyRole || null,
        mode
      });
      continue;
    }

    const preset = getModeRolePreset(presetKey, mode);
    if (!preset) {
      plan.push({
        status: 'invalid_mapping',
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: legacyRole || null,
        mode,
        preset_key: presetKey
      });
      continue;
    }

    plan.push({
      status: 'ready',
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      mode,
      from: {
        role: legacyRole || null,
        role_preset_key: null,
        permissions: user.permissions || []
      },
      to: {
        role: preset.role,
        role_preset_key: preset.key,
        permissions: preset.permissions
      }
    });
  }

  return plan;
};

const readWorkflowMode = async (SystemSetting) => {
  const setting = await SystemSetting.findOne({
    where: { setting_key: 'ops_workflow_mode' },
    attributes: ['setting_value', 'data_type']
  });
  let raw = setting?.setting_value;
  if (setting?.data_type === 'json' && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  return normalizeWorkflowMode(raw);
};

const printSummary = (summary) => {
  console.log(
    `[ModeRbacAudit] tenant=${summary.tenant_name} mode=${summary.workflow_mode} scanned=${summary.scanned_users} ready=${summary.ready_users} manual=${summary.manual_mapping_users} skipped_master_admin=${summary.skipped_master_admin_users} invalid=${summary.invalid_mapping_users} applied=${summary.applied_users} errors=${summary.errors.length}`
  );
  summary.plan.filter((entry) => entry.status !== 'ready').slice(0, 20).forEach((entry) => {
    console.log(` - ${entry.status} user_id=${entry.user_id} role=${entry.role || '-'} email=${entry.email || '-'}`);
  });
};

const writeJsonReport = async (path, payload) => {
  if (!path) return;
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[ModeRbacAudit] wrote summary report: ${path}`);
};

const run = async () => {
  dotenv.config({ path: join(__dirname, '..', '.env') });
  const applyMode = hasFlag('--apply');
  if (applyMode && !hasFlag('--yes')) {
    throw new Error('Refusing to apply without --yes. Run a dry-run first and review the JSON report.');
  }

  const mapping = await loadMapping();
  const tenantIdFilter = new Set(parseCsvArg('--tenant-ids'));
  const statuses = parseCsvArg('--statuses');
  const targetStatuses = statuses.length > 0 ? statuses : ['active'];
  const jsonOutputPath = getArgValue('--json-output');

  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  const landlordModels = await import('../src/models/index.js');
  const { Tenant } = landlordModels;
  activeLandlordSequelize = landlordModels.sequelize;
  const tenantConnectorModule = await import('../src/utils/TenantConnector.js');
  activeTenantConnector = tenantConnectorModule.default;
  const { getTenantModels } = await import('../src/utils/tenantModelFactory.js');

  const tenantWhere = { status: { [Op.in]: targetStatuses } };
  if (tenantIdFilter.size > 0) tenantWhere.id = { [Op.in]: [...tenantIdFilter] };

  const tenants = await Tenant.findAll({
    where: tenantWhere,
    attributes: ['id', 'name', 'db_name', 'status'],
    raw: true,
    order: [['created_at', 'ASC']]
  });

  console.log(`[ModeRbacAudit] mode=${applyMode ? 'apply' : 'dry-run'} tenants=${tenants.length}`);
  const tenantSummaries = [];

  for (const tenant of tenants) {
    const summary = {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_db_name: tenant.db_name,
      tenant_status: tenant.status,
      workflow_mode: null,
      scanned_users: 0,
      ready_users: 0,
      manual_mapping_users: 0,
      skipped_master_admin_users: 0,
      invalid_mapping_users: 0,
      applied_users: 0,
      errors: [],
      plan: []
    };

    try {
      const tenantSequelize = await activeTenantConnector.getConnection(tenant);
      const tenantModels = getTenantModels(tenantSequelize);
      const { User, SystemSetting, AuditLog } = tenantModels;
      if (!User || !SystemSetting) throw new Error('User or SystemSetting model unavailable');

      summary.workflow_mode = await readWorkflowMode(SystemSetting);
      const users = await User.findAll({
        attributes: ['user_id', 'username', 'email', 'role', 'role_preset_key', 'permissions', 'is_master_admin'],
        where: {
          role_preset_key: null,
          deleted_at: null,
          [Op.or]: [{ invitation_status: null }, { invitation_status: 'accepted' }]
        },
        order: [['user_id', 'ASC']]
      });
      summary.scanned_users = users.length;
      summary.plan = buildLegacyRoleRemapPlan({ users, workflowMode: summary.workflow_mode, mapping });
      summary.ready_users = summary.plan.filter((entry) => entry.status === 'ready').length;
      summary.manual_mapping_users = summary.plan.filter((entry) => entry.status === 'needs_manual_mapping').length;
      summary.skipped_master_admin_users = summary.plan.filter((entry) => entry.status === 'skipped_master_admin').length;
      summary.invalid_mapping_users = summary.plan.filter((entry) => entry.status === 'invalid_mapping').length;

      if (applyMode && summary.ready_users > 0) {
        if (!AuditLog?.create) throw new Error('AuditLog model unavailable; refusing un-audited remap');
        const transaction = await tenantSequelize.transaction();
        try {
          for (const entry of summary.plan.filter((candidate) => candidate.status === 'ready')) {
            const [affectedRows] = await User.update(
              {
                role: entry.to.role,
                role_preset_key: entry.to.role_preset_key,
                permissions: entry.to.permissions
              },
              { where: { user_id: entry.user_id, role_preset_key: null }, transaction }
            );
            if (Number(affectedRows) !== 1) continue;
            await AuditLog.create({
              user_id: entry.user_id,
              entity_type: 'user',
              entity_id: entry.user_id,
              action: 'UPDATE',
              event_type: 'mode_rbac_legacy_user_remapped',
              actor_username: 'mode-rbac-remediation',
              reason: 'Phase 145 legacy role preset remapping',
              changes: {
                event: 'mode_rbac_legacy_user_remapped',
                tenant_id: tenant.id,
                workflow_mode: summary.workflow_mode,
                before: entry.from,
                after: entry.to
              }
            }, { transaction });
            summary.applied_users += 1;
          }
          await transaction.commit();
        } catch (error) {
          if (!transaction.finished) await transaction.rollback();
          throw error;
        }
      }
    } catch (error) {
      summary.errors.push(error.message);
    }

    tenantSummaries.push(summary);
    printSummary(summary);
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: applyMode ? 'apply' : 'dry-run',
    target_statuses: targetStatuses,
    tenant_filter: [...tenantIdFilter],
    tenants: tenantSummaries,
    tenant_count: tenantSummaries.length,
    tenants_with_errors: tenantSummaries.filter((entry) => entry.errors.length > 0).length,
    total_scanned_users: tenantSummaries.reduce((sum, entry) => sum + entry.scanned_users, 0),
    total_ready_users: tenantSummaries.reduce((sum, entry) => sum + entry.ready_users, 0),
    total_manual_mapping_users: tenantSummaries.reduce((sum, entry) => sum + entry.manual_mapping_users, 0),
    total_applied_users: tenantSummaries.reduce((sum, entry) => sum + entry.applied_users, 0)
  };
  console.log(`[ModeRbacAudit] summary scanned=${report.total_scanned_users} ready=${report.total_ready_users} manual=${report.total_manual_mapping_users} applied=${report.total_applied_users} errors=${report.tenants_with_errors}`);
  await writeJsonReport(jsonOutputPath, report);
  if (report.tenants_with_errors > 0) process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await run();
  } catch (error) {
    console.error(`[ModeRbacAudit] failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await activeTenantConnector?.closeAll?.();
    await activeLandlordSequelize?.close?.();
  }
}
