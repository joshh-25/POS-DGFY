#!/usr/bin/env node
/**
 * Provision a fixture tenant + settings:edit bot user for the compliance preflight sweep (#1248,
 * supersedes #1163's manual remote-bot-account approach).
 *
 * Replaces the manual "register a bot on stage.dgfy.ph, trim its permissions by hand" procedure
 * with a scripted, in-repo tenant provisioned fresh on an ephemeral CI-provisioned dgfy-api
 * instance. Confirmed live end to end (#1163/#1248 spike, 2026-08-31): mysql+redis on an isolated
 * docker network -> dgfy-migration-runner migrate -> this seeder -> boot dgfy-api -> login ->
 * a real POST /api/v1/compliance/preflight call against a real declaration -> result: no_breach,
 * can_proceed: true.
 *
 * Uses provisionTenant() (src/services/tenantProvisioningService.js) rather than the lighter
 * tests/helpers/testTenantHelper.js -- provisionTenant() runs applyPostSyncTenantSchema() (the
 * Phase 157 tenant-bootstrap layer) after sync(), which the test helper deliberately skips. That
 * matters here: this fixture is evaluated by the real policy engine, not exercised by a test that
 * already knows its own schema assumptions.
 *
 * The pinned posture (complianceMode: 'non_compliant', plan: 'premium', subscription_status:
 * 'active', status: 'active') is deliberately the one confirmed live to evaluate ALLOW for
 * pos.checkout / pos.receipt_render / pos.terminal_operation / compliance.request_preflight --
 * see evaluateComplianceDecision (compliancePolicyEngine.js) if this ever needs re-deriving. This
 * is strictly more reproducible than the manual remote-bot approach it replaces: a tenant living
 * on stage.dgfy.ph is unpinned and drifts with whoever last edited its settings; this one is
 * recreated identically every sweep run and torn down after.
 *
 * Required env (same DB_ variables and REDIS_URL the API itself boots with -- see
 * .github/workflows/compliance-preflight-sweep.yml):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *
 * Usage:
 *   node scripts/seed-preflight-fixture.js
 * Prints PREFLIGHT_HOST=/PREFLIGHT_COMPANY_TOKEN=/PREFLIGHT_BOT_EMAIL=/PREFLIGHT_BOT_PASSWORD=
 * lines to stdout, one per line, for the workflow to eval into its own env -- deliberately the
 * same four names scripts/mint-preflight-token.js already reads, so that script needs no changes.
 * Also prints FIXTURE_TENANT_ID= so scripts/teardown-preflight-fixture.js can clean up by id
 * without re-deriving it.
 */

import { provisionTenant } from '../src/services/tenantProvisioningService.js';
import sequelize from '../src/config/database.js';
import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BOT_PASSWORD_ROUNDS = 10;
const FIXTURE_PHONE = '+63 912 345 6789'; // satisfies the phone-completion gate, auth.js:269-284

function randomToken(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

async function main() {
  const runLabel = process.env.GITHUB_RUN_ID || Date.now().toString();
  const tenantName = `PreflightFixture-${runLabel}`;
  const adminEmail = `preflight-founder-${runLabel}@ci.local`;

  process.stderr.write(`[seed-preflight-fixture] Provisioning tenant "${tenantName}"...\n`);

  const provisioned = await provisionTenant({
    name: tenantName,
    adminEmail,
    adminPhone: FIXTURE_PHONE,
    adminUsername: 'PreflightFounder',
    adminPassword: randomToken('founder-pw'),
    complianceMode: 'non_compliant',
    workflowMode: 'food_manufacturing'
  });

  const tenantId = provisioned.id;
  const companyToken = provisioned.company_token;

  const [[row]] = await sequelize.query('SELECT db_name FROM tenants WHERE id = ?', {
    replacements: [tenantId]
  });
  const dbName = row?.db_name;
  if (!dbName) {
    throw new Error(`[seed-preflight-fixture] Could not resolve db_name for tenant ${tenantId}`);
  }

  // Belt-and-braces: provisionTenant() already sets plan/subscription defaults, but pin them
  // explicitly so this fixture's posture never silently drifts if that default ever changes.
  await sequelize.query(
    `UPDATE tenants SET status = 'active', subscription_status = 'active', plan = 'premium',
     compliance_mode_choice_required = 0 WHERE id = ?`,
    { replacements: [tenantId] }
  );

  const tenantSequelize = new Sequelize(dbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false
  });

  const botEmail = `preflightbot-${runLabel}@ci.local`;
  const botPassword = randomToken('bot-pw');

  try {
    const models = getTenantModels(tenantSequelize);
    const passwordHash = await bcrypt.hash(botPassword, BOT_PASSWORD_ROUNDS);

    // settings:edit is the exact, and only, permission the preflight route checks
    // (PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS, src/routes/compliance.js:57). is_master_admin
    // stays false deliberately -- this exercises the real permission-array path, not the
    // unconditional master-admin bypass in checkPermission (auth.js:361-363).
    await models.User.create({
      username: 'preflightbot',
      email: botEmail,
      phone_number: FIXTURE_PHONE,
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
      is_master_admin: false,
      permissions: JSON.stringify(['settings:edit', 'settings:view'])
    });
  } finally {
    await tenantSequelize.close();
  }

  process.stderr.write(`[seed-preflight-fixture] Fixture ready: tenant ${tenantId} (${dbName})\n`);

  const host = `http://127.0.0.1:${process.env.PREFLIGHT_API_PORT || 5000}`;
  process.stdout.write(`PREFLIGHT_HOST=${host}\n`);
  process.stdout.write(`PREFLIGHT_COMPANY_TOKEN=${companyToken}\n`);
  process.stdout.write(`PREFLIGHT_BOT_EMAIL=${botEmail}\n`);
  process.stdout.write(`PREFLIGHT_BOT_PASSWORD=${botPassword}\n`);
  process.stdout.write(`FIXTURE_TENANT_ID=${tenantId}\n`);

  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`[seed-preflight-fixture] FAILED: ${error.stack || error.message}\n`);
  process.exit(1);
});
