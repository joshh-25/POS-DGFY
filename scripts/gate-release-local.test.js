const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GATE_NAMES,
  CI_ENFORCED_GATES,
  GateSelectionError,
  resolveGateSelection,
  isSelected,
  shouldDelegate,
  runGate,
  summarizeGates,
} = require('./gate-release-local');

// #1021 review, RF-1: an unknown --only gate name previously resolved to an empty selection,
// which meant every gate was skipped, the run exited 0, and the artifact still said
// verdict: "pass" -- a misspelled selection silently looked successful. These smoke tests pin
// both the valid single-gate case and the invalid/empty rejections that fix that.

test('resolveGateSelection accepts a valid single --only gate', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--only', 'docs.lint'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: ['docs.lint'], skipGates: [], includeCiEnforced: false });
  assert.equal(isSelected(selection, 'docs.lint'), true);
  assert.equal(isSelected(selection, 'architecture.guardrails'), false);
});

test('resolveGateSelection accepts a valid --skip list', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--skip', 'backend.test_matrix,frontend.budgets'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: [], skipGates: ['backend.test_matrix', 'frontend.budgets'], includeCiEnforced: false });
  assert.equal(isSelected(selection, 'backend.test_matrix'), false);
  assert.equal(isSelected(selection, 'docs.lint'), true);
});

test('resolveGateSelection returns an unfiltered selection when neither flag is passed', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: [], skipGates: [], includeCiEnforced: false });
  for (const name of GATE_NAMES) assert.equal(isSelected(selection, name), true);
});

test('resolveGateSelection sets includeCiEnforced when --include-ci-enforced is passed', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--include-ci-enforced'], GATE_NAMES);
  assert.deepEqual(selection, { onlyGates: [], skipGates: [], includeCiEnforced: true });
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

test('GATE_NAMES has no duplicates and matches the documented count of 16', () => {
  assert.equal(GATE_NAMES.length, 16);
  assert.equal(new Set(GATE_NAMES).size, GATE_NAMES.length);
});

test('retired gates stay retired (#1431 Phase 3)', () => {
  for (const retired of ['release.target_sha', 'observability.evidence.report', 'release.verdict.contract']) {
    assert.ok(!GATE_NAMES.includes(retired), `${retired} was retired and must not be re-added`);
  }
});

// #1431 Phase 1 PR-B: CI_ENFORCED_GATES delegation. These pin shouldDelegate's precedence
// (--skip wins over delegation, --only wins over delegation, --include-ci-enforced runs every
// CI-enforced gate) and the artifact-shape counters gate-release-local.js writes, via the pure
// summarizeGates helper -- exported specifically so these assertions don't have to spawn the real
// script and run real gates (per the plan's own note on this).

test('shouldDelegate: a CI-enforced gate delegates on a default (unfiltered) selection', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  assert.equal(shouldDelegate('docs.lint', selection), true);
  assert.equal(CI_ENFORCED_GATES.has('docs.lint'), true);
});

test('shouldDelegate: a non-CI-enforced gate never delegates', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  assert.equal(CI_ENFORCED_GATES.has('runtime.doctor'), false);
  assert.equal(shouldDelegate('runtime.doctor', selection), false);
});

test('shouldDelegate: --only naming a CI-enforced gate runs it instead of delegating (explicit request wins)', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--only', 'docs.lint'], GATE_NAMES);
  assert.equal(shouldDelegate('docs.lint', selection), false);
});

test('shouldDelegate: --include-ci-enforced runs every CI-enforced gate instead of delegating', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--include-ci-enforced'], GATE_NAMES);
  for (const name of CI_ENFORCED_GATES.keys()) {
    assert.equal(shouldDelegate(name, selection), false);
  }
});

test('runGate: --skip wins over delegation -- a skipped CI-enforced gate reports "skipped", not "delegated_to_ci"', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--skip', 'docs.lint'], GATE_NAMES);
  const gates = [];
  const ranCommand = { called: false };
  runGate(gates, selection, 'docs.lint', () => { ranCommand.called = true; return true; }, 'npm run lint:docs');
  assert.equal(gates[0].status, 'skipped');
  assert.equal(ranCommand.called, false);
});

test('runGate: a default-selection CI-enforced gate reports "delegated_to_ci" and never runs its command', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  const gates = [];
  const ranCommand = { called: false };
  runGate(gates, selection, 'docs.lint', () => { ranCommand.called = true; return true; }, 'npm run lint:docs');
  assert.equal(gates[0].status, 'delegated_to_ci');
  assert.equal(gates[0].ok, true);
  assert.equal(gates[0].duration_ms, 0);
  assert.equal(ranCommand.called, false);
});

test('runGate: --only docs.lint actually runs docs.lint rather than delegating it', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--only', 'docs.lint'], GATE_NAMES);
  const gates = [];
  const ranCommand = { called: false };
  runGate(gates, selection, 'docs.lint', () => { ranCommand.called = true; return true; }, 'npm run lint:docs');
  assert.equal(gates[0].status, 'pass');
  assert.equal(ranCommand.called, true);
});

test('summarizeGates: required + delegated + skipped counters partition gate_count on a default (delegating) run', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  const gates = [];
  for (const name of GATE_NAMES) {
    runGate(gates, selection, name, () => true, name);
  }
  const summary = summarizeGates(gates);
  assert.equal(summary.gate_count, GATE_NAMES.length);
  assert.equal(summary.delegated_gate_count, CI_ENFORCED_GATES.size);
  assert.equal(summary.skipped_gate_count, 0);
  assert.equal(summary.required_gate_count, GATE_NAMES.length - CI_ENFORCED_GATES.size);
  assert.equal(summary.failed_gate_count, 0);
  assert.equal(summary.verdict, 'pass');
});

// run_mode itself is computed inline in main() from `onlyGates.length > 0 || skipGates.length > 0`
// (isPartialRun) -- not a separate exported function -- so this pins the same expression directly
// against resolveGateSelection's output rather than re-deriving it, to guard the highest-risk line
// in this change: delegation alone must never flip a default run's run_mode to "partial" (it would
// make every default run uncitable and unsatisfy ADR 0074 Decision 7's `run_mode: "full"`
// precondition).
test('run_mode stays "full" on a default (delegating, --only/--skip absent) selection', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  const isPartialRun = selection.onlyGates.length > 0 || selection.skipGates.length > 0;
  assert.equal(isPartialRun, false);
});
