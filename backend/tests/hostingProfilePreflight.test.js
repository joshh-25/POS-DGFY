import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateHostingProfile } = require('../../scripts/check-hosting-profile.js');

const strongSecret = (label) => `${label}_${'a'.repeat(48)}`;

const baseEnv = {
  NODE_ENV: 'production',
  DB_HOST: 'localhost',
  DB_USER: 'sku_user',
  DB_NAME: 'sku_inventory',
  DB_PASSWORD: 'database-password-production-like',
  DB_AUTO_SYNC: 'false',
  JWT_SECRET: strongSecret('jwt'),
  REFRESH_TOKEN_SECRET: strongSecret('refresh'),
  CORS_ORIGIN: 'https://app.test',
  SESSION_COOKIE_SECURE: 'true',
  AUTH_BLACKLIST_FAILURE_MODE: 'fail_open',
  TEMP_FILE_STORAGE: 'local',
  RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS: '3600000',
  RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS: '5',
  HOSTING_INSTANCE_COUNT: '1'
};

describe('hosting profile preflight validator', () => {
  it('accepts a safe shared profile without Redis', () => {
    const result = validateHostingProfile({
      profile: 'shared',
      env: {
        ...baseEnv,
        HOSTING_PROFILE: 'shared'
      }
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects shared profile when Redis is configured', () => {
    const result = validateHostingProfile({
      profile: 'shared',
      env: {
        ...baseEnv,
        HOSTING_PROFILE: 'shared',
        REDIS_URL: 'redis://127.0.0.1:6379'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Shared profile must not set REDIS_URL');
  });

  it('rejects unsafe production defaults and placeholder secrets', () => {
    const result = validateHostingProfile({
      profile: 'shared',
      env: {
        ...baseEnv,
        HOSTING_PROFILE: 'shared',
        DB_AUTO_SYNC: 'true',
        JWT_SECRET: 'CHANGE_THIS_TO_A_STRONG_SECRET_AT_LEAST_32_CHARACTERS_LONG'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DB_AUTO_SYNC must not be true in hosted production profiles');
    expect(result.errors).toContain('JWT_SECRET must not use a placeholder value');
  });

  it('requires Redis and fail-closed blacklist mode for VPS profile', () => {
    const missingRedis = validateHostingProfile({
      profile: 'vps',
      env: {
        ...baseEnv,
        HOSTING_PROFILE: 'vps',
        AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
        TEMP_FILE_STORAGE: 'auto'
      }
    });

    expect(missingRedis.ok).toBe(false);
    expect(missingRedis.errors).toContain('VPS profile requires REDIS_URL');

    const failOpen = validateHostingProfile({
      profile: 'vps',
      env: {
        ...baseEnv,
        HOSTING_PROFILE: 'vps',
        REDIS_URL: 'redis://127.0.0.1:6379',
        TEMP_FILE_STORAGE: 'auto'
      }
    });

    expect(failOpen.ok).toBe(false);
    expect(failOpen.errors).toContain('VPS profile requires AUTH_BLACKLIST_FAILURE_MODE=fail_closed');
  });
});
