import dotenv from 'dotenv';
import fs from 'fs/promises';
import { Op } from 'sequelize';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { Tenant, sequelize: landlordSequelize } = await import('../src/models/index.js');
const { default: tenantConnector } = await import('../src/utils/TenantConnector.js');
const { getTenantModels } = await import('../src/utils/tenantModelFactory.js');
const { DEFAULT_ROLE_PERMISSIONS } = await import('../src/config/permissions.js');

const DEFAULT_TARGET_ROLES = Object.freeze(['admin', 'staff']);
const DEFAULT_TENANT_STATUSES = Object.freeze(['active', 'inactive']);

const hasFlag = (flag) => process.argv.includes(flag);

const getArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const parseCsvArg = (flag, fallback = []) => {
  const raw = getArgValue(flag);
  if (!raw) return [...fallback];

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizePermissionArray = (rawPermissions) => {
  let normalized = rawPermissions;

  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = [];
    }
  }

  if (Array.isArray(normalized)) {
    return Array.from(
      new Set(
        normalized
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean)
      )
    );
  }

  if (normalized && typeof normalized === 'object') {
    const legacyPermissions = [];
    for (const [entity, actions] of Object.entries(normalized)) {
      if (!actions || typeof actions !== 'object') continue;
      for (const [action, allowed] of Object.entries(actions)) {
        if (allowed === true) {
          legacyPermissions.push(`${entity}:${action}`);
        }
      }
    }
    return Array.from(new Set(legacyPermissions));
  }

  return [];
};

const resolveRoleDefaultPermissions = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const defaults = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  return Array.isArray(defaults) ? [...defaults] : [];
};

const buildRepairCandidateRows = (users = []) => {
  const candidates = [];
  let alreadyPopulatedCount = 0;
  let skippedNoDefaultCount = 0;

  for (const user of users) {
    const currentPermissions = normalizePermissionArray(user.permissions);
    if (currentPermissions.length > 0) {
      alreadyPopulatedCount += 1;
      continue;
    }

    const defaultPermissions = resolveRoleDefaultPermissions(user.role);
    if (defaultPermissions.length === 0) {
      skippedNoDefaultCount += 1;
      continue;
    }

    candidates.push({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_master_admin: user.is_master_admin === true,
      default_permissions: defaultPermissions,
      default_permission_count: defaultPermissions.length
    });
  }

  return {
    candidates,
    alreadyPopulatedCount,
    skippedNoDefaultCount
  };
};

const printTenantSummary = (tenantSummary, previewLimit) => {
  console.log(
    `[PermissionRepair] tenant=${tenantSummary.tenant_name} status=${tenantSummary.tenant_status} scanned=${tenantSummary.scanned_users} candidates=${tenantSummary.candidate_users} applied=${tenantSummary.applied_users} already_populated=${tenantSummary.already_populated_users} skipped_no_default=${tenantSummary.skipped_no_default_users} errors=${tenantSummary.errors.length}`
  );

  if (tenantSummary.candidates_preview.length > 0) {
    console.log(`[PermissionRepair] candidate preview (top ${tenantSummary.candidates_preview.length}/${tenantSummary.candidate_users})`);
    tenantSummary.candidates_preview.slice(0, previewLimit).forEach((candidate) => {
      console.log(
        ` - user_id=${candidate.user_id} role=${candidate.role} email=${candidate.email || '-'} default_permission_count=${candidate.default_permission_count}`
      );
    });
  }

  if (tenantSummary.errors.length > 0) {
    tenantSummary.errors.forEach((errorMessage) => {
      console.log(` - error=${errorMessage}`);
    });
  }
};

