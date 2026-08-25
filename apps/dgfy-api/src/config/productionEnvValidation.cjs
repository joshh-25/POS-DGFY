const VALID_PROFILES = new Set(['shared', 'vps']);
const SECRET_KEYS = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'POS_OPERATOR_AUTHORITY_SECRET'];
const PLACEHOLDER_PATTERN = /(change[_-]?this|change[_-]?me|replace[_-]?with|placeholder|your[_-]?|example\.com|xxxx|dummy|sample)/i;
const DEFAULT_ADMIN_USERNAME = 'skupervisor';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2a$12$8cIJyb0nC8.ZyZbmXRb5FO3R8T.n5V4s2EbMiA.mCCi.l/47tmKzK';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const BASE_REQUIRED_KEYS = [
  'NODE_ENV',
  'HOSTING_PROFILE',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'DB_PASSWORD',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'CORS_ORIGIN',
  'SESSION_COOKIE_SECURE',
  'AUTH_BLACKLIST_FAILURE_MODE',
  'TEMP_FILE_STORAGE',
  'RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS',
  'RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS'
];

const hasValue = (env, key) => String(env?.[key] || '').trim().length > 0;

const normalizeBoolean = (value) => String(value || '').trim().toLowerCase();

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(normalizeBoolean(value));

const normalizeMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fail-closed') return 'fail_closed';
  if (normalized === 'fail-open') return 'fail_open';
  return normalized;
};

const normalizeProfile = (profile, env = {}) => {
  const normalized = String(profile || env.HOSTING_PROFILE || '').trim().toLowerCase();
  if (VALID_PROFILES.has(normalized)) return normalized;
  return normalized;
};

const addMissing = (errors, key) => {
  errors.push(`Missing required environment value: ${key}`);
};

const requireAny = (env, keys, errors, label) => {
  if (keys.some((key) => hasValue(env, key))) return;
  errors.push(`Missing required environment value: ${label || keys.join(' or ')}`);
};

const validateRequiredKeys = (env, errors, keys = BASE_REQUIRED_KEYS) => {
  for (const key of keys) {
    if (!hasValue(env, key)) addMissing(errors, key);
  }
};

const validateSecrets = (env, errors, keys = SECRET_KEYS) => {
  for (const key of keys) {
    const value = String(env?.[key] || '').trim();
    if (!value) continue;

    if (value.length < 32) {
      errors.push(`${key} must be at least 32 characters long`);
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      errors.push(`${key} must not use a placeholder value`);
    }
  }
};

const validateCors = (env, errors) => {
  const origin = String(env.CORS_ORIGIN || '').trim();
  if (!origin) return;
  const origins = origin.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (origins.length === 0) {
    errors.push('CORS_ORIGIN must include at least one explicit origin');
  }
  if (origins.some((entry) => entry === '*')) {
    errors.push('CORS_ORIGIN must not use wildcard origins in production');
  }
};

const validateSessionCookies = (env, errors) => {
  if (normalizeBoolean(env.SESSION_COOKIE_SECURE) !== 'true') {
    errors.push('SESSION_COOKIE_SECURE must be true in production');
  }
};

const validateDatabaseSafety = (env, errors) => {
  if (isTruthy(env.DB_AUTO_SYNC)) {
    errors.push('DB_AUTO_SYNC must not be true in hosted production profiles');
  }
};

const validateProductionAdminCredentials = (env, errors) => {
  const configuredRoster = String(env.ADMIN_ACCOUNTS_JSON || '').trim();
  if (configuredRoster) {
    let accounts;
    try {
      accounts = JSON.parse(configuredRoster);
    } catch {
      errors.push('ADMIN_ACCOUNTS_JSON must be valid JSON in production');
      return;
    }
    if (!Array.isArray(accounts) || accounts.length === 0) {
      errors.push('ADMIN_ACCOUNTS_JSON must contain at least one admin account in production');
      return;
    }
    accounts.forEach((account, index) => {
      const username = String(account?.username || '').trim();
      const passwordHash = String(account?.password_hash || account?.passwordHash || '').trim();
      if (!username || !BCRYPT_HASH_PATTERN.test(passwordHash)) {
        errors.push(`ADMIN_ACCOUNTS_JSON account ${index} requires a username and valid bcrypt password hash`);
        return;
      }
      if (passwordHash === DEFAULT_ADMIN_PASSWORD_HASH) {
        errors.push(`ADMIN_ACCOUNTS_JSON account ${index} must not use the documented default password hash`);
      }
    });
    return;
  }

  const username = String(env.ADMIN_USERNAME || '').trim();
  const passwordHash = String(env.ADMIN_PASSWORD_HASH || '').trim();
  if (!username) addMissing(errors, 'ADMIN_USERNAME');
  if (!passwordHash) addMissing(errors, 'ADMIN_PASSWORD_HASH');
  if (passwordHash && !BCRYPT_HASH_PATTERN.test(passwordHash)) {
    errors.push('ADMIN_PASSWORD_HASH must be a valid bcrypt hash');
  }
  if (passwordHash === DEFAULT_ADMIN_PASSWORD_HASH) {
    errors.push('ADMIN_PASSWORD_HASH must not use the documented default password hash in production');
  }
  if (username === DEFAULT_ADMIN_USERNAME && passwordHash === DEFAULT_ADMIN_PASSWORD_HASH) {
    errors.push('Production must not use the documented default admin account');
  }
};

