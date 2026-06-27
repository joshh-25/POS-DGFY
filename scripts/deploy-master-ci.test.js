const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'deploy-master-ci.sh'), 'utf8');

test('CI deploy wrapper requires exact release SHA and origin/master parity', () => {
  assert.match(script, /Missing RELEASE_TARGET_SHA/);
  assert.match(script, /origin\/\$\{TARGET_BRANCH\} mismatch/);
  assert.match(script, /--expect-commit/);
  assert.match(script, /validate:batch-inventory/);
  assert.match(script, /check:qa-target-proof/);
});

test('CI deploy wrapper does not push, merge, rebase, or allocate a TTY', () => {
  assert.doesNotMatch(script, /git push/);
  assert.doesNotMatch(script, /git merge/);
  assert.doesNotMatch(script, /git rebase/);
  assert.doesNotMatch(script, /ssh\s+-t/);
});

test('CI deploy wrapper supports dry-run before live enablement and writes proof plan', () => {
  assert.match(script, /PRODUCTION_DEPLOY_DRY_RUN/);
  assert.match(script, /deploy_ci_plan\.json/);
  assert.match(script, /Dry-run mode enabled/);
});

test('CI deploy wrapper collects production proof and runs deployed-change accuracy review', () => {
  assert.match(script, /production_proof\.txt/);
  assert.match(script, /production_contract\.json/);
  assert.match(script, /frontend_build_manifest\.json/);
  assert.match(script, /review:deployed-change-accuracy/);
});
