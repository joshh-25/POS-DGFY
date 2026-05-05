const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

const CONTROL_SCRIPT_FILES = [
  'preflight.php',
  'unzip-backend.php',
  'unzip-frontend.php',
  'rollback-backend.php',
  'rollback-frontend.php',
  'restart-node.php'
];

const ARTIFACTS = [
  { flag: 'UPLOAD_BACKEND', envPath: 'BACKEND_ZIP', defaultPath: 'backend-shared.zip', remoteName: 'backend-shared.zip' },
  { flag: 'UPLOAD_IMS', envPath: 'IMS_ZIP', defaultPath: 'skupervisor.zip', remoteName: 'skupervisor.zip' },
  { flag: 'UPLOAD_POS', envPath: 'POS_ZIP', defaultPath: 'pos.zip', remoteName: 'pos.zip' },
  { flag: 'UPLOAD_STOREFRONT', envPath: 'STOREFRONT_ZIP', defaultPath: 'storefront.zip', remoteName: 'storefront.zip' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const boolEnv = (env, name) => String(env[name] || 'false').trim().toLowerCase() === 'true';

function requiredEnv(env, name) {
  const value = env[name];
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return String(value).trim();
}

function normalizeRemoteDir(value) {
  const trimmed = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed || trimmed.includes('..')) {
    throw new Error(`Invalid FTP_DEPLOY_CONTROL_DIR: ${value}`);
  }
  return trimmed;
}

function getConfig(env = process.env) {
  return {
    host: requiredEnv(env, 'FTP_SERVER'),
    user: requiredEnv(env, 'FTP_USERNAME'),
    password: requiredEnv(env, 'FTP_PASSWORD'),
    controlDir: normalizeRemoteDir(env.FTP_DEPLOY_CONTROL_DIR || 'public_html'),
    scriptsDir: env.DEPLOY_SCRIPTS_DIR || 'deploy-scripts',
    attempts: Number(env.FTP_UPLOAD_ATTEMPTS || 3),
    artifacts: ARTIFACTS
      .filter((artifact) => boolEnv(env, artifact.flag))
      .map((artifact) => ({
        ...artifact,
        localPath: env[artifact.envPath] || artifact.defaultPath
      }))
  };
}

async function connectWithFallback(client, cfg) {
  let lastError = null;
  for (const attempt of [{ secure: true, label: 'FTPS' }, { secure: false, label: 'FTP' }]) {
    try {
      await client.access({
        host: cfg.host,
        user: cfg.user,
        password: cfg.password,
        secure: attempt.secure
      });
      console.log(`FTP_PROTOCOL=${attempt.label}`);
      return;
    } catch (error) {
      lastError = error;
      console.log(`FTP_CONNECT_${attempt.label}_FAILED=${error.message}`);
      try {
        client.close();
      } catch {
        // noop
      }
    }
  }
  throw lastError || new Error('Unable to connect using FTPS or FTP');
}

function validateLocalInputs(cfg) {
  if (cfg.artifacts.length === 0) {
    throw new Error('No upload scope selected');
  }

  for (const artifact of cfg.artifacts) {
    if (!fs.existsSync(artifact.localPath)) {
      throw new Error(`Missing artifact: ${artifact.localPath}`);
    }
  }

  for (const scriptName of CONTROL_SCRIPT_FILES) {
    const scriptPath = path.join(cfg.scriptsDir, scriptName);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Missing rendered deploy script: ${scriptPath}`);
    }
  }
}

async function uploadOnce(cfg) {
  validateLocalInputs(cfg);
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;

  try {
    await connectWithFallback(client, cfg);
    await client.ensureDir(`/${cfg.controlDir}`);
    await client.cd(`/${cfg.controlDir}`);

    for (const artifact of cfg.artifacts) {
      await client.uploadFrom(artifact.localPath, artifact.remoteName);
      console.log(`ARTIFACT_UPLOAD_OK=${artifact.remoteName}`);
    }

    for (const scriptName of CONTROL_SCRIPT_FILES) {
      await client.uploadFrom(path.join(cfg.scriptsDir, scriptName), scriptName);
      try {
        await client.send(`SITE CHMOD 644 ${scriptName}`);
      } catch (error) {
        console.log(`SCRIPT_CHMOD_WARN=${scriptName}:${error.message}`);
      }
      console.log(`SCRIPT_UPLOAD_OK=${scriptName}`);
    }

    console.log(`FTP_UPLOAD_OK=/${cfg.controlDir}`);
  } finally {
    client.close();
  }
}

async function run() {
  const cfg = getConfig();
  let lastError = null;
  for (let attempt = 1; attempt <= cfg.attempts; attempt += 1) {
    try {
      console.log(`FTP_UPLOAD_ATTEMPT=${attempt}`);
      await uploadOnce(cfg);
      return;
    } catch (error) {
      lastError = error;
      console.log(`FTP_UPLOAD_ATTEMPT_FAILED=${attempt}:${error.message}`);
      if (attempt < cfg.attempts) {
        await sleep(attempt * 2000);
      }
    }
  }
  throw lastError || new Error('FTP upload failed');
}

if (require.main === module) {
  run().catch((error) => {
    console.log(`FTP_UPLOAD_FAILED=${error.message || String(error)}`);
    process.exit(1);
  });
}

module.exports = {
  ARTIFACTS,
  CONTROL_SCRIPT_FILES,
  getConfig,
  normalizeRemoteDir,
  validateLocalInputs
};
