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
  assert.match(script, /check:regression-risk/);
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

// The 4th test here used to assert deploy-production.yml ("Production
// Candidate Bundle") contained no production secrets or live deploy
// command. That workflow was deleted 2026-08-14 (#417) as dead weight: it
// checked out `ref: master`, a branch that doesn't exist in this
// repository, so dispatching it would have failed immediately at the
// SHA-resolution step regardless (see #339's finding). The safety property
// it asserted is still real for deploy-main.yml and deploy.yml -- both are
// covered by their own test coverage instead, not by this file.
