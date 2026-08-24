#!/usr/bin/env node

const { validateProductionEnv } = require('../apps/dgfy-api/src/config/productionEnvValidation.cjs');

const strongSecret = (label) => `${label}_${'a'.repeat(48)}`;

// Fixture-only bcrypt-shaped placeholder ($2b$12$ + 53 [./A-Za-z0-9] chars, matching
// productionEnvValidation.cjs's BCRYPT_HASH_PATTERN) -- not a real hash of anything, and
// deliberately distinct from DEFAULT_ADMIN_PASSWORD_HASH so the "must not use the documented
// default" check doesn't trip.
const FIXTURE_ADMIN_PASSWORD_HASH = '$2b$12$fixtureOnlyHashfixtureOnlyHashfixtureOnlyHashfixtureO';

const baseEnv = {
  NODE_ENV: 'production',
  HOSTING_INSTANCE_COUNT: '1',
  DB_HOST: 'localhost',
  DB_USER: 'sku_user',
  DB_NAME: 'sku_inventory',
  DB_PASSWORD: 'database-password-production-like',
  DB_AUTO_SYNC: 'false',
  JWT_SECRET: strongSecret('jwt'),
  REFRESH_TOKEN_SECRET: strongSecret('refresh'),
  CORS_ORIGIN: 'https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph',
  SESSION_COOKIE_SECURE: 'true',
  RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS: '3600000',
  RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS: '5',
  PAYMENTS_ENABLED: 'false',
  TENANT_REGISTRATION_APPROVAL_MODE: 'auto_standard',
  // #913-adjacent gap found 2026-08-25: validateProductionAdminCredentials (cba06a57, "fail closed
  // production auth controls") added these two as required, but this fixture file was never
  // updated to match -- every fixture below has been failing check:production-env since, pre-dating
  // this promotion. Confirmed the real PROD .env already sets both (2 vars present), so there was
  // no actual production risk; this closes the stale-fixture gap the gate surfaced.
  ADMIN_USERNAME: 'fixture-admin',
  ADMIN_PASSWORD_HASH: FIXTURE_ADMIN_PASSWORD_HASH
};

const fixtures = [
  {
    name: 'shared',
    profile: 'shared',
    env: {
      ...baseEnv,
      HOSTING_PROFILE: 'shared',
      AUTH_BLACKLIST_FAILURE_MODE: 'fail_open',
      TEMP_FILE_STORAGE: 'local',
      REDIS_URL: ''
    }
  },
  {
    name: 'vps',
    profile: 'vps',
    env: {
      ...baseEnv,
      HOSTING_PROFILE: 'vps',
      AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
      TEMP_FILE_STORAGE: 'auto',
      REDIS_URL: 'redis://127.0.0.1:6379'
    }
  },
  {
    name: 'payments-paymongo',
    profile: 'vps',
    env: {
      ...baseEnv,
      HOSTING_PROFILE: 'vps',
      AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
      TEMP_FILE_STORAGE: 'auto',
      REDIS_URL: 'redis://127.0.0.1:6379',
      PAYMENTS_ENABLED: 'true',
      PAYMONGO_MODE: 'test',
      PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
      PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
      PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture',
      PAYMONGO_STANDARD_PLAN_ID: 'source_standard_fixture',
      PAYMONGO_PREMIUM_PLAN_ID: 'source_premium_fixture'
    }
  },
  {
    name: 'commerce-payments-paymongo',
    profile: 'vps',
    env: {
      ...baseEnv,
      HOSTING_PROFILE: 'vps',
      AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
      TEMP_FILE_STORAGE: 'auto',
      REDIS_URL: 'redis://127.0.0.1:6379',
      COMMERCE_PAYMENTS_ENABLED: 'true',
      COMMERCE_QRPH_ENABLED: 'true',
      PAYMONGO_MODE: 'test',
      PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
      PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
      PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture',
      PAYMONGO_DGFY_MERCHANT_ID: 'org_dgfy_fixture'
    }
  }
];

let failed = false;

for (const fixture of fixtures) {
  const result = validateProductionEnv({
    env: fixture.env,
    profile: fixture.profile,
    strictProduction: true
  });

  if (!result.ok) {
    failed = true;
    console.error(`[production-env-fixtures] FAIL ${fixture.name}`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
  } else {
    console.log(`[production-env-fixtures] OK ${fixture.name}`);
  }

  for (const warning of result.warnings) {
    console.warn(`[production-env-fixtures] WARN ${fixture.name}: ${warning}`);
  }
}

if (failed) {
  process.exit(1);
}
