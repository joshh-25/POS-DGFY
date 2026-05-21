const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTROL_SCRIPT_FILES,
  getConfig,
  normalizeRemoteDir,
  validateLocalInputs
} = require('./upload-artifacts.js');

const originalEnv = { ...process.env };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-namecheap-upload-'));

try {
  assert.strictEqual(normalizeRemoteDir('/public_html/'), 'public_html');
  assert.throws(() => normalizeRemoteDir('../public_html'), /Invalid FTP_DEPLOY_CONTROL_DIR/);

  for (const scriptName of CONTROL_SCRIPT_FILES) {
    fs.writeFileSync(path.join(tmp, scriptName), '<?php echo "ok";');
  }
  fs.writeFileSync(path.join(tmp, 'backend.zip'), 'zip');

  process.env = {
    ...originalEnv,
    FTP_SERVER: 'ftp.example.com',
    FTP_USERNAME: 'user',
    FTP_PASSWORD: 'pass',
    FTP_DEPLOY_CONTROL_DIR: 'public_html',
    DEPLOY_SCRIPTS_DIR: tmp,
    UPLOAD_BACKEND: 'true',
    BACKEND_ZIP: path.join(tmp, 'backend.zip')
  };

  const cfg = getConfig(process.env);
  assert.strictEqual(cfg.controlDir, 'public_html');
  assert.strictEqual(cfg.artifacts.length, 1);
  validateLocalInputs(cfg);

  process.env.BACKEND_ZIP = path.join(tmp, 'missing.zip');
  assert.throws(() => validateLocalInputs(getConfig(process.env)), /Missing artifact/);

  console.log('upload-artifacts.test.js OK');
} finally {
  process.env = originalEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
}
