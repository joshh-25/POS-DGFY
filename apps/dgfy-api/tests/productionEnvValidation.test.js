import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  formatValidationFailure,
  validateProductionEnv
} = require('../src/config/productionEnvValidation.cjs');

const strongSecret = (label) => `${label}_${'a'.repeat(48)}`;

const baseEnv = {
  NODE_ENV: 'production',
  HOSTING_PROFILE: 'vps',
  HOSTING_INSTANCE_COUNT: '1',
  DB_HOST: 'localhost',
  DB_USER: 'sku_user',
  DB_NAME: 'sku_inventory',
  DB_PASSWORD: 'database-password-production-like',
  DB_AUTO_SYNC: 'false',
  JWT_SECRET: strongSecret('jwt'),
  REFRESH_TOKEN_SECRET: strongSecret('refresh'),
  CORS_ORIGIN: 'https://skupervisor.dgfy.ph,https://pos.dgfy.ph',
  SESSION_COOKIE_SECURE: 'true',
  AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
  TEMP_FILE_STORAGE: 'auto',
  REDIS_URL: 'redis://127.0.0.1:6379',
  RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS: '3600000',
  RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS: '5',
  PAYMENTS_ENABLED: 'false'
};

describe('production environment validation', () => {
  it('accepts a complete VPS production environment', () => {
    const result = validateProductionEnv({ env: baseEnv });

    expect(result.ok).toBe(true);
    expect(result.shouldFail).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('fails closed for missing production auth and database values', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DB_HOST: '',
        JWT_SECRET: '',
        REFRESH_TOKEN_SECRET: ''
      }
    });

    expect(result.ok).toBe(false);
    expect(result.shouldFail).toBe(true);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Missing required environment value: DB_HOST',
      'Missing required environment value: JWT_SECRET',
      'Missing required environment value: REFRESH_TOKEN_SECRET'
    ]));
  });

  it('reports failing names without secret values', () => {
    const secretValue = 'CHANGE_THIS_TO_A_STRONG_SECRET_AT_LEAST_32_CHARACTERS_LONG';
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        JWT_SECRET: secretValue
      }
    });

    const message = formatValidationFailure(result);

    expect(result.ok).toBe(false);
    expect(message).toContain('JWT_SECRET must not use a placeholder value');
    expect(message).not.toContain(secretValue);
  });

  it('fails production when session cookies are not explicitly secure', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        SESSION_COOKIE_SECURE: 'false'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('SESSION_COOKIE_SECURE must be true in production');
  });

  it('fails production when DB auto sync is enabled', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DB_AUTO_SYNC: 'true'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DB_AUTO_SYNC must not be true in hosted production profiles');
  });

  it('keeps non-production validation warning-only', () => {
    const result = validateProductionEnv({
      env: {
        NODE_ENV: 'development',
        JWT_SECRET: ''
      }
    });

    expect(result.ok).toBe(true);
    expect(result.shouldFail).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('Production environment validation is warning-only outside NODE_ENV=production');
  });

  it('requires PayMongo config when payments are enabled', () => {
    const missing = validateProductionEnv({
      env: {
        ...baseEnv,
        PAYMENTS_ENABLED: 'true'
      }
    });

    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain('Payment-enabled production requires PayMongo or PayPal provider configuration');

    const configured = validateProductionEnv({
      env: {
        ...baseEnv,
        PAYMENTS_ENABLED: 'true',
        PAYMONGO_MODE: 'test',
        PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
        PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
        PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture',
        PAYMONGO_STANDARD_PLAN_ID: 'source_standard_fixture',
        PAYMONGO_PREMIUM_PLAN_ID: 'source_premium_fixture'
      }
    });

    expect(configured.ok).toBe(true);
  });

  it('blocks unsigned PayMongo bypasses in production', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        PAYMENTS_ENABLED: 'true',
        PAYMONGO_MODE: 'test',
        PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
        PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
        PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture',
        PAYMONGO_STANDARD_PLAN_ID: 'source_standard_fixture',
        PAYMONGO_PREMIUM_PLAN_ID: 'source_premium_fixture',
        PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS: 'true'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS must not be true in production, live mode, or payment-enabled deployments');
  });

  it('requires explicit live confirmation for production direct GCash', () => {
    const directLiveEnv = {
      ...baseEnv,
      COMMERCE_PAYMENTS_ENABLED: 'true',
      PAYMONGO_MODE: 'live',
      PAYMONGO_LIVE_PUBLIC_KEY: 'pk_live_fixture',
      PAYMONGO_LIVE_SECRET_KEY: 'sk_live_fixture',
      PAYMONGO_LIVE_WEBHOOK_SECRET: 'whsec_live_fixture',
      PAYMONGO_DGFY_MERCHANT_ID: 'org_dgfy_fixture',
      STOREFRONT_DIRECT_GCASH_ENABLED: 'true'
    };

    const missingConfirmation = validateProductionEnv({ env: directLiveEnv });
    expect(missingConfirmation.ok).toBe(false);
    expect(missingConfirmation.errors).toContain(
      'STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true is required when direct GCash is enabled in live mode'
    );

    const configured = validateProductionEnv({
      env: {
        ...directLiveEnv,
        STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED: 'true'
      }
    });
    expect(configured.ok).toBe(true);
  });

  it('requires PayMongo and DGFY merchant config when commerce payments are enabled', () => {
    const missing = validateProductionEnv({
      env: {
        ...baseEnv,
        COMMERCE_PAYMENTS_ENABLED: 'true',
        COMMERCE_QRPH_ENABLED: 'true'
      }
    });

    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain('Payment-enabled production requires PayMongo or PayPal provider configuration');

    const missingMerchant = validateProductionEnv({
      env: {
        ...baseEnv,
        COMMERCE_PAYMENTS_ENABLED: 'true',
        COMMERCE_QRPH_ENABLED: 'true',
        PAYMONGO_MODE: 'test',
        PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
        PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
        PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture'
      }
    });

    expect(missingMerchant.ok).toBe(false);
    expect(missingMerchant.errors).toContain('Missing required environment value: PAYMONGO_DGFY_MERCHANT_ID');

    const configured = validateProductionEnv({
      env: {
        ...baseEnv,
        COMMERCE_PAYMENTS_ENABLED: 'true',
        COMMERCE_QRPH_ENABLED: 'true',
        PAYMONGO_MODE: 'test',
        PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
        PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
        PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture',
        PAYMONGO_DGFY_MERCHANT_ID: 'org_dgfy_fixture'
      }
    });

    expect(configured.ok).toBe(true);
  });

  it('requires separate finance maker-checker identities for tenant revenue collection', () => {
    const paymentConfig = {
      ...baseEnv,
      TENANT_REVENUE_SHARING_ENABLED: 'true',
      TENANT_PAYOUT_ENCRYPTION_KEY: strongSecret('payout'),
      PAYMONGO_MODE: 'test',
      PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_fixture',
      PAYMONGO_TEST_SECRET_KEY: 'sk_test_fixture',
      PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test_fixture'
    };
    const missingRoster = validateProductionEnv({ env: paymentConfig });

    expect(missingRoster.ok).toBe(false);
    expect(missingRoster.errors).toContain(
      'TENANT_REVENUE_SHARING_ENABLED requires valid ADMIN_ACCOUNTS_JSON maker-checker identities'
    );

    const bcryptFixture = `$2b$12$${'a'.repeat(53)}`;
    const configured = validateProductionEnv({
      env: {
        ...paymentConfig,
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          {
            username: 'finance.preparer',
            password_hash: bcryptFixture,
            financial_role: 'finance_preparer'
          },
          {
            username: 'finance.approver',
            password_hash: bcryptFixture,
            financial_role: 'finance_approver'
          }
        ])
      }
    });

    expect(configured.ok).toBe(true);
  });
});
