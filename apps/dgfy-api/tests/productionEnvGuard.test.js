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

const spawnTimeoutMs = 30000;
const diagnosticOutputTailLength = 2000;

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

const formatSpawnFailureDiagnostics = (spawned) => {
  const formatOutputTail = (output) => {
    const text = String(output ?? '');
    return text ? text.slice(-diagnosticOutputTailLength) : '(empty)';
  };
  const error = spawned.error
    ? `${spawned.error.code ?? 'unknown'}${spawned.error.message ? `: ${spawned.error.message}` : ''}`
    : 'none';

  return [
    'Child process diagnostics:',
    `status: ${String(spawned.status)}`,
    `signal: ${spawned.signal ?? 'none'}`,
    `error: ${error}`,
    `elapsedMs: ${spawned.elapsedMs}`,
    `timeoutMs: ${spawnTimeoutMs}`,
    `stdout (last ${diagnosticOutputTailLength} characters):\n${formatOutputTail(spawned.stdout)}`,
    `stderr (last ${diagnosticOutputTailLength} characters):\n${formatOutputTail(spawned.stderr)}`
  ].join('\n');
};

const withSpawnDiagnostics = (spawned, assertions) => {
  try {
    assertions();
  } catch (error) {
    const assertionError = error instanceof Error ? error : new Error(String(error));
    assertionError.message = `${assertionError.message}\n\n${formatSpawnFailureDiagnostics(spawned)}`;
    throw assertionError;
  }
};

const spawnServer = (environment, parentEnvironment = process.env) => {
  const startedAt = Date.now();
  const spawned = spawnSync(
    process.execPath,
    ['src/server.js'],
    {
      cwd: process.cwd(),
      // #2618 / run 39283210177: a spawn took 16.8 s on a shared self-hosted runner.
      timeout: spawnTimeoutMs,
      env: buildChildEnvironment(environment, parentEnvironment)
    }
  );
  const elapsedMs = Date.now() - startedAt;

  process.stdout.write(`[productionEnvGuard] child spawn completed in ${elapsedMs} ms (status: ${spawned.status})\n`);

  return {
    ...spawned,
    elapsedMs
  };
};

const validStartupEnvironment = {
  ...validProductionEnv,
  SKIP_SERVER_START: 'true',
  SENTRY_BACKEND_DSN: 'https://public@example.ingest.sentry.io/123',
  SENTRY_ENABLED: '',
  SENTRY_ENVIRONMENT: ''
};

const expectSentryWarningStartup = (spawned) => {
  const output = `${spawned.stdout}\n${spawned.stderr}`;

  withSpawnDiagnostics(spawned, () => {
    expect(spawned.status).toBe(0);
    expect(output).toContain(
      'A Sentry backend DSN is configured but SENTRY_ENABLED is not true; backend errors will not reach Sentry'
    );
  });
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

  it('formats child process failure diagnostics with output tails', () => {
    const diagnostics = formatSpawnFailureDiagnostics({
      status: null,
      signal: 'SIGTERM',
      error: {
        code: 'ETIMEDOUT',
        message: 'spawnSync timed out'
      },
      stdout: 'startup stdout tail',
      stderr: 'startup stderr tail',
      elapsedMs: 16834
    });

    expect(diagnostics).toContain('status: null');
    expect(diagnostics).toContain('signal: SIGTERM');
    expect(diagnostics).toContain('error: ETIMEDOUT: spawnSync timed out');
    expect(diagnostics).toContain(`elapsedMs: 16834`);
    expect(diagnostics).toContain(`timeoutMs: ${spawnTimeoutMs}`);
    expect(diagnostics).toContain('startup stdout tail');
    expect(diagnostics).toContain('startup stderr tail');
  });

  it('does not pass REDIS_URL from the parent into the child environment', () => {
    const childEnvironment = buildChildEnvironment(validStartupEnvironment, {
      ...process.env,
      REDIS_URL: 'redis://127.0.0.1:6379'
    });

    expect(childEnvironment).not.toHaveProperty('REDIS_URL');
  });

  it('server startup exits non-zero before listen when production env is invalid', () => {
    const spawned = spawnServer({
      ...validProductionEnv,
      SKIP_SERVER_START: 'true',
      DB_HOST: ''
    });

    withSpawnDiagnostics(spawned, () => {
      expect(spawned.status).toBe(1);
      expect(`${spawned.stdout}\n${spawned.stderr}`).toContain('Missing required environment value: DB_HOST');
      expect(`${spawned.stdout}\n${spawned.stderr}`).not.toContain('database-password-production-like');
    });
  }, 60000);

  it('logs production validation warnings during server startup', () => {
    expectSentryWarningStartup(spawnServer(validStartupEnvironment));
  }, 60000);

  it('does not inherit REDIS_URL from the parent environment for a valid shared startup', () => {
    const parentEnvironment = {
      ...process.env,
      REDIS_URL: 'redis://127.0.0.1:6379'
    };

    expectSentryWarningStartup(
      spawnServer(validStartupEnvironment, parentEnvironment)
    );
  }, 60000);
});
