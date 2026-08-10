const fs = require('fs');
const path = require('path');
const { validateHostingProfile } = require('../apps/dgfy-api/src/config/productionEnvValidation.cjs');

const parseArgs = (argv) => {
  const args = {
    profile: null,
    envFile: path.join('apps', 'dgfy-api', '.env')
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
