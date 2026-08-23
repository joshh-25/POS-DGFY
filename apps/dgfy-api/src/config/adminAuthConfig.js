const DEFAULT_ADMIN_USERNAME = 'skupervisor';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2a$12$8cIJyb0nC8.ZyZbmXRb5FO3R8T.n5V4s2EbMiA.mCCi.l/47tmKzK';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
export const ADMIN_FINANCIAL_ROLES = Object.freeze({
  PLATFORM_ADMIN: 'platform_admin',
  FINANCE_VIEWER: 'finance_viewer',
  FINANCE_PREPARER: 'finance_preparer',
  FINANCE_APPROVER: 'finance_approver'
});
const ALLOWED_ADMIN_FINANCIAL_ROLES = new Set(Object.values(ADMIN_FINANCIAL_ROLES));

const isProductionRuntime = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const assertProductionAdminCredentials = ({ passwordHash, source }) => {
  if (!isProductionRuntime()) return;

  if (passwordHash === DEFAULT_ADMIN_PASSWORD_HASH) {
    throw new Error(`Production admin credentials from ${source} must not use the documented default password hash`);
  }
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const normalizeFinancialRole = (value, fallback = ADMIN_FINANCIAL_ROLES.PLATFORM_ADMIN) => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!ALLOWED_ADMIN_FINANCIAL_ROLES.has(normalized)) {
    throw new Error(
      `Admin financial role must be one of: ${[...ALLOWED_ADMIN_FINANCIAL_ROLES].join(', ')}`
    );
  }
  return normalized;
};

const validateAdminAccount = (account, index) => {
  const username = String(account?.username || '').trim();
  const passwordHash = String(
    account?.passwordHash
    || account?.password_hash
    || ''
  ).trim();
  const financialRole = normalizeFinancialRole(
    account?.financialRole || account?.financial_role
  );

  if (!username) {
    throw new Error(`Admin account at index ${index} must include a username`);
  }
  if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
    throw new Error(`Admin account "${username}" must include a valid bcrypt password hash`);
  }

  return { username, passwordHash, financialRole };
};

export const getAdminAccounts = () => {
  const configuredAccounts = String(process.env.ADMIN_ACCOUNTS_JSON || '').trim();
  if (configuredAccounts) {
    let parsed;
    try {
      parsed = JSON.parse(configuredAccounts);
    } catch {
      throw new Error('ADMIN_ACCOUNTS_JSON must be valid JSON');
    }
    if (!Array.isArray(parsed) || parsed.length < 1) {
      throw new Error('ADMIN_ACCOUNTS_JSON must contain at least one admin account');
    }
    const accounts = parsed.map(validateAdminAccount);
    accounts.forEach((account) => assertProductionAdminCredentials({
      ...account,
      source: 'ADMIN_ACCOUNTS_JSON'
    }));
    const normalizedUsernames = accounts.map(({ username }) => username.toLowerCase());
    if (new Set(normalizedUsernames).size !== normalizedUsernames.length) {
      throw new Error('ADMIN_ACCOUNTS_JSON admin usernames must be unique');
    }
    return accounts;
  }

  const configuredUsername = String(process.env.ADMIN_USERNAME || '').trim();
  const configuredPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (isProductionRuntime() && (!configuredUsername || !configuredPasswordHash)) {
    throw new Error('Production requires ADMIN_USERNAME and ADMIN_PASSWORD_HASH or ADMIN_ACCOUNTS_JSON');
  }

  const username = configuredUsername || DEFAULT_ADMIN_USERNAME;
  const passwordHash = configuredPasswordHash || DEFAULT_ADMIN_PASSWORD_HASH;

  if (!username) {
    throw new Error('ADMIN_USERNAME must not be empty');
  }

  if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
    throw new Error('ADMIN_PASSWORD_HASH must be a valid bcrypt hash');
  }

  assertProductionAdminCredentials({ username, passwordHash, source: 'ADMIN_USERNAME/ADMIN_PASSWORD_HASH' });

  return [{
    username,
    passwordHash,
    financialRole: normalizeFinancialRole(process.env.ADMIN_FINANCIAL_ROLE)
  }];
};

export const getAdminCredentials = () => getAdminAccounts()[0];

export const getAdminLockoutConfig = () => ({
  maxAttempts: parsePositiveInt(process.env.ADMIN_LOGIN_LOCKOUT_MAX_ATTEMPTS, 5),
  windowMs: parsePositiveInt(process.env.ADMIN_LOGIN_LOCKOUT_WINDOW_MS, 15 * 60 * 1000),
  lockoutMs: parsePositiveInt(process.env.ADMIN_LOGIN_LOCKOUT_DURATION_MS, 15 * 60 * 1000)
});
