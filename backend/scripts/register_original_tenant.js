/**
 * Normalize the "Original Legacy Data" tenant so it behaves like any regular
 * registered tenant account path (tenant registry + mapping + real user row).
 *
 * Modes:
 *   --dry-run : report actions only, do not write
 *   --apply   : apply changes (default unless ORIGINAL_LEGACY_SCRIPT_MODE=dry-run)
 *   --strict  : convert soft warnings into hard failures for critical gaps
 */

import { Sequelize, DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/config/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const requestedMode = (process.env.ORIGINAL_LEGACY_SCRIPT_MODE || 'apply').toLowerCase();
const dryRun = args.has('--dry-run') || requestedMode === 'dry-run';
const applyChanges = args.has('--apply') || !dryRun;
const strictMode = args.has('--strict') || String(process.env.ORIGINAL_LEGACY_STRICT || '').toLowerCase() === 'true';

const LANDLORD_DB = process.env.DB_NAME || 'sku_inventory_manager';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DB_PASS || '';

const LEGACY_DB_NAME = process.env.ORIGINAL_LEGACY_DB_NAME || 'sku_inventory_manager';
const LEGACY_TOKEN = process.env.ORIGINAL_LEGACY_COMPANY_TOKEN || 'token-original';
const LEGACY_TENANT_NAME = process.env.ORIGINAL_LEGACY_TENANT_NAME || 'Original Legacy Data';
const LEGACY_ADMIN_EMAIL = (process.env.ORIGINAL_LEGACY_ADMIN_EMAIL || 'admin@test.com').toLowerCase().trim();
const LEGACY_ADMIN_USERNAME = process.env.ORIGINAL_LEGACY_ADMIN_USERNAME || LEGACY_ADMIN_EMAIL.split('@')[0] || 'admin';
const LEGACY_MODE = (process.env.ORIGINAL_LEGACY_ACCOUNT_MODE || 'auto').toLowerCase(); // auto | required
const ALLOW_TOKEN_ROTATION = String(process.env.ORIGINAL_LEGACY_ALLOW_TOKEN_ROTATION || 'false').toLowerCase() === 'true';

const landlordSequelize = new Sequelize(LANDLORD_DB, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: 'mysql',
  logging: false,
});

const Tenant = landlordSequelize.define('Tenant', {
  id: { type: DataTypes.UUID, primaryKey: true },
  name: { type: DataTypes.STRING },
  db_name: { type: DataTypes.STRING },
  company_token: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  admin_email: { type: DataTypes.STRING },
  admin_password_hash: { type: DataTypes.STRING },
  plan: { type: DataTypes.STRING },
  subscription_status: { type: DataTypes.STRING },
}, {
  tableName: 'tenants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
});

const UserTenantMapping = landlordSequelize.define('UserTenantMapping', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING },
  tenant_id: { type: DataTypes.UUID },
}, {
  tableName: 'user_tenant_mappings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
});

const summary = {
  mode: applyChanges ? 'apply' : 'dry-run',
  strict_mode: strictMode,
  allow_token_rotation: ALLOW_TOKEN_ROTATION,
  target: {
    landlord_db: LANDLORD_DB,
    legacy_db_name: LEGACY_DB_NAME,
    legacy_token: LEGACY_TOKEN,
    legacy_admin_email: LEGACY_ADMIN_EMAIL,
  },
  actions: [],
  warnings: [],
};

const addAction = (message) => {
  summary.actions.push(message);
  console.log(message);
};

const addWarning = (message) => {
  summary.warnings.push(message);
  console.warn(`WARNING: ${message}`);
};

const throwIfStrict = (message) => {
  if (strictMode) {
    throw new Error(message);
  }
  addWarning(message);
};

const safeApplyLabel = (label) => (applyChanges ? label : `[dry-run] ${label}`);

const ensureLegacyDatabaseExists = async () => {
  const [rows] = await landlordSequelize.query('SHOW DATABASES LIKE ?', {
    replacements: [LEGACY_DB_NAME],
  });
  return Array.isArray(rows) && rows.length > 0;
};

const resolveTenantRecords = async () => {
  const byDb = await Tenant.findOne({ where: { db_name: LEGACY_DB_NAME } });
  const byToken = await Tenant.findOne({ where: { company_token: LEGACY_TOKEN } });

  if (byDb && byToken && byDb.id !== byToken.id) {
    throw new Error(
      `Conflict: db "${LEGACY_DB_NAME}" and token "${LEGACY_TOKEN}" point to different tenants (${byDb.id} vs ${byToken.id})`
    );
  }

  if (byToken && byToken.db_name && byToken.db_name !== LEGACY_DB_NAME && !byDb) {
    throw new Error(
      `Conflict: token "${LEGACY_TOKEN}" already belongs to db "${byToken.db_name}", expected "${LEGACY_DB_NAME}"`
    );
  }

  return { byDb, byToken, tenant: byDb || byToken || null };
};