const validateModeRbacFallback = (env, errors) => {
  if (isTruthy(env.MODE_RBAC_GENERIC_FALLBACK_ENABLED)) {
    errors.push('MODE_RBAC_GENERIC_FALLBACK_ENABLED must be false in production');
  }
};

const validateRateLimits = (env, errors) => {
  for (const key of ['RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS', 'RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS']) {
    const raw = String(env[key] || '').trim();
    if (!raw) continue;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${key} must be a positive number`);
    }
  }
};

const validateProfilePolicy = ({ profile, env, errors }) => {
  if (!VALID_PROFILES.has(profile)) {
    errors.push('Profile must be one of: shared, vps');
    return;
  }

  const envProfile = String(env.HOSTING_PROFILE || '').trim().toLowerCase();
  if (envProfile && envProfile !== profile) {
    errors.push(`HOSTING_PROFILE must be ${profile} for this preflight`);
  }

  const blacklistMode = normalizeMode(env.AUTH_BLACKLIST_FAILURE_MODE);
  const redisConfigured = hasValue(env, 'REDIS_URL');

  if (profile === 'shared') {
    if (redisConfigured) {
      errors.push('Shared profile must not set REDIS_URL');
    }
    if (blacklistMode !== 'fail_open') {
      errors.push('Shared profile requires AUTH_BLACKLIST_FAILURE_MODE=fail_open');
    }
    if (String(env.TEMP_FILE_STORAGE || '').trim().toLowerCase() !== 'local') {
      errors.push('Shared profile requires TEMP_FILE_STORAGE=local');
    }
    if (hasValue(env, 'HOSTING_INSTANCE_COUNT') && String(env.HOSTING_INSTANCE_COUNT).trim() !== '1') {
      errors.push('Shared profile requires HOSTING_INSTANCE_COUNT=1 when set');
    }
  }

  if (profile === 'vps') {
    if (!redisConfigured) {
      errors.push('VPS profile requires REDIS_URL');
    }
    if (blacklistMode !== 'fail_closed') {
      errors.push('VPS profile requires AUTH_BLACKLIST_FAILURE_MODE=fail_closed');
    }
  }
};

const validatePayMongoConfig = (env, errors) => {
  const mode = String(env.PAYMONGO_MODE || 'test').trim().toLowerCase();
  if (mode !== 'test' && mode !== 'live') {
    errors.push("PAYMONGO_MODE must be either 'test' or 'live'");
    return;
  }

  requireAny(
    env,
    mode === 'live'
      ? ['PAYMONGO_LIVE_PUBLIC_KEY', 'PAYMONGO_PUBLIC_KEY']
      : ['PAYMONGO_TEST_PUBLIC_KEY', 'PAYMONGO_PUBLIC_KEY'],
    errors,
    `PayMongo public key for ${mode} mode`
  );
  requireAny(
    env,
    mode === 'live'
      ? ['PAYMONGO_LIVE_SECRET_KEY', 'PAYMONGO_SECRET_KEY']
      : ['PAYMONGO_TEST_SECRET_KEY', 'PAYMONGO_SECRET_KEY'],
    errors,
    `PayMongo secret key for ${mode} mode`
  );
  requireAny(
    env,
    mode === 'live'
      ? ['PAYMONGO_LIVE_WEBHOOK_SECRET', 'PAYMONGO_WEBHOOK_SECRET']
      : ['PAYMONGO_TEST_WEBHOOK_SECRET', 'PAYMONGO_WEBHOOK_SECRET'],
    errors,
    `PayMongo webhook secret for ${mode} mode`
  );
};

const validatePayPalConfig = (env, errors) => {
  for (const key of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_STANDARD_PLAN_ID']) {
    if (!hasValue(env, key)) addMissing(errors, key);
  }
  if (!hasValue(env, 'PAYPAL_PREMIUM_PLAN_ID') && !hasValue(env, 'PAYPAL_PLAN_ID')) {
    errors.push('Missing required environment value: PAYPAL_PREMIUM_PLAN_ID (or legacy PAYPAL_PLAN_ID)');
  }
};

const detectPaymentProvider = (env) => {
  const configured = String(env.PAYMENT_PROVIDER || env.DEPLOY_PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (['paymongo', 'paypal', 'dual'].includes(configured)) return configured;

  const hasPayMongo = [
    'PAYMONGO_PUBLIC_KEY',
    'PAYMONGO_SECRET_KEY',
    'PAYMONGO_TEST_PUBLIC_KEY',
    'PAYMONGO_TEST_SECRET_KEY',
    'PAYMONGO_LIVE_PUBLIC_KEY',
    'PAYMONGO_LIVE_SECRET_KEY',
    'PAYMONGO_STANDARD_PLAN_ID'
  ].some((key) => hasValue(env, key));

  const hasPayPal = [
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_WEBHOOK_ID',
    'PAYPAL_STANDARD_PLAN_ID'
  ].some((key) => hasValue(env, key));

  if (hasPayMongo && hasPayPal) return 'dual';
  if (hasPayMongo) return 'paymongo';
  if (hasPayPal) return 'paypal';
  return '';
};

const validatePaymentConfig = (env, errors, warnings) => {
  const paymentsEnabled = isTruthy(env.PAYMENTS_ENABLED);
  const commercePaymentsEnabled = isTruthy(env.COMMERCE_PAYMENTS_ENABLED)
    || isTruthy(env.COMMERCE_QRPH_ENABLED)
    || isTruthy(env.COMMERCE_PAYMONGO_SPLIT_ENABLED);
  const tenantRevenueSharingEnabled = isTruthy(env.TENANT_REVENUE_SHARING_ENABLED);
  const paymongoLiveMode = String(env.PAYMONGO_MODE || '').trim().toLowerCase() === 'live';
  const directGcashEnabled = isTruthy(env.STOREFRONT_DIRECT_GCASH_ENABLED);
  const directMayaEnabled = isTruthy(env.STOREFRONT_DIRECT_MAYA_ENABLED);
  const directCardEnabled = isTruthy(env.STOREFRONT_DIRECT_CARD_ENABLED);

  if (!paymentsEnabled && !commercePaymentsEnabled && !tenantRevenueSharingEnabled && !paymongoLiveMode) return;

  if (directGcashEnabled && paymongoLiveMode && !isTruthy(env.STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED)) {
    errors.push('STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true is required when direct GCash is enabled in live mode');
  }
  if (directMayaEnabled && paymongoLiveMode && !isTruthy(env.STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED)) {
    errors.push('STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED=true is required when direct Maya is enabled in live mode');
  }
  if (directCardEnabled && paymongoLiveMode && !isTruthy(env.STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED)) {
    errors.push('STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED=true is required when direct card is enabled in live mode');
  }

  const provider = detectPaymentProvider(env);
  if (!provider) {
    errors.push('Payment-enabled production requires PayMongo or PayPal provider configuration');
    return;
  }

  if (provider === 'paymongo' || provider === 'dual' || paymongoLiveMode || commercePaymentsEnabled) {
    validatePayMongoConfig(env, errors);
  }
  if (provider === 'paypal' || provider === 'dual') {
    validatePayPalConfig(env, errors);
  }

  if (commercePaymentsEnabled && !tenantRevenueSharingEnabled && !hasValue(env, 'PAYMONGO_DGFY_MERCHANT_ID')) {
    addMissing(errors, 'PAYMONGO_DGFY_MERCHANT_ID');
  }
  if (tenantRevenueSharingEnabled) {
    if (isTruthy(env.COMMERCE_PAYMONGO_SPLIT_ENABLED)) {
      errors.push('TENANT_REVENUE_SHARING_ENABLED and COMMERCE_PAYMONGO_SPLIT_ENABLED cannot both be true');
    }
    if (!hasValue(env, 'TENANT_PAYOUT_ENCRYPTION_KEY') || String(env.TENANT_PAYOUT_ENCRYPTION_KEY).trim().length < 32) {
      errors.push('TENANT_PAYOUT_ENCRYPTION_KEY must contain at least 32 characters');
    }
    if (isTruthy(env.TENANT_AUTOMATIC_PAYOUT_ENABLED) && !isTruthy(env.TENANT_EXTERNAL_PAYOUT_APPROVED)) {
      errors.push('TENANT_AUTOMATIC_PAYOUT_ENABLED requires TENANT_EXTERNAL_PAYOUT_APPROVED=true');
    }
    try {
      const accounts = JSON.parse(String(env.ADMIN_ACCOUNTS_JSON || ''));
      if (!Array.isArray(accounts) || accounts.length < 2) {
        errors.push('TENANT_REVENUE_SHARING_ENABLED requires at least two ADMIN_ACCOUNTS_JSON identities');
      } else {
        const normalizedAccounts = accounts.map((account) => ({
          username: String(account?.username || '').trim().toLowerCase(),
          passwordHash: String(
            account?.password_hash || account?.passwordHash || ''
          ).trim(),
          financialRole: String(
            account?.financial_role || account?.financialRole || ''
          ).trim().toLowerCase()
        }));
        const allowedFinancialRoles = new Set([
          'platform_admin',
          'finance_viewer',
          'finance_preparer',
          'finance_approver'
        ]);
        const bcryptHashPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
        if (normalizedAccounts.some((account) => (
          !account.username
          || !bcryptHashPattern.test(account.passwordHash)
          || !allowedFinancialRoles.has(account.financialRole)
        ))) {
          errors.push(
            'ADMIN_ACCOUNTS_JSON entries require username, bcrypt password_hash, and a valid financial_role'
          );
        }
        const distinctUsernames = new Set(
          normalizedAccounts.map((account) => account.username).filter(Boolean)
        );
        const preparers = normalizedAccounts.filter((account) => [
          'platform_admin',
          'finance_preparer',
          'finance_approver'
        ].includes(account.financialRole));
        const approvers = normalizedAccounts.filter((account) => [
          'platform_admin',
          'finance_approver'
        ].includes(account.financialRole));
        const hasMakerCheckerPair = preparers.some((preparer) => (
          approvers.some((approver) => approver.username !== preparer.username)
        ));
        if (distinctUsernames.size < 2 || !hasMakerCheckerPair) {
          errors.push(
            'ADMIN_ACCOUNTS_JSON requires distinct finance preparer and finance approver identities'
          );
        }
      }
    } catch {
      errors.push(
        'TENANT_REVENUE_SHARING_ENABLED requires valid ADMIN_ACCOUNTS_JSON maker-checker identities'
      );
    }
  }

  if (isTruthy(env.PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS)) {
    errors.push('PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS must not be true in production, live mode, or payment-enabled deployments');
  }

  if (paymentsEnabled && normalizeProfile(env.HOSTING_PROFILE, env) === 'shared') {
    warnings.push('PAYMENTS_ENABLED=true on shared hosting relies on single-process scheduler assumptions');
  }
};

const validateProductionEnv = ({ env = process.env, profile = null, strictProduction = false } = {}) => {
  const errors = [];
  const warnings = [];
  const normalizedNodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  const isProduction = normalizedNodeEnv === 'production';
  const normalizedProfile = normalizeProfile(profile, env);

  if (!isProduction && !strictProduction) {
    validateSecrets(env, warnings);
    if (BASE_REQUIRED_KEYS.some((key) => !hasValue(env, key))) {
      warnings.push('Production environment validation is warning-only outside NODE_ENV=production');
    }
    return {
      ok: true,
      shouldFail: false,
      errors: [],
      warnings,
      profile: normalizedProfile,
      isProduction
    };
  }

  validateRequiredKeys(env, errors);
  validateProductionAdminCredentials(env, errors);
  validateModeRbacFallback(env, errors);
  validateSecrets(env, errors);
  validateCors(env, errors);
  validateSessionCookies(env, errors);
  validateDatabaseSafety(env, errors);
  validateRateLimits(env, errors);
  validateProfilePolicy({ profile: normalizedProfile, env, errors });
  validatePaymentConfig(env, errors, warnings);

  if (normalizedNodeEnv && normalizedNodeEnv !== 'production') {
    errors.push('NODE_ENV must be production for hosting preflight');
  }

  return {
    ok: errors.length === 0,
    shouldFail: errors.length > 0,
    errors,
    warnings,
    profile: normalizedProfile,
    isProduction: true
  };
};

const validateHostingProfile = ({ profile, env, envFile = null }) => {
  const result = validateProductionEnv({ env, profile, strictProduction: true });
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    profile: result.profile,
    envFile
  };
};

const formatValidationFailure = (result) => {
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  return `Missing or invalid production environment configuration: ${errors.join('; ')}`;
};

module.exports = {
  BASE_REQUIRED_KEYS,
  PLACEHOLDER_PATTERN,
  detectPaymentProvider,
  formatValidationFailure,
  hasValue,
  isTruthy,
  normalizeMode,
  validateHostingProfile,
  validateProductionEnv
};
