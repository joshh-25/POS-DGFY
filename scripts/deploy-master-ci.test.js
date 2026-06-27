const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'deploy-master-ci.sh'), 'utf8');

test('CI deploy wrapper requires exact release SHA and origin/master parity', () => {
  assert.match(script, /Missing RELEASE_TARGET_SHA/);
  assert.match(script, /origin\/\$\{TARGET_BRANCH\} mismatch/);
  assert.match(script, /--expect-commit/);
});

test('CI deploy wrapper does not push, merge, rebase, or allocate a TTY', () => {
  assert.doesNotMatch(script, /git push/);
  assert.doesNotMatch(script, /git merge/);
  assert.doesNotMatch(script, /git rebase/);
  assert.doesNotMatch(script, /ssh\s+-t/);
});
