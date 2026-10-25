import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEffectivePermissions } from '../../src/utils/userPermissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const apiBaseUrl = String(process.env.E2E_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const companyToken = process.env.E2E_TEST_COMPANY_TOKEN || 'token-original';
const email = `pos.sales.e2e.${Date.now()}@tenant.test`;
const username = email.replace(/[^a-z0-9]/gi, '_');
const password = `PosSales-${Date.now()}-E2e!`;
const phone = `+1555${String(Date.now()).slice(-7)}`;
const terminalId = 'E2E-TERMINAL-01';
let locationId;
let locationName = '';

const requestJson = async (route, body) => {
  const response = await fetch(`${apiBaseUrl}/api/v1${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-token': companyToken,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${route} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
};

const otp = await requestJson('/auth/email-otp/request', {
  purpose: 'tenant_user_registration',
  email,
});
const otpCode = otp?.data?.dev_code;
if (!otpCode) throw new Error('POS sales E2E registration did not receive a development OTP code.');

await requestJson('/auth/register', {
  username,
  email,
  password,
  phone_number: '+15555550100',
  email_otp_code: otpCode,
});

const database = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'testpassword',
  database: process.env.DB_NAME || 'sku_inventory_manager',
});

try {
  const [[user]] = await database.execute('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
  if (!user) throw new Error('Registered POS sales E2E user was not found in the tenant database.');
  const testPermissions = [
    'items:view',
    'items:create',
    'items:edit',
    'pos:view',
    'pos:transact',
    'pos:shift_access',
    'pos:shift_close',
    'pos:attendance:view',
    'pos:attendance:operate',
    'reports:view',
  ];
  // The sales journey verifies the Reports workspace, which is hidden for the
  // cashier role. Keep this ordinary admin user scoped to the exact capabilities
  // exercised here and omit settings:view so POS still requires a real shift.
  await database.execute(
    'UPDATE users SET role = ?, permission_mode = ?, permissions = ?, is_master_admin = 0, is_active = 1, updated_at = NOW() WHERE user_id = ?',
    ['admin', 'custom', JSON.stringify(testPermissions), user.user_id],
  );
  const [[permissionCheckUser]] = await database.execute(
    'SELECT role, permission_mode, permissions, is_master_admin FROM users WHERE user_id = ? LIMIT 1',
    [user.user_id],
  );
  const effectivePermissions = resolveEffectivePermissions(permissionCheckUser);
  const expectedPermissions = [...testPermissions].sort();
  if (String(permissionCheckUser?.role || '').toLowerCase() !== 'admin'
    || String(permissionCheckUser?.permission_mode || '').toLowerCase() !== 'custom'
    || Number(permissionCheckUser?.is_master_admin) !== 0
    || JSON.stringify([...effectivePermissions].sort()) !== JSON.stringify(expectedPermissions)) {
    throw new Error(`POS sales E2E fixture permissions did not resolve to the expected custom set: ${effectivePermissions.join(', ')}`);
  }
  if (effectivePermissions.includes('settings:view') || effectivePermissions.includes('pos:branch_view')) {
    throw new Error('POS sales E2E fixture unexpectedly grants settings:view or pos:branch_view.');
  }

  const [[tenant]] = await database.execute(
    'SELECT id FROM tenants WHERE company_token = ? AND status = \'active\' LIMIT 1',
    [companyToken],
  );
  if (!tenant) throw new Error(`Active POS sales E2E tenant was not found for token ${companyToken}.`);
  await database.execute(
    "UPDATE tenants SET plan = 'premium', subscription_status = 'active' WHERE id = ?",
    [tenant.id],
  );
  const accountId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await database.execute(
    `INSERT INTO dgfy_accounts (
       id, first_name, last_name, username, email, phone, password_hash, is_active,
       email_verified_at, phone_verified_at, provisioning_status, temporary_password_active,
       email_verification_source, created_at, updated_at
     ) VALUES (?, 'POS', 'Sales E2E', ?, ?, ?, ?, 1, NOW(), NOW(), 'self_registered', 0,
       'public_otp', NOW(), NOW())`,
    [accountId, username, email, phone, passwordHash],
  );
  await database.execute(
    `INSERT INTO dgfy_account_tenant_memberships (
       dgfy_account_id, tenant_id, tenant_user_id, role, status, source, accepted_at, created_at, updated_at
     ) VALUES (?, ?, ?, 'cashier', 'accepted', 'invite', NOW(), NOW(), NOW())`,
    [accountId, tenant.id, user.user_id],
  );

  const [[existingLocation]] = await database.execute(
    `SELECT location_id, name FROM tenant_locations
     WHERE is_active = 1
     ORDER BY is_primary_storefront DESC, location_id ASC
     LIMIT 1`,
  );
  locationId = Number(existingLocation?.location_id || 0);
  locationName = String(existingLocation?.name || '').trim();
  if (!locationId) {
    locationName = `POS Sales E2E ${Date.now()}`;
    const [locationResult] = await database.execute(
      `INSERT INTO tenant_locations (
         name, address_line, latitude, longitude, is_open, is_active, is_primary_storefront,
         supports_delivery, supports_pickup, supports_dine_in, allow_dine_in_pay_at_store
       ) VALUES (?, 'POS sales journey E2E location', 14.5995, 120.9842, 1, 1, 1, 1, 1, 0, 0)`,
      [locationName],
    );
    locationId = Number(locationResult.insertId);
  }
  if (!locationId) throw new Error('POS sales E2E location could not be created.');

  await database.execute(
    'INSERT INTO user_location_grants (user_id, location_id, created_by) VALUES (?, ?, NULL)',
    [user.user_id, locationId],
  );

  const terminalRegistry = JSON.stringify([
    { terminal_id: terminalId, label: 'POS Sales E2E Counter', location_id: locationId, is_active: true, is_default: true },
  ]);
  await database.execute(
    `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
     VALUES ('pos_terminal_registry', ?, 'json', 'POS sales E2E test fixture', NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), data_type = VALUES(data_type),
       description = VALUES(description), updated_at = NOW()`,
    [terminalRegistry],
  );
  await database.execute(
    `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
     VALUES ('pos_terminal_registry_mode', 'warn', 'string', 'POS sales E2E test fixture', NOW()),
       ('pos_terminal_location_binding_enforced', 'false', 'boolean', 'POS sales E2E test fixture', NOW()),
       ('tenant_onboarding_state', 'completed', 'string', 'POS sales E2E test fixture', NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), data_type = VALUES(data_type),
       description = VALUES(description), updated_at = NOW()`,
  );
} finally {
  await database.end();
}

process.stdout.write(JSON.stringify({ email, password, companyToken, terminalId, locationId, locationName }));
