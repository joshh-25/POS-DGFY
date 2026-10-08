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
  PAYMENTS_ENABLED: 'false',
  ADMIN_USERNAME: 'platform-admin',
  ADMIN_PASSWORD_HASH: `$2b$12$${'a'.repeat(53)}`
};

describe('production environment validation', () => {
  it('accepts a complete VPS production environment', () => {
    const result = validateProductionEnv({ env: baseEnv });

    expect(result.ok).toBe(true);
    expect(result.shouldFail).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('requires Redis when the production DGLaundry partner integration is enabled', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DGLAUNDRY_INTEGRATION_ENABLED: 'true',
        REDIS_URL: ''
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DGLAUNDRY_INTEGRATION_ENABLED requires REDIS_URL for durable partner-request replay protection');
  });

  it('requires an explicit environment and matching issuer for the DGLaundry connection', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DGLAUNDRY_INTEGRATION_ENABLED: 'true',
        REDIS_URL: 'redis://127.0.0.1:6379',
        DGLAUNDRY_INTEGRATION_ENVIRONMENT: 'staging',
        DGFY_OIDC_ISSUER: 'https://api.dgfy.ph/oidc'
      }
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DGFY_OIDC_ISSUER must be https://api.stage.dgfy.ph/oidc for staging');
    expect(result.errors).toContain('Missing required environment value: DGFY_DGLAUNDRY_PARTNER_APP_ID');
  });

  it('requires an explicit service client and exact HTTPS partner audience for DGLaundry', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DGLAUNDRY_INTEGRATION_ENABLED: 'true',
        DGLAUNDRY_INTEGRATION_ENVIRONMENT: 'staging',
        DGFY_OIDC_ISSUER: 'https://api.stage.dgfy.ph/oidc',
        DGFY_DGLAUNDRY_REDIRECT_URI: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback',
        DGFY_OIDC_PRIVATE_KEY_FILE: '/run/secrets/dgfy-oidc-private.pem',
        DGFY_OIDC_PUBLIC_KEY_FILE: '/run/secrets/dgfy-oidc-public.pem',
        DGFY_OIDC_KEY_ID: 'dgfy-oidc-stage-1',
        DGFY_DGLAUNDRY_MACHINE_CLIENT_ID: 'dglaundry-machine-stage',
        DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE: '/run/secrets/dglaundry-machine.pub.pem',
        DGFY_DGLAUNDRY_PARTNER_APP_ID: 'dglaundry',
        DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: 'dgfy-laundry-partner-stage',
        DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID: 'dgfy-event-stage-1',
        DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY_FILE: '/run/secrets/dgfy-event.pem',
        DGLAUNDRY_INTEGRATION_PUBLIC_KEY_FILE: '/run/secrets/dglaundry-event.pub.pem',
        DGLAUNDRY_PARTNER_REQUEST_KEY_ID: 'dgfy-request-stage-1',
        DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY_FILE: '/run/secrets/dgfy-request.pub.pem',
        DGLAUNDRY_PARTNER_SIGNING_KEY_ID: 'dgfy-request-stage-1',
        DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE: '/run/secrets/dgfy-request-private.pem',
        DGLAUNDRY_PARTNER_BASE_URL: 'https://laundry.surebizcorp.com',
        DGLAUNDRY_PARTNER_AUDIENCE: 'https://laundry.surebizcorp.com',
        DGLAUNDRY_SIGNATURE_PROFILE: 'http-message-signatures-v1',
        PAYMONGO_MODE: 'test'
      }
    });
    expect(result.errors).not.toContain('Missing required environment value: DGFY_DGLAUNDRY_SERVICE_CLIENT_ID');
    expect(result.errors).not.toContain('Missing required environment value: DGFY_DGLAUNDRY_PARTNER_APP_ID');
    expect(result.errors).not.toContain('DGLAUNDRY_PARTNER_AUDIENCE must exactly match the DGLAUNDRY_PARTNER_BASE_URL origin');
  });

  it('rejects a DGLaundry partner audience that does not match its HTTPS origin', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DGLAUNDRY_INTEGRATION_ENABLED: 'true',
        DGLAUNDRY_INTEGRATION_ENVIRONMENT: 'staging',
        DGFY_OIDC_ISSUER: 'https://api.stage.dgfy.ph/oidc',
        DGLAUNDRY_PARTNER_BASE_URL: 'https://laundry.surebizcorp.com',
        DGLAUNDRY_PARTNER_AUDIENCE: 'https://api.stage.dgfy.ph'
      }
    });
    expect(result.errors).toContain('DGLAUNDRY_PARTNER_AUDIENCE must exactly match the DGLAUNDRY_PARTNER_BASE_URL origin');
  });

  it('requires the outbound P-256 request key and registered key ID for hosted DGLaundry access', () => {
    const base = {
      ...baseEnv,
      DGLAUNDRY_INTEGRATION_ENABLED: 'true',
      DGLAUNDRY_INTEGRATION_ENVIRONMENT: 'staging',
      DGFY_OIDC_ISSUER: 'https://api.stage.dgfy.ph/oidc',
      DGFY_DGLAUNDRY_REDIRECT_URI: 'https://laundry.surebizcorp.com/api/v1/session/dgfy/callback',
      DGFY_OIDC_PRIVATE_KEY_FILE: '/run/secrets/dgfy-oidc-private.pem',
      DGFY_OIDC_PUBLIC_KEY_FILE: '/run/secrets/dgfy-oidc-public.pem',
      DGFY_OIDC_KEY_ID: 'dgfy-oidc-stage-1',
      DGFY_DGLAUNDRY_MACHINE_CLIENT_ID: 'dglaundry-machine-stage',
      DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE: '/run/secrets/dglaundry-machine.pub.pem',
      DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: 'dgfy-laundry-partner-stage',
      DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID: 'dgfy-event-stage-1',
      DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY_FILE: '/run/secrets/dgfy-event.pem',
      DGLAUNDRY_INTEGRATION_PUBLIC_KEY_FILE: '/run/secrets/dglaundry-event.pub.pem',
      DGLAUNDRY_PARTNER_REQUEST_KEY_ID: 'dgfy-request-stage-1',
      DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY_FILE: '/run/secrets/dgfy-request.pub.pem',
      DGLAUNDRY_PARTNER_BASE_URL: 'https://laundry.surebizcorp.com',
      DGLAUNDRY_PARTNER_AUDIENCE: 'https://laundry.surebizcorp.com',
      DGLAUNDRY_SIGNATURE_PROFILE: 'http-message-signatures-v1',
      PAYMONGO_MODE: 'test'
    };
    const missing = validateProductionEnv({ env: base });
    expect(missing.errors).toContain('Missing required environment value: DGLAUNDRY_PARTNER_SIGNING_KEY_ID');
    expect(missing.errors).toContain('Missing required environment value: DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE (or DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY)');

    const configured = validateProductionEnv({ env: { ...base, DGLAUNDRY_PARTNER_SIGNING_KEY_ID: 'dgfy-request-stage-1', DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE: '/run/secrets/dgfy-request-private.pem' } });
    expect(configured.errors).not.toContain('Missing required environment value: DGLAUNDRY_PARTNER_SIGNING_KEY_ID');
    expect(configured.errors).not.toContain('Missing required environment value: DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE (or DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY)');
  });

  it('rejects live PayMongo mode while the DGLaundry provider environment is staging', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        DGLAUNDRY_INTEGRATION_ENABLED: 'true',
        DGLAUNDRY_INTEGRATION_ENVIRONMENT: 'staging',
        DGFY_OIDC_ISSUER: 'https://api.stage.dgfy.ph/oidc',
        DGLAUNDRY_PARTNER_BASE_URL: 'https://laundry.surebizcorp.com',
        DGLAUNDRY_PARTNER_AUDIENCE: 'https://laundry.surebizcorp.com',
        PAYMONGO_MODE: 'live'
      }
    });
    expect(result.errors).toContain('DGLaundry staging integration requires PAYMONGO_MODE=test; live PayMongo is forbidden in staging');
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

  it('requires explicit non-default admin credentials in production', () => {
    const missing = validateProductionEnv({
      env: {
        ...baseEnv,
        ADMIN_USERNAME: '',
        ADMIN_PASSWORD_HASH: ''
      }
    });
    expect(missing.errors).toEqual(expect.arrayContaining([
      'Missing required environment value: ADMIN_USERNAME',
      'Missing required environment value: ADMIN_PASSWORD_HASH'
    ]));

    const defaultHash = validateProductionEnv({
      env: {
        ...baseEnv,
        ADMIN_USERNAME: 'skupervisor',
        ADMIN_PASSWORD_HASH: '$2a$12$8cIJyb0nC8.ZyZbmXRb5FO3R8T.n5V4s2EbMiA.mCCi.l/47tmKzK'
      }
    });
    expect(defaultHash.errors).toContain(
      'ADMIN_PASSWORD_HASH must not use the documented default password hash in production'
    );
  });

  it('disables generic mode RBAC fallback by default in production', () => {
    const result = validateProductionEnv({
      env: {
        ...baseEnv,
        MODE_RBAC_GENERIC_FALLBACK_ENABLED: 'true'
      }
    });
    expect(result.errors).toContain('MODE_RBAC_GENERIC_FALLBACK_ENABLED must be false in production');

    const defaulted = validateProductionEnv({ env: baseEnv });
    expect(defaulted.errors).not.toContain('MODE_RBAC_GENERIC_FALLBACK_ENABLED must be false in production');
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

  it('requires explicit live confirmation for production direct GCash and Maya', () => {
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

    const mayaMissingConfirmation = validateProductionEnv({
      env: {
        ...directLiveEnv,
        STOREFRONT_DIRECT_GCASH_ENABLED: 'false',
        STOREFRONT_DIRECT_MAYA_ENABLED: 'true'
      }
    });
    expect(mayaMissingConfirmation.ok).toBe(false);
    expect(mayaMissingConfirmation.errors).toContain(
      'STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED=true is required when direct Maya is enabled in live mode'
    );

    const mayaConfigured = validateProductionEnv({
      env: {
        ...directLiveEnv,
        STOREFRONT_DIRECT_GCASH_ENABLED: 'false',
        STOREFRONT_DIRECT_MAYA_ENABLED: 'true',
        STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED: 'true'
      }
    });
    expect(mayaConfigured.ok).toBe(true);
  });

  it('requires explicit live confirmation for production direct card', () => {
    const directLiveEnv = {
      ...baseEnv,
      COMMERCE_PAYMENTS_ENABLED: 'true',
      PAYMONGO_MODE: 'live',
      PAYMONGO_LIVE_PUBLIC_KEY: 'pk_live_fixture',
      PAYMONGO_LIVE_SECRET_KEY: 'sk_live_fixture',
      PAYMONGO_LIVE_WEBHOOK_SECRET: 'whsec_live_fixture',
      PAYMONGO_DGFY_MERCHANT_ID: 'org_dgfy_fixture',
      STOREFRONT_DIRECT_CARD_ENABLED: 'true'
    };

    const missingConfirmation = validateProductionEnv({ env: directLiveEnv });
    expect(missingConfirmation.ok).toBe(false);
    expect(missingConfirmation.errors).toContain(
      'STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED=true is required when direct card is enabled in live mode'
    );

    const configured = validateProductionEnv({
      env: {
        ...directLiveEnv,
        STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED: 'true'
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
