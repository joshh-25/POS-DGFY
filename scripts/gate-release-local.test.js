const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

const { ADVISORY_CI_ENFORCED_GATES } = require('./check-pr-quality-workflow');

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

test('GATE_NAMES has no duplicates and matches the documented count of 17', () => {
  assert.equal(GATE_NAMES.length, 17);
  assert.equal(new Set(GATE_NAMES).size, GATE_NAMES.length);
});

// #1431 Phase D (2026-09-03) closed the original 19-gate mapping at 16 GATE_NAMES, each a
// CI_ENFORCED_GATES entry -- required-locally 0 on a default run. #1278 PR 2 (Phase 298) added a
// 17th, 'release.notes' (ADR 0082 Decision 8), the first gate added after that closure -- same
// shape (delegated, required-locally 0), just not one of the original 19. Pinned directly rather
// than left implicit in the individual delegation tests below.
test('CI_ENFORCED_GATES.size === 17 -- every gate is delegated, required-locally is 0', () => {
  assert.equal(CI_ENFORCED_GATES.size, 17);
  for (const name of GATE_NAMES) {
    assert.equal(CI_ENFORCED_GATES.has(name), true, `${name} must be in CI_ENFORCED_GATES`);
  }
});

test('a default (no-flags) run selects zero required gates', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  const gates = [];
  for (const name of GATE_NAMES) {
    runGate(gates, selection, name, () => true, name);
  }
  const summary = summarizeGates(gates);
  assert.equal(summary.required_gate_count, 0);
  assert.equal(summary.delegated_gate_count, GATE_NAMES.length);
});

test('--include-ci-enforced still runs every gate locally as an escape hatch', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--include-ci-enforced'], GATE_NAMES);
  const gates = [];
  for (const name of GATE_NAMES) {
    runGate(gates, selection, name, () => true, name);
  }
  const summary = summarizeGates(gates);
  assert.equal(summary.delegated_gate_count, 0);
  assert.equal(summary.required_gate_count, GATE_NAMES.length);
});

test('--only still works as an escape hatch for a single delegated gate', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js', '--only', 'runtime.doctor'], GATE_NAMES);
  const gates = [];
  const ranCommand = { called: false };
  runGate(gates, selection, 'runtime.doctor', () => { ranCommand.called = true; return true; }, 'npm run doctor:runtime');
  assert.equal(gates[0].status, 'pass');
  assert.equal(ranCommand.called, true);
});

// #1431 Phase D (2026-09-03) shipped a two-name advisory-exemption allowlist (defined in
// check-pr-quality-workflow.js, since that's where checkCiEnforcedGatesAreBlocking consumes it);
// #1278 PR 2 (Phase 298) added a third, 'release.notes' (ADR 0082 Decision 8) -- pinned here too
// since it's the direct answer to "which of the 17 delegated gates stay advisory."
test('the advisory-exemption set contains exactly dependencies.audit.full, backend.test_matrix, and release.notes', () => {
  assert.deepEqual(new Set(ADVISORY_CI_ENFORCED_GATES), new Set(['dependencies.audit.full', 'backend.test_matrix', 'release.notes']));
  for (const name of ADVISORY_CI_ENFORCED_GATES) {
    assert.equal(CI_ENFORCED_GATES.has(name), true, `${name} must still be delegated (CI_ENFORCED_GATES), just not blocking`);
  }
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

// #1431 Phase D (2026-09-03): all 16 GATE_NAMES are now CI_ENFORCED_GATES entries (required-locally
// is 0), so there is no real gate name left to exercise the "not CI-enforced" path with -- this
// pins shouldDelegate's own behavior directly against a name that simply isn't in the map, which
// is all the function itself ever checks (it does not validate against GATE_NAMES).
test('shouldDelegate: a name absent from CI_ENFORCED_GATES never delegates', () => {
  const selection = resolveGateSelection(['node', 'gate-release-local.js'], GATE_NAMES);
  assert.equal(CI_ENFORCED_GATES.has('not.a.real.gate'), false);
  assert.equal(shouldDelegate('not.a.real.gate', selection), false);
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

// PR #1446 review, RF-1: retiring the release.target_sha *gate* must not also let an unresolvable
// SHA silently produce an "unbound" passing artifact -- outside a git checkout with
// RELEASE_TARGET_SHA also unset, the script must fail fast and loud instead of writing evidence
// under `.tmp/release-gates/undefined/`.
test('main() fails fast when no target SHA can be resolved', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-release-local-nogit-'));
  try {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'gate-release-local.js'), '--only', 'docs.lint'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, RELEASE_TARGET_SHA: '' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not resolve a target SHA/);
    assert.ok(!fs.existsSync(path.join(cwd, '.tmp')), 'must not write an evidence dir when the SHA is unresolvable');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
