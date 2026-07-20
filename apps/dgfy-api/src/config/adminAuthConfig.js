const DEFAULT_ADMIN_USERNAME = 'skupervisor';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2a$12$8cIJyb0nC8.ZyZbmXRb5FO3R8T.n5V4s2EbMiA.mCCi.l/47tmKzK';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const getAdminCredentials = () => {
  const username = String(process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_PASSWORD_HASH).trim();

  if (!username) {
    throw new Error('ADMIN_USERNAME must not be empty');
  }

  if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
    throw new Error('ADMIN_PASSWORD_HASH must be a valid bcrypt hash');
  }

  return { username, passwordHash };
};

export const getAdminLockoutConfig = () => ({
  maxAttempts: parsePositiveInt(process.env.ADMIN_LOGIN_LOCKOUT_MAX_ATTEMPTS, 5),
  windowMs: parsePositiveInt(process.env.ADMIN_LOGIN_LOCKOUT_WINDOW_MS, 15 * 60 * 1000),
  lockoutMs: parsePositiveInt(process.env.ADMIN_LOGIN_LOCKOUT_DURATION_MS, 15 * 60 * 1000)
});