const writeJsonReport = async (path, payload) => {
  if (!path) return;
  const outputDirectory = dirname(path);
  if (outputDirectory && outputDirectory !== '.') {
    await fs.mkdir(outputDirectory, { recursive: true });
  }
  await fs.writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[PermissionRepair] wrote summary report: ${path}`);
};

const run = async () => {
  const applyMode = hasFlag('--apply');
  const previewLimitRaw = Number.parseInt(getArgValue('--preview-limit') || '20', 10);
  const previewLimit = Number.isFinite(previewLimitRaw) && previewLimitRaw > 0 ? previewLimitRaw : 20;
  const targetRoles = parseCsvArg('--roles', DEFAULT_TARGET_ROLES).map((role) => role.toLowerCase());
  const tenantIdsFilter = new Set(parseCsvArg('--tenant-ids', []));
  const targetStatuses = parseCsvArg('--statuses', DEFAULT_TENANT_STATUSES).map((status) => status.toLowerCase());
  const jsonOutputPath = getArgValue('--json-output');

  const unsupportedRoles = targetRoles.filter((role) => !Array.isArray(DEFAULT_ROLE_PERMISSIONS[role]));
  if (unsupportedRoles.length > 0) {
    throw new Error(`Unsupported role(s): ${unsupportedRoles.join(', ')}. Provide --roles using known role keys.`);
  }

  const tenantWhere = { status: { [Op.in]: targetStatuses } };
  if (tenantIdsFilter.size > 0) {
    tenantWhere.id = { [Op.in]: [...tenantIdsFilter] };
  }

  const tenants = await Tenant.findAll({
    where: tenantWhere,
    attributes: ['id', 'name', 'db_name', 'status'],
    raw: true,
    order: [['created_at', 'ASC']]
  });

  console.log(
    `[PermissionRepair] mode=${applyMode ? 'apply' : 'dry-run'} tenant_count=${tenants.length} roles=${targetRoles.join(',')} statuses=${targetStatuses.join(',')}`
  );

  const tenantSummaries = [];

  for (const tenant of tenants) {
    const tenantSummary = {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_db_name: tenant.db_name,
      tenant_status: tenant.status,
      scanned_users: 0,
      candidate_users: 0,
      applied_users: 0,
      already_populated_users: 0,
      skipped_no_default_users: 0,
      candidates_preview: [],
      errors: []
    };

    try {
      const tenantSequelize = await tenantConnector.getConnection(tenant);
      const { User } = getTenantModels(tenantSequelize);

      if (!User) {
        tenantSummary.errors.push('User model unavailable for tenant connection');
        tenantSummaries.push(tenantSummary);
        printTenantSummary(tenantSummary, previewLimit);
        continue;
      }

      const users = await User.findAll({
        attributes: [
          'user_id',
          'username',
          'email',
          'role',
          'permissions',
          'is_master_admin',
          'invitation_status'
        ],
        where: {
          role: { [Op.in]: targetRoles },
          deleted_at: null,
          [Op.or]: [
            { invitation_status: null },
            { invitation_status: 'accepted' }
          ]
        },
        order: [['user_id', 'ASC']]
      });

      tenantSummary.scanned_users = users.length;
      const {
        candidates,
        alreadyPopulatedCount,
        skippedNoDefaultCount
      } = buildRepairCandidateRows(users);

      tenantSummary.candidate_users = candidates.length;
      tenantSummary.already_populated_users = alreadyPopulatedCount;
      tenantSummary.skipped_no_default_users = skippedNoDefaultCount;
      tenantSummary.candidates_preview = candidates.slice(0, previewLimit).map((candidate) => ({
        user_id: candidate.user_id,
        email: candidate.email,
        role: candidate.role,
        default_permission_count: candidate.default_permission_count
      }));

      if (applyMode && candidates.length > 0) {
        const transaction = await tenantSequelize.transaction();
        try {
          for (const candidate of candidates) {
            const [affectedRows] = await User.update(
              { permissions: candidate.default_permissions },
              {
                where: { user_id: candidate.user_id },
                transaction
              }
            );
            tenantSummary.applied_users += Number(affectedRows || 0);
          }
          await transaction.commit();
        } catch (error) {
          if (!transaction.finished) {
            await transaction.rollback();
          }
          tenantSummary.errors.push(`apply_failed: ${error.message}`);
        }
      }
    } catch (error) {
      tenantSummary.errors.push(error.message);
    }

    tenantSummaries.push(tenantSummary);
    printTenantSummary(tenantSummary, previewLimit);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    mode: applyMode ? 'apply' : 'dry-run',
    target_roles: targetRoles,
    target_statuses: targetStatuses,
    tenant_filters: tenantIdsFilter.size > 0 ? [...tenantIdsFilter] : [],
    tenant_count: tenantSummaries.length,
    tenants_with_candidates: tenantSummaries.filter((tenant) => tenant.candidate_users > 0).length,
    tenants_with_errors: tenantSummaries.filter((tenant) => tenant.errors.length > 0).length,
    total_scanned_users: tenantSummaries.reduce((sum, tenant) => sum + tenant.scanned_users, 0),
    total_candidate_users: tenantSummaries.reduce((sum, tenant) => sum + tenant.candidate_users, 0),
    total_applied_users: tenantSummaries.reduce((sum, tenant) => sum + tenant.applied_users, 0),
    total_already_populated_users: tenantSummaries.reduce((sum, tenant) => sum + tenant.already_populated_users, 0),
    total_skipped_no_default_users: tenantSummaries.reduce((sum, tenant) => sum + tenant.skipped_no_default_users, 0),
    tenants: tenantSummaries
  };

  console.log(
    `[PermissionRepair] summary mode=${summary.mode} tenant_count=${summary.tenant_count} tenants_with_candidates=${summary.tenants_with_candidates} tenants_with_errors=${summary.tenants_with_errors} scanned=${summary.total_scanned_users} candidates=${summary.total_candidate_users} applied=${summary.total_applied_users}`
  );

  await writeJsonReport(jsonOutputPath, summary);

  if (summary.tenants_with_errors > 0) {
    process.exitCode = 1;
  }
};

try {
  await run();
} catch (error) {
  console.error(`[PermissionRepair] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    await tenantConnector.closeAll();
  } catch (error) {
    console.warn(`[PermissionRepair] warning: failed to close tenant pools: ${error.message}`);
  }

  try {
    await landlordSequelize.close();
  } catch (error) {
    console.warn(`[PermissionRepair] warning: failed to close landlord connection: ${error.message}`);
  }
}
