import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { spawnSync } = require('child_process');
const {
  formatValidationFailure,
  validateProductionEnv
} = require('../src/config/productionEnvValidation.cjs');

const strongSecret = (label) => `${label}_${'a'.repeat(48)}`;

const validProductionEnv = {
  NODE_ENV: 'production',
  HOSTING_PROFILE: 'shared',
  HOSTING_INSTANCE_COUNT: '1',
  DB_HOST: 'localhost',
  DB_USER: 'sku_user',
  DB_NAME: 'sku_inventory',
  DB_PASSWORD: 'database-password-production-like',
  DB_AUTO_SYNC: 'false',
  JWT_SECRET: strongSecret('jwt'),
  REFRESH_TOKEN_SECRET: strongSecret('refresh'),
  SMS_PHONE_HASH_SECRET: strongSecret('sms-phone-hash'),
  CORS_ORIGIN: 'https://skupervisor.dgfy.ph,https://pos.dgfy.ph',
  SESSION_COOKIE_SECURE: 'true',
  AUTH_BLACKLIST_FAILURE_MODE: 'fail_open',
  TEMP_FILE_STORAGE: 'local',
  RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS: '3600000',
  RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS: '5',
  PAYMENTS_ENABLED: 'false',
  ADMIN_USERNAME: 'platform-admin',
  ADMIN_PASSWORD_HASH: `$2b$12$${'a'.repeat(53)}`
};

const childEnvironmentKeys = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT'
];

const buildChildEnvironment = (environment, parentEnvironment = process.env) => {
  const platformEnvironment = Object.fromEntries(
    childEnvironmentKeys
      .filter((key) => parentEnvironment[key] !== undefined)
      .map((key) => [key, parentEnvironment[key]])
  );

  return {
    ...platformEnvironment,
    ...environment
  };
};

const spawnServer = (environment, parentEnvironment = process.env) => spawnSync(
  process.execPath,
  ['src/server.js'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 10000,
    env: buildChildEnvironment(environment, parentEnvironment)
  }
);

const validStartupEnvironment = {
  ...validProductionEnv,
  SKIP_SERVER_START: 'true',
  SENTRY_BACKEND_DSN: 'https://public@example.ingest.sentry.io/123',
  SENTRY_ENABLED: '',
  SENTRY_ENVIRONMENT: ''
};

const expectSentryWarningStartup = (spawned) => {
  const output = `${spawned.stdout}\n${spawned.stderr}`;

  expect(spawned.status).toBe(0);
  expect(output).toContain(
    'A Sentry backend DSN is configured but SENTRY_ENABLED is not true; backend errors will not reach Sentry'
  );
};

const evaluateStartupGuard = (env) => {
  const result = validateProductionEnv({ env });
  return {
    exitCode: result.shouldFail ? 1 : 0,
    message: result.shouldFail ? formatValidationFailure(result) : 'production environment configuration ok',
    result
  };
};

describe('production startup environment guard', () => {
  it('allows startup for a valid shared production profile', () => {
    const guard = evaluateStartupGuard(validProductionEnv);

    expect(guard.exitCode).toBe(0);
    expect(guard.result.ok).toBe(true);
  });

  it('exits non-zero for missing required production values', () => {
    const guard = evaluateStartupGuard({
      ...validProductionEnv,
      DB_NAME: '',
      JWT_SECRET: '',
      CORS_ORIGIN: ''
    });

    expect(guard.exitCode).toBe(1);
    expect(guard.message).toContain('Missing required environment value: DB_NAME');
    expect(guard.message).toContain('Missing required environment value: JWT_SECRET');
    expect(guard.message).toContain('Missing required environment value: CORS_ORIGIN');
  });

  it('logs variable names and validation reasons without values', () => {
    const invalidSecret = 'short-secret-value';
    const guard = evaluateStartupGuard({
      ...validProductionEnv,
      JWT_SECRET: invalidSecret
    });

    expect(guard.exitCode).toBe(1);
    expect(guard.message).toContain('JWT_SECRET must be at least 32 characters long');
    expect(guard.message).not.toContain(invalidSecret);
  });

  it('does not fail startup outside production', () => {
    const guard = evaluateStartupGuard({
      NODE_ENV: 'test',
      JWT_SECRET: ''
    });

    expect(guard.exitCode).toBe(0);
    expect(guard.result.warnings).toContain('Production environment validation is warning-only outside NODE_ENV=production');
  });

  it('server startup exits non-zero before listen when production env is invalid', () => {
    const spawned = spawnServer({
      ...validProductionEnv,
      SKIP_SERVER_START: 'true',
      DB_HOST: ''
    });

    expect(spawned.status).toBe(1);
    expect(`${spawned.stdout}\n${spawned.stderr}`).toContain('Missing required environment value: DB_HOST');
    expect(`${spawned.stdout}\n${spawned.stderr}`).not.toContain('database-password-production-like');
  });

  it('logs production validation warnings during server startup', () => {
    expectSentryWarningStartup(spawnServer(validStartupEnvironment));
  });

  it('does not inherit REDIS_URL from the parent environment for a valid shared startup', () => {
    const parentEnvironment = {
      ...process.env,
      REDIS_URL: 'redis://127.0.0.1:6379'
    };

    expectSentryWarningStartup(
      spawnServer(validStartupEnvironment, parentEnvironment)
    );
  });
});
