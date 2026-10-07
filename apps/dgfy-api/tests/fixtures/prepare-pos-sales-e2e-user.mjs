import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const testPermissions = JSON.stringify([
    'items:view',
    'items:create',
    'items:edit',
    'pos:view',
    'pos:transact',
    'reports:view',
    'settings:view',
  ]);
  await database.execute(
    'UPDATE users SET role = ?, permissions = ?, is_master_admin = 0, is_active = 1, updated_at = NOW() WHERE user_id = ?',
    ['manager', testPermissions, user.user_id],
  );

  const [[tenant]] = await database.execute(
    'SELECT id FROM tenants WHERE company_token = ? AND status = \'active\' LIMIT 1',
    [companyToken],
  );
  if (!tenant) throw new Error(`Active POS sales E2E tenant was not found for token ${companyToken}.`);
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
     ) VALUES (?, ?, ?, 'admin', 'accepted', 'founder', NOW(), NOW(), NOW())`,
    [accountId, tenant.id, user.user_id],
  );

  const [[existingLocation]] = await database.execute(
    `SELECT location_id FROM tenant_locations
     WHERE is_active = 1
     ORDER BY is_primary_storefront DESC, location_id ASC
     LIMIT 1`,
  );
  locationId = Number(existingLocation?.location_id || 0);
  if (!locationId) {
    const [locationResult] = await database.execute(
      `INSERT INTO tenant_locations (
         name, address_line, latitude, longitude, is_open, is_active, is_primary_storefront,
         supports_delivery, supports_pickup, supports_dine_in, allow_dine_in_pay_at_store
       ) VALUES (?, 'POS sales journey E2E location', 14.5995, 120.9842, 1, 1, 1, 1, 1, 0, 0)`,
      [`POS Sales E2E ${Date.now()}`],
    );
    locationId = Number(locationResult.insertId);
  }
  if (!locationId) throw new Error('POS sales E2E location could not be created.');

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

process.stdout.write(JSON.stringify({ email, password, companyToken, terminalId, locationId }));
