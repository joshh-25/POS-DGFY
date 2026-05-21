const fs = require('fs');
const path = require('path');

const VALID_PROFILES = new Set(['shared', 'vps']);
const REQUIRED_KEYS = [
  'NODE_ENV',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'DB_PASSWORD',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'CORS_ORIGIN'
];
const SECRET_KEYS = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
const PLACEHOLDER_PATTERN = /(change[_-]?this|change[_-]?me|replace[_-]?with|placeholder|your[_-]?|example\.com|xxxx)/i;

const parseArgs = (argv) => {
  const args = {
    profile: null,
    envFile: path.join('backend', '.env')
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile') {
      args.profile = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--profile=')) {
      args.profile = arg.slice('--profile='.length);
    } else if (arg === '--env-file') {
      args.envFile = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--env-file=')) {
      args.envFile = arg.slice('--env-file='.length);
    }
  }

  return args;
};

const stripOptionalQuotes = (value) => {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseEnvContent = (content) => {
  const env = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalizedLine = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const equalsIndex = normalizedLine.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = normalizedLine.slice(0, equalsIndex).trim();
    const value = normalizedLine.slice(equalsIndex + 1);
    if (key) {
      env[key] = stripOptionalQuotes(value);
    }
  }
  return env;
};

const readEnvFile = (envFile) => {
  const resolvedPath = path.resolve(process.cwd(), envFile);
  try {
    return {
      exists: true,
      env: parseEnvContent(fs.readFileSync(resolvedPath, 'utf8')),
      path: resolvedPath
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        exists: false,
        env: {},
        path: resolvedPath
      };
    }
    throw error;
  }
};

const hasValue = (env, key) => String(env[key] || '').trim().length > 0;

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const normalizeMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fail-closed') return 'fail_closed';
  if (normalized === 'fail-open') return 'fail_open';
  return normalized;
};

const validateRequiredKeys = (env, errors) => {
  for (const key of REQUIRED_KEYS) {
    if (!hasValue(env, key)) {
      errors.push(`Missing required environment value: ${key}`);
    }
  }
};

const validateSecrets = (env, errors) => {
  for (const key of SECRET_KEYS) {
    const value = String(env[key] || '').trim();
    if (!value) continue;

    if (value.length < 32) {
      errors.push(`${key} must be at least 32 characters long`);
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      errors.push(`${key} must not use a placeholder value`);
    }
  }
};

const validateHostingProfile = ({ profile, env, envFile = null }) => {
  const normalizedProfile = String(profile || '').trim().toLowerCase();
  const errors = [];
  const warnings = [];

  if (!VALID_PROFILES.has(normalizedProfile)) {
    errors.push('Profile must be one of: shared, vps');
    return { ok: false, errors, warnings, profile: normalizedProfile, envFile };
  }

  validateRequiredKeys(env, errors);
  validateSecrets(env, errors);

  const envProfile = String(env.HOSTING_PROFILE || '').trim().toLowerCase();
  if (envProfile && envProfile !== normalizedProfile) {
    errors.push(`HOSTING_PROFILE must be ${normalizedProfile} for this preflight`);
  }

  if (String(env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
    errors.push('NODE_ENV must be production for hosting preflight');
  }

  if (isTruthy(env.DB_AUTO_SYNC)) {
    errors.push('DB_AUTO_SYNC must not be true in hosted production profiles');
  }

  const blacklistMode = normalizeMode(env.AUTH_BLACKLIST_FAILURE_MODE);
  const redisConfigured = hasValue(env, 'REDIS_URL');

  if (normalizedProfile === 'shared') {
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

  if (normalizedProfile === 'vps') {
    if (!redisConfigured) {
      errors.push('VPS profile requires REDIS_URL');
    }
    if (blacklistMode !== 'fail_closed') {
      errors.push('VPS profile requires AUTH_BLACKLIST_FAILURE_MODE=fail_closed');
    }
  }

  if (isTruthy(env.PAYMENTS_ENABLED) && normalizedProfile === 'shared') {
    warnings.push('PAYMENTS_ENABLED=true on shared hosting relies on single-process scheduler assumptions');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    profile: normalizedProfile,
    envFile
  };
};

const runCli = () => {
  const args = parseArgs(process.argv.slice(2));
  const envFile = readEnvFile(args.envFile);
  const env = {
    ...process.env,
    ...envFile.env
  };

  const result = validateHostingProfile({
    profile: args.profile,
    env,
    envFile: envFile.path
  });

  if (!envFile.exists) {
    result.warnings.push(`Env file not found: ${envFile.path}; validating process environment only`);
  }

  for (const warning of result.warnings) {
    console.warn(`[hosting-profile] WARN ${warning}`);
  }

  if (!result.ok) {
    console.error(`[hosting-profile] FAILED profile=${result.profile || 'unknown'} env=${envFile.path}`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[hosting-profile] OK profile=${result.profile} env=${envFile.path}`);
};

if (require.main === module) {
  runCli();
}

module.exports = {
  parseArgs,
  parseEnvContent,
  readEnvFile,
  validateHostingProfile
};
