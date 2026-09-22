const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const agent = require('./run-testing-agent');

test('parses full and focused scopes', () => {
  assert.equal(agent.parseArgs([]).scope, 'full');
  const focused = agent.parseArgs(['--only', 'backend.test_matrix', '--scope', 'focused']);
  assert.deepEqual(focused.only, ['backend.test_matrix']);
  assert.equal(focused.scope, 'focused');
});

test('rejects an unsafe database name', () => {
  assert.throws(() => agent.assertTestDatabase('sku_inventory_manager'), /refusing non-test database/);
});

test('rejects insufficient resources with an actionable reason', () => {
  assert.throws(() => agent.checkResources({ cpus: 1, memoryGiB: 2 }, { minCpu: 2, minMemoryGiB: 5 }), /CPU 1.*memory/);
});

test('builds the full command with CI-enforced gates and focused commands without it', () => {
  assert.deepEqual(agent.buildGateArgs(agent.parseArgs([])), ['run', 'gate:release:local', '--', '--include-ci-enforced']);
  assert.deepEqual(agent.buildGateArgs(agent.parseArgs(['--only', 'backend.test_matrix'])), ['run', 'gate:release:local', '--', '--only', 'backend.test_matrix']);
});

test('scratch cleanup is performed for both success and failure paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testing-agent-test-'));
  const scratch = path.join(root, 'scratch');
  fs.mkdirSync(scratch);
  agent.removeScratch(scratch);
  assert.equal(fs.existsSync(scratch), false);
  fs.mkdirSync(scratch);
  agent.removeScratch(scratch, (value) => fs.rmSync(value, { recursive: true, force: true }));
  assert.equal(fs.existsSync(scratch), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('copies only evidence and renders SHA-bound summary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testing-agent-test-'));
  const scratch = path.join(root, 'scratch');
  fs.mkdirSync(path.join(scratch, '.tmp', 'release-gates', 'abc'), { recursive: true });
  fs.writeFileSync(path.join(scratch, '.tmp', 'release-gates', 'abc', 'local_readiness.json'), '{}');
  const calls = [];
  agent.copyEvidence(scratch, root, (command, args) => { calls.push([command, args]); return { status: 0 }; });
  assert.equal(calls[0][0], 'rsync');
  const summary = agent.renderSummary({ targetSha: 'abc', options: agent.parseArgs([]), result: { status: 2 }, artifact: { verdict: 'fail', gates: [{ status: 'fail' }] } });
  assert.match(summary, /Target SHA: `abc`/);
  assert.match(summary, /FAIL\/UNRUNNABLE/);
  assert.match(summary, /Not reproduced locally/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('container environment is test-only and SHA-bound', () => {
  const env = agent.containerEnvironment(agent.parseArgs([]), 'a'.repeat(40));
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.DB_NAME, 'sku_inventory_manager_test');
  assert.equal(env.RELEASE_TARGET_SHA, 'a'.repeat(40));
  assert.match(env.REDIS_URL, /dgfy-redis-test/);
});
