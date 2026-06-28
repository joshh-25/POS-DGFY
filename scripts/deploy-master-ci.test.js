const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'deploy-master-ci.sh'), 'utf8');
const remote = fs.readFileSync(path.join(__dirname, 'deploy-remote.sh'), 'utf8');

test('candidate wrapper requires exact master SHA and reviewed inventory', () => {
  assert.match(script, /origin\/\$\{TARGET_BRANCH\} mismatch/);
  assert.match(script, /BATCH_REVIEWED_MANIFEST is required/);
  assert.match(script, /--reviewed-manifest/);
  assert.match(script, /--require-ship/);
});

test('candidate wrapper cannot perform live production mutation', () => {
  assert.match(script, /Live production deployment from candidate code is disabled/);
  assert.doesNotMatch(script, /\nssh\s/);
  assert.doesNotMatch(script, /\nscp\s/);
  assert.match(script, /"production_mutation": false/);
});

test('legacy local remote deployment is disabled', () => {
  assert.match(remote, /Direct local production deployment is disabled/);
  assert.match(remote, /exit 1/);
});

test('GitHub production workflow contains no production secrets or live deploy command', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy-production.yml'), 'utf8');
  assert.match(workflow, /ENABLE_AUTO_PRODUCTION_DEPLOY: '0'/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /deploy:prod:ci/);
  assert.match(workflow, /production_deploy_enabled.*false/);
});
