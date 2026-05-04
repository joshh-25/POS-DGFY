const NORMALIZED_PROFILES = new Set(['shared', 'vps']);

const normalizeBooleanString = (value) => String(value || '').trim().toLowerCase();

export const isRedisConfigured = (env = process.env) => Boolean(String(env.REDIS_URL || '').trim());

export const normalizeHostingProfile = (value, env = process.env) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (NORMALIZED_PROFILES.has(normalized)) {
    return normalized;
  }

  return isRedisConfigured(env) ? 'vps' : 'shared';
};

export const getHostingProfile = (env = process.env) => normalizeHostingProfile(env.HOSTING_PROFILE, env);

export const getTokenBlacklistFailureMode = (env = process.env) => {
  const configuredMode = String(env.AUTH_BLACKLIST_FAILURE_MODE || '').trim().toLowerCase();

  if (configuredMode === 'fail_closed' || configuredMode === 'fail-closed') {
    return 'fail_closed';
  }

  if (configuredMode === 'fail_open' || configuredMode === 'fail-open') {
    return 'fail_open';
  }

  return env.NODE_ENV === 'production' ? 'fail_closed' : 'fail_open';
};

export const getConfiguredTempFileStorageMode = (env = process.env) => {
  const configured = String(env.TEMP_FILE_STORAGE || '').trim().toLowerCase();
  if (configured === 'local' || configured === 'cache' || configured === 'auto') {
    return configured;
  }
  return 'auto';
};

export const resolveTempFileStorageMode = ({ env = process.env, cacheAvailable = false } = {}) => {
  const configured = getConfiguredTempFileStorageMode(env);
  if (configured === 'local') return 'local';
  if (configured === 'cache') return 'cache';

  const profile = getHostingProfile(env);
  if (profile === 'shared' && !isRedisConfigured(env)) {
    return 'local';
  }

  return cacheAvailable ? 'cache' : 'local';
};

export const resolveSchedulerLockMode = ({ env = process.env, redisConnected = false } = {}) => {
  if (redisConnected) {
    return 'distributed';
  }

  if (getHostingProfile(env) === 'shared' && !isRedisConfigured(env)) {
    return 'single_instance';
  }

  return 'single_instance_fallback';
};

export const isTruthyEnv = (value) => {
  const normalized = normalizeBooleanString(value);
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export default {
  getConfiguredTempFileStorageMode,
  getHostingProfile,
  getTokenBlacklistFailureMode,
  isRedisConfigured,
  isTruthyEnv,
  normalizeHostingProfile,
  resolveSchedulerLockMode,
  resolveTempFileStorageMode
};
