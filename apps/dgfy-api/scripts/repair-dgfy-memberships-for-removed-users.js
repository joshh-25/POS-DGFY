import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const { Tenant, DgfyAccountTenantMembership, sequelize: landlordSequelize } = await import('../src/models/index.js');
const { default: tenantConnector } = await import('../src/utils/TenantConnector.js');
const { getTenantModels } = await import('../src/utils/tenantModelFactory.js');

const hasFlag = (flag) => process.argv.includes(flag);

const getArgValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] || null;
};

const tenantIdFilter = getArgValue('--tenant-id');
const applyChanges = hasFlag('--apply');

const tenantWhere = { status: 'active' };
if (tenantIdFilter) tenantWhere.id = tenantIdFilter;

const tenants = await Tenant.findAll({
  where: tenantWhere,
  attributes: ['id', 'name', 'db_name', 'status'],
  order: [['name', 'ASC']]
});

if (tenants.length === 0) {
  throw new Error(tenantIdFilter
    ? `No active tenant found for --tenant-id ${tenantIdFilter}`
    : 'No active tenants found');
}

let scannedTenantCount = 0;
let candidateCount = 0;
let updatedCount = 0;

try {
  for (const tenant of tenants) {
    scannedTenantCount += 1;
    const tenantSequelize = await tenantConnector.getConnection(tenant);
    const { User } = getTenantModels(tenantSequelize);
    const removedUsers = await User.findAll({
      where: { deleted_at: { [Op.ne]: null } },
      attributes: ['user_id', 'username', 'email', 'deleted_at'],
      order: [['user_id', 'ASC']]
    });

    const removedUserIds = removedUsers
      .map((user) => Number(user.user_id))
      .filter((userId) => Number.isInteger(userId) && userId > 0);

    if (removedUserIds.length === 0) continue;

    const membershipWhere = {
      tenant_id: tenant.id,
      tenant_user_id: { [Op.in]: removedUserIds },
      status: { [Op.in]: ['pending', 'accepted'] }
    };
    const memberships = await DgfyAccountTenantMembership.findAll({
      where: membershipWhere,
      attributes: ['id', 'dgfy_account_id', 'tenant_user_id', 'role', 'status']
    });

    if (memberships.length === 0) continue;
    candidateCount += memberships.length;

    const removedUsersById = new Map(removedUsers.map((user) => [Number(user.user_id), user]));
    console.log(`[DGFY membership repair] tenant=${tenant.name} (${tenant.id}) candidates=${memberships.length}`);
    for (const membership of memberships) {
      const user = removedUsersById.get(Number(membership.tenant_user_id));
      console.log(JSON.stringify({
        membership_id: membership.id,
        tenant_user_id: membership.tenant_user_id,
        email: user?.email || null,
        status: membership.status,
        action: applyChanges ? 'mark_removed' : 'would_mark_removed'
      }));
    }

    if (applyChanges) {
      const [updatedForTenant] = await DgfyAccountTenantMembership.update(
        { status: 'removed' },
        { where: membershipWhere }
      );
      updatedCount += updatedForTenant;
    }
  }
} finally {
  await tenantConnector.closeAll().catch(() => null);
  await landlordSequelize.close().catch(() => null);
}

console.log(JSON.stringify({
  mode: applyChanges ? 'apply' : 'dry_run',
  scanned_tenants: scannedTenantCount,
  candidates: candidateCount,
  updated: applyChanges ? updatedCount : 0
}, null, 2));
