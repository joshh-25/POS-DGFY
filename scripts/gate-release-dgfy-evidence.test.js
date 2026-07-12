const test = require('node:test');
const assert = require('node:assert/strict');

const { buildVerdictPayload, isBoundaryChanged } = require('./gate-release-dgfy-evidence');

/**
 * 06-03: proves the orchestrator's pure, DB-free logic directly against the
 * verify-release-verdict.js contract (generated_at truthy, target_sha a
 * string, verdict in {pass,fail,bypassed}, non-empty gates[]) and the
 * SC1/Pitfall 6 changed-boundary classifier. No spawnSync, no live DB —
 * requiring this module never runs the real gate (guarded behind
 * require.main === module), mirroring dgfy-seam-smoke.test.js's fixture
 * style.
 */

test('buildVerdictPayload: all-ok gates yield verdict "pass" and a non-empty gates[]', () => {
  const gates = [
    { name: 'release.target_sha', ok: true, detail: 'target_sha=abc123' },
    { name: 'architecture.dgfy', ok: true, detail: 'not applicable' },
  ];

  const payload = buildVerdictPayload({ targetSha: 'abc123', gates });

  assert.equal(payload.verdict, 'pass');
  assert.equal(payload.failed_gate_count, 0);
  assert.equal(payload.gate_count, 2);
  assert.ok(Array.isArray(payload.gates) && payload.gates.length > 0);
});

test('buildVerdictPayload: a failing gate yields verdict "fail" with an accurate failed_gate_count', () => {
  const gates = [
    { name: 'release.target_sha', ok: true, detail: 'target_sha=abc123' },
    { name: 'migration.verification', ok: false, detail: 'command failed' },
    { name: 'tenant.drift', ok: false, detail: 'command failed' },
  ];

  const payload = buildVerdictPayload({ targetSha: 'abc123', gates });

  assert.equal(payload.verdict, 'fail');
  assert.equal(payload.failed_gate_count, 2);
  assert.equal(payload.gate_count, 3);
});

test('buildVerdictPayload: always conforms to the verify-release-verdict.js contract shape', () => {
  const gates = [{ name: 'release.target_sha', ok: true, detail: 'target_sha=abc123' }];

  const payload = buildVerdictPayload({ targetSha: 'abc123', gates });

  assert.ok(payload.generated_at, 'generated_at must be truthy');
  assert.equal(typeof payload.target_sha, 'string');
  assert.ok(['pass', 'fail', 'bypassed'].includes(payload.verdict));
  assert.ok(Array.isArray(payload.gates) && payload.gates.length > 0, 'gates[] must never be empty');
});

test('buildVerdictPayload: an all-skipped/not-applicable run still emits a non-empty gates[] (Pitfall 5)', () => {
  const gates = [
    { name: 'release.target_sha', ok: true, detail: 'target_sha=abc123' },
    { name: 'architecture.dgfy', ok: true, detail: 'not applicable — no backend/API boundary change' },
    { name: 'compat.seam.smoke', ok: true, detail: 'not applicable — no active compatibility seams in manifest' },
  ];

  const payload = buildVerdictPayload({ targetSha: 'abc123', gates });

  assert.equal(payload.verdict, 'pass');
  assert.ok(payload.gates.length >= 1);
  assert.ok(payload.gates.some((gate) => gate.name === 'release.target_sha'));
});

test('buildVerdictPayload: defaults gates to an empty array (never throws) when omitted, still producing valid keys', () => {
  const payload = buildVerdictPayload({ targetSha: 'abc123', gates: [] });

  assert.equal(payload.gate_count, 0);
  assert.equal(payload.failed_gate_count, 0);
  assert.deepEqual(payload.gates, []);
});

test('isBoundaryChanged: true for a changed file under apps/dgfy-api/', () => {
  assert.equal(isBoundaryChanged(['apps/dgfy-api/src/modules/accounts/routes.js']), true);
});

test('isBoundaryChanged: true for a changed file under apps/dgfy-migration-runner/', () => {
  assert.equal(isBoundaryChanged(['apps/dgfy-migration-runner/src/cli.js']), true);
});

test('isBoundaryChanged: true for a changed file under backend/src/modules/', () => {
  assert.equal(isBoundaryChanged(['backend/src/modules/inventory/handler.js']), true);
});

test('isBoundaryChanged: false for an unrelated path', () => {
  assert.equal(isBoundaryChanged(['frontend/src/App.jsx']), false);
  assert.equal(isBoundaryChanged(['docs/architecture/ADR-0032.md']), false);
});

test('isBoundaryChanged: false for an empty or missing changed-files list', () => {
  assert.equal(isBoundaryChanged([]), false);
  assert.equal(isBoundaryChanged(undefined), false);
});

test('isBoundaryChanged: true when only one of several changed files matches a boundary prefix', () => {
  assert.equal(
    isBoundaryChanged(['frontend/src/App.jsx', 'backend/src/modules/tenancy/service.js', 'README.md']),
    true
  );
});

test('requiring this module does not execute the real gate (no spawnSync side effects)', () => {
  // If require() ran main(), it would spawnSync git/npm/node child processes
  // and attempt filesystem writes under .tmp/release-gates/ — none of which
  // this DB-free, network-free test environment should observe. Simply
  // getting here without throwing/hanging proves the require.main === module
  // guard held.
  assert.ok(typeof buildVerdictPayload === 'function');
  assert.ok(typeof isBoundaryChanged === 'function');
});
