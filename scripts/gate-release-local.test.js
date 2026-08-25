const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GATE_NAMES,
  GateSelectionError,
  resolveGateSelection,
  isSelected,
} = require('./gate-release-local');

// #1021 review, RF-1: an unknown --only gate name previously resolved to an empty selection,
// which meant every gate was skipped, the run exited 0, and the artifact still said
// verdict: "pass" -- a misspelled selection silently looked successful. These smoke tests pin
// both the valid single-gate case and the invalid/empty rejections that fix that.

test('resolveGateSelection accepts a valid single --only gate', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--only', 'release.target_sha'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: ['release.target_sha'], skipGates: [] });
  assert.equal(isSelected(selection, 'release.target_sha'), true);
  assert.equal(isSelected(selection, 'docs.lint'), false);
});

test('resolveGateSelection accepts a valid --skip list', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--skip', 'backend.test_matrix,frontend.budgets'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: [], skipGates: ['backend.test_matrix', 'frontend.budgets'] });
  assert.equal(isSelected(selection, 'backend.test_matrix'), false);
  assert.equal(isSelected(selection, 'docs.lint'), true);
});

test('resolveGateSelection returns an unfiltered selection when neither flag is passed', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: [], skipGates: [] });
  for (const name of GATE_NAMES) assert.equal(isSelected(selection, name), true);
});

test('resolveGateSelection rejects an unknown --only gate name instead of silently skipping everything', () => {
  assert.throws(
    () => resolveGateSelection(['node', 'gate-release-local.js', '--only', 'not.a.gate'], GATE_NAMES),
    (error) => error instanceof GateSelectionError
      && /unknown gate name/i.test(error.message)
      && error.invalidNames.includes('not.a.gate')
  );
});

test('resolveGateSelection rejects an unknown --skip gate name', () => {
  assert.throws(
    () => resolveGateSelection(['node', 'gate-release-local.js', '--skip', 'docs.lint,not.a.gate'], GATE_NAMES),
    (error) => error instanceof GateSelectionError
      && error.invalidNames.includes('not.a.gate')
      && !error.invalidNames.includes('docs.lint')
  );
});

test('resolveGateSelection rejects --only passed with no gate names', () => {
  assert.throws(
    () => resolveGateSelection(['node', 'gate-release-local.js', '--only'], GATE_NAMES),
    (error) => error instanceof GateSelectionError && /no gate name/i.test(error.message)
  );
});

test('resolveGateSelection rejects --skip passed with no gate names', () => {
  assert.throws(
    () => resolveGateSelection(['node', 'gate-release-local.js', '--skip', ''], GATE_NAMES),
    (error) => error instanceof GateSelectionError && /no gate name/i.test(error.message)
  );
});

test('GATE_NAMES has no duplicates and matches the documented count of 19', () => {
  assert.equal(GATE_NAMES.length, 19);
  assert.equal(new Set(GATE_NAMES).size, GATE_NAMES.length);
});