const toJsonPermissions = (value) => {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const fromObject = [];
        for (const [resource, actions] of Object.entries(parsed)) {
          if (!actions || typeof actions !== 'object') continue;
          for (const [action, allowed] of Object.entries(actions)) {
            if (allowed === true) fromObject.push(`${resource}:${action}`);
          }
        }
        return fromObject;
      }
    } catch {
      return [];
    }
  }

  if (value && typeof value === 'object') {
    const flattened = [];
    for (const [resource, actions] of Object.entries(value)) {
      if (!actions || typeof actions !== 'object') continue;
      for (const [action, allowed] of Object.entries(actions)) {
        if (allowed === true) flattened.push(`${resource}:${action}`);
      }
    }
    return flattened;
  }

  return [];
};

const normalizeUniquePermissions = (value) => {
  const raw = toJsonPermissions(value);
  const unique = [...new Set(raw.filter((p) => typeof p === 'string' && p.includes(':')))];
  return unique;
};

const filterSupportedAttributes = (Model, payload) => {
  const supported = new Set(Object.keys(Model.rawAttributes || {}));
  const filtered = {};
  for (const [key, value] of Object.entries(payload)) {
    if (supported.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
};

const ensureTenantAndMapping = async (transaction) => {
  const { tenant: existingTenant } = await resolveTenantRecords();

  let tenant = existingTenant;
  if (!tenant) {
    const createPayload = {
      id: uuidv4(),
      name: LEGACY_TENANT_NAME,
      db_name: LEGACY_DB_NAME,
      company_token: LEGACY_TOKEN,
      status: 'active',
      admin_email: LEGACY_ADMIN_EMAIL,
      plan: 'standard',
      subscription_status: 'active',
    };

    addAction(safeApplyLabel(`Create tenant for db=${LEGACY_DB_NAME} token=${LEGACY_TOKEN}`));
    if (applyChanges) {
      tenant = await Tenant.create(createPayload, { transaction });
    } else {
      tenant = createPayload;
    }
  } else {
    const updatePayload = {};

    if (!tenant.status || tenant.status !== 'active') updatePayload.status = 'active';
    if (!tenant.admin_email) updatePayload.admin_email = LEGACY_ADMIN_EMAIL;
    if (!tenant.plan) updatePayload.plan = 'standard';
    if (!tenant.subscription_status) updatePayload.subscription_status = 'active';

    if (tenant.company_token !== LEGACY_TOKEN) {
      if (ALLOW_TOKEN_ROTATION) {
        updatePayload.company_token = LEGACY_TOKEN;
        addAction(safeApplyLabel(`Rotate legacy tenant token from ${tenant.company_token} -> ${LEGACY_TOKEN}`));
      } else {
        addWarning(
          `Tenant token differs (${tenant.company_token}). Keeping existing token because ORIGINAL_LEGACY_ALLOW_TOKEN_ROTATION=false.`
        );
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      addAction(safeApplyLabel(`Update legacy tenant metadata (${tenant.id})`));
      if (applyChanges) {
        await tenant.update(updatePayload, { transaction });
      } else {
        tenant = { ...tenant, ...updatePayload };
      }
    } else {
      addAction('Legacy tenant metadata already normalized.');
    }
  }

  if (applyChanges) {
    const [, created] = await UserTenantMapping.findOrCreate({
      where: { email: LEGACY_ADMIN_EMAIL, tenant_id: tenant.id },
      defaults: { email: LEGACY_ADMIN_EMAIL, tenant_id: tenant.id },
      transaction,
    });

    if (created) {
      addAction(`Created user_tenant_mapping for ${LEGACY_ADMIN_EMAIL} -> ${tenant.id}`);
    } else {
      addAction(`user_tenant_mapping already exists for ${LEGACY_ADMIN_EMAIL} -> ${tenant.id}`);
    }
  } else {
    const existingMapping = await UserTenantMapping.findOne({
      where: { email: LEGACY_ADMIN_EMAIL, tenant_id: tenant.id },
      transaction,
    });

    if (existingMapping) {
      addAction(`[dry-run] user_tenant_mapping already exists for ${LEGACY_ADMIN_EMAIL} -> ${tenant.id}`);
    } else {
      addAction(`[dry-run] Would create user_tenant_mapping for ${LEGACY_ADMIN_EMAIL} -> ${tenant.id}`);
    }
  }

  return tenant;
};

const buildUniqueUsername = async (User) => {
  const normalizedBase = LEGACY_ADMIN_USERNAME.replace(/[^a-zA-Z0-9_.-]/g, '') || 'admin';
  let candidate = normalizedBase;
  let suffix = 1;

  while (await User.findOne({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${normalizedBase}_${suffix}`;
  }

  return candidate;
};

const ensureLegacyAdminUser = async (tenantRecord) => {
  const tenantSequelize = new Sequelize(LEGACY_DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    dialect: 'mysql',
    logging: false,
  });

  try {
    const { User } = getTenantModels(tenantSequelize);
    await tenantSequelize.authenticate();

    const existing = await User.findOne({ where: { email: LEGACY_ADMIN_EMAIL } });
    if (existing) {
      const normalizedPermissions = normalizeUniquePermissions(existing.permissions);
      const effectivePermissions = normalizedPermissions.length > 0
        ? normalizedPermissions
        : DEFAULT_ROLE_PERMISSIONS.admin;

      const updatePayloadRaw = {
        is_active: true,
        deleted_at: null,
        deleted_by: null,
        role: 'admin',
        is_master_admin: true,
        permissions: effectivePermissions,
      };

      if (existing.password_hash === 'PENDING_INVITATION') {
        const rawPassword = process.env.ORIGINAL_LEGACY_ADMIN_PASSWORD;
        if (rawPassword) {
          updatePayloadRaw.password_hash = await bcrypt.hash(rawPassword, 10);
          updatePayloadRaw.invitation_status = 'accepted';
        } else {
          throwIfStrict(
            `Legacy admin user "${LEGACY_ADMIN_EMAIL}" is pending invitation and ORIGINAL_LEGACY_ADMIN_PASSWORD is not set.`
          );
        }
      }

      const updatePayload = filterSupportedAttributes(User, updatePayloadRaw);
      addAction(safeApplyLabel(`Normalize existing legacy admin user ${LEGACY_ADMIN_EMAIL}`));
      if (applyChanges) {
        await existing.update(updatePayload);
      }
      return;
    }

    const explicitPassword = process.env.ORIGINAL_LEGACY_ADMIN_PASSWORD || null;
    const inheritedHash = tenantRecord.admin_password_hash || null;
    let passwordHash = inheritedHash;

    if (!passwordHash && explicitPassword) {
      passwordHash = await bcrypt.hash(explicitPassword, 10);
    }

    if (!passwordHash) {
      throwIfStrict(
        `No legacy admin user exists for "${LEGACY_ADMIN_EMAIL}" and no password source is available. Set ORIGINAL_LEGACY_ADMIN_PASSWORD.`
      );
      return;
    }

    const username = await buildUniqueUsername(User);
    const createPayloadRaw = {
      username,
      email: LEGACY_ADMIN_EMAIL,
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
      is_master_admin: true,
      permissions: DEFAULT_ROLE_PERMISSIONS.admin,
      invitation_status: 'accepted',
    };

    const createPayload = filterSupportedAttributes(User, createPayloadRaw);
    addAction(safeApplyLabel(`Create legacy admin user ${LEGACY_ADMIN_EMAIL}`));
    if (applyChanges) {
      await User.create(createPayload);
    }
  } finally {
    await tenantSequelize.close();
  }
};

async function registerOriginalTenant() {
  try {
    await landlordSequelize.authenticate();
    addAction(`Connected to landlord DB: ${LANDLORD_DB}`);

    const legacyDbExists = await ensureLegacyDatabaseExists();
    if (!legacyDbExists) {
      if (LEGACY_MODE === 'required') {
        throw new Error(`Legacy database "${LEGACY_DB_NAME}" not found (mode=required).`);
      }
      addWarning(`Legacy database "${LEGACY_DB_NAME}" not found (mode=auto). Skipping normalization.`);
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
      return;
    }

    let transaction = null;
    if (applyChanges) {
      transaction = await landlordSequelize.transaction();
    }

    try {
      const tenantRecord = await ensureTenantAndMapping(transaction);
      await ensureLegacyAdminUser(tenantRecord);
      if (transaction) await transaction.commit();
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }

    addAction('Legacy tenant account normalization completed.');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(`Legacy normalization failed: ${error.message}`);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }
}

registerOriginalTenant();
