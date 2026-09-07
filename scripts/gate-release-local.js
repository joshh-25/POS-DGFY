#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const npmCmd = 'npm';

// The full, ordered set of gate names this script can run. This is also the source of truth
// --only/--skip validate against (#1021 review, RF-1) -- a misspelled gate name must fail loudly,
// not silently skip every gate and write a passing artifact.
const GATE_NAMES = [
  'dependencies.audit.prod',
  'dependencies.audit.full',
  'docs.lint',
  'architecture.guardrails',
  'compliance.contracts',
  'production.env.fixtures',
  'runtime.doctor',
  'backend.lint',
  'backend.test_matrix',
  'frontend.ims.lint',
  'frontend.pos.lint',
  'frontend.storefront.lint',
  'frontend.contracts',
  'frontend.storefront.contracts',
  'frontend.budgets',
  'scroll.contracts',
  // ADR 0082 Decision 8 / #1278 PR 2 (Phase 298) -- the first gate added after #1431 Phase C/D
  // closed the original 19-gate mapping. Structurally cannot fail outside a release/*->main head
  // (see STRUCTURALLY_CANNOT_FAIL below), same shape as compliance.contracts above.
  'release.notes',
];

// Gates that are structurally incapable of failing on a clean promotion checkout -- flagged so a
// green result here is never cited as evidence of anything (#1016). `release.target_sha`,
// `observability.evidence.report` and `release.verdict.contract` were retired outright (#1431
// Phase 3, Phase 250) rather than kept as green-but-uncitable rows -- see
// docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md's "Retired gates -- closed resolutions".
const STRUCTURALLY_CANNOT_FAIL = new Set([
  'compliance.contracts', // no compliance-relevant diff on a clean checkout -> nothing to flag
  'release.notes', // head branch isn't release/<candidate_id>-rN outside a real promotion -> not applicable
]);

// Gates whose identical command runs as a BLOCKING step in promotion-quality-gate.yml on the
// release/*->main leg since #1431 Phase 1 PR-A (PR #1435, merge commit 1130564e6). Each entry
// names the job and step id that enforces it. scripts/check-pr-quality-workflow.js asserts every
// step id below is still in that file's BLOCKING_STEP_IDS -- a gate cannot be dropped locally
// and silently regain continue-on-error in CI without failing that checker.
//
// #1431 Phase C/D (2026-09-03), evidence-backed re-arm: all 9 remaining gates join this map,
// bringing required-locally to zero. `dependencies.audit.full` and `backend.test_matrix` are the
// two deliberate exceptions -- their step in promotion-quality-gate.yml stays advisory
// (`continue-on-error: true`) on purpose, so they have no corresponding entry in that file's
// BLOCKING_STEP_IDS. check-pr-quality-workflow.js's checkCiEnforcedGatesAreBlocking() carries a
// narrow ADVISORY_CI_ENFORCED_GATES allowlist naming exactly these two -- every other entry below
// must have real blocking coverage or that check fails loudly. See
// docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md for the Phase A run-ID evidence behind each one.
const CI_ENFORCED_GATES = new Map([
  // #1690: 'repository-quality' split into 3 concern-based jobs -- the 6 entries below that used
  // to name it now name whichever of the 3 new jobs actually carries that step. See
  // docs/ops/RELEASE_CANDIDATE_POLICY.md's matching 2026-09-07 amendment.
  ['dependencies.audit.prod',        { job: 'repository-dependency-quality', steps: ['run_dependency_audit_prod'] }],
  // Permanently advisory in CI (registry-dependent, findings never ship) -- see the
  // ADVISORY_CI_ENFORCED_GATES comment in check-pr-quality-workflow.js.
  ['dependencies.audit.full',        { job: 'repository-dependency-quality', steps: ['run_dependency_audit_full'] }],
  ['docs.lint',                      { job: 'repository-docs-quality',       steps: ['run_docs_lint'] }],
  ['architecture.guardrails',        { job: 'dgfy-api-quality',            steps: ['enforce_arch_guardrails', 'enforce_controller_boundaries'] }],
  ['compliance.contracts',           { job: 'repository-dependency-quality', steps: ['run_compliance_contracts'] }],
  ['production.env.fixtures',        { job: 'repository-dependency-quality', steps: ['run_production_env_fixtures'] }],
  ['runtime.doctor',                 { job: 'dgfy-api-quality',            steps: ['run_runtime_doctor'] }],
  ['backend.lint',                   { job: 'dgfy-api-quality',            steps: ['run_api_lint'] }],
  // Temporarily advisory in CI, pending #1015/#925/fixture-rot fixes (tracked: #1469) -- see the
  // ADVISORY_CI_ENFORCED_GATES comment in check-pr-quality-workflow.js.
  ['backend.test_matrix',            { job: 'dgfy-api-quality',            steps: ['run_test_matrix'] }],
  ['frontend.ims.lint',              { job: 'frontend-ims-quality',        steps: ['run_ims_lint'] }],
  ['frontend.pos.lint',              { job: 'frontend-pos-quality',        steps: ['run_pos_lint'] }],
  ['frontend.storefront.lint',       { job: 'frontend-storefront-quality', steps: ['run_storefront_lint'] }],
  ['frontend.contracts',             { job: 'frontend-ims-quality',        steps: ['run_shared_fnb_contract_tests'] }],
  ['frontend.storefront.contracts',  { job: 'frontend-storefront-quality', steps: ['run_storefront_vitest'] }], // CI superset: unfiltered `npx vitest run`
  ['frontend.budgets',               { job: 'frontend-budgets-quality',    steps: ['check_frontend_budgets'] }],
  ['scroll.contracts',               { job: 'frontend-ims-quality',        steps: ['run_scroll_contracts'] }],
  // ADR 0082 Decision 8 / #1278 PR 2 (Phase 298): advisory on first landing by deliberate rollout
  // design (mirroring check:app-versions' own advisory-to-blocking rollout, ADR 0081 Decision 9),
  // not a prerequisite/flake exception like the two entries above -- see the
  // ADVISORY_CI_ENFORCED_GATES comment in check-pr-quality-workflow.js. Flips blocking only in a
  // dedicated later phase, once clean-run evidence exists (ADR 0082 Follow-up 1).
  ['release.notes',                  { job: 'repository-docs-quality',       steps: ['run_release_notes'] }],
]);

class GateSelectionError extends Error {
  constructor(message, invalidNames = []) {
    super(message);
    this.name = 'GateSelectionError';
    this.invalidNames = invalidNames;
  }
}

function runCommand(command, args) {
  return () => {
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
    if (result.error) {
      console.error(`[gate:release:local] command failed to launch: ${command} ${args.join(' ')}`);
      console.error(result.error.message);
      return false;
    }
    return result.status === 0;
  };
}

function captureStdout(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) return '';
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function parseCsvArg(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0) return null; // flag not passed at all
  const value = argv[index + 1] || '';
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

// Validates --only/--skip against the full gate-name list. Throws GateSelectionError -- never
// returns a selection that would silently skip everything and write verdict: "pass" (#1021
// review, RF-1: `--only not.a.gate` previously exited 0 with all 19 gates skipped).
function resolveGateSelection(argv, gateNames) {
  const onlyRaw = parseCsvArg(argv, '--only');
  const skipRaw = parseCsvArg(argv, '--skip');
  const onlyGates = onlyRaw || [];
  const skipGates = skipRaw || [];
  const includeCiEnforced = argv.includes('--include-ci-enforced');

  if (onlyRaw !== null && onlyGates.length === 0) {
    throw new GateSelectionError('--only was passed with no gate name(s).');
  }
  if (skipRaw !== null && skipGates.length === 0) {
    throw new GateSelectionError('--skip was passed with no gate name(s).');
  }

  const invalidOnly = onlyGates.filter((name) => !gateNames.includes(name));
  if (invalidOnly.length > 0) {
    throw new GateSelectionError(`--only contains unknown gate name(s): ${invalidOnly.join(', ')}`, invalidOnly);
  }
  const invalidSkip = skipGates.filter((name) => !gateNames.includes(name));
  if (invalidSkip.length > 0) {
    throw new GateSelectionError(`--skip contains unknown gate name(s): ${invalidSkip.join(', ')}`, invalidSkip);
  }

  return { onlyGates, skipGates, includeCiEnforced };
}

function isSelected(selection, name) {
  if (selection.onlyGates.length > 0) return selection.onlyGates.includes(name);
  if (selection.skipGates.length > 0) return !selection.skipGates.includes(name);
  return true;
}

// A CI-enforced gate delegates to promotion-quality-gate.yml (does not run locally) unless the
// caller opted in via --include-ci-enforced, or explicitly named it with --only -- an explicit
// --only naming a delegated gate is an explicit request to run it, not a request to see it
// reported as delegated (#1431 Phase 1 PR-B).
function shouldDelegate(name, selection) {
  return CI_ENFORCED_GATES.has(name) && !selection.includeCiEnforced && !selection.onlyGates.includes(name);
}

// commandFn is a zero-arg thunk so a skipped gate never launches its command (#1016) -- previously
// every gate's command ran eagerly as an addGate() argument regardless of any filter.
function runGate(gates, selection, name, commandFn, detail) {
  const structurallyCannotFail = STRUCTURALLY_CANNOT_FAIL.has(name);
  if (!isSelected(selection, name)) {
    gates.push({ name, ok: true, status: 'skipped', detail, duration_ms: 0, structurally_cannot_fail: structurallyCannotFail });
    console.log(`[SKIP] ${name} :: ${detail}`);
    return true;
  }
  if (shouldDelegate(name, selection)) {
    const enforcement = CI_ENFORCED_GATES.get(name);
    gates.push({ name, ok: true, status: 'delegated_to_ci', detail, duration_ms: 0, structurally_cannot_fail: structurallyCannotFail });
    console.log(`[CI] ${name} :: enforced by promotion-quality-gate.yml / ${enforcement.job} / ${enforcement.steps.join('+')}`);
    return true;
  }
  const startedAt = Date.now();
  const ok = commandFn();
  const durationMs = Date.now() - startedAt;
  const status = ok ? 'pass' : 'fail';
  gates.push({ name, ok, status, detail, duration_ms: durationMs, structurally_cannot_fail: structurallyCannotFail });
  console.log(`[${status.toUpperCase()}] ${name} :: ${detail} (duration_ms=${durationMs})`);
  return ok;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// Pure counter rollup over an already-run `gates` array -- exported so tests can assert artifact
// shape (required/delegated/skipped counts) without spawning the real script and running real
// gates (#1431 Phase 1 PR-B).
function summarizeGates(gates) {
  const failed = gates.filter((gate) => !gate.ok);
  const skipped = gates.filter((gate) => gate.status === 'skipped');
  const delegated = gates.filter((gate) => gate.status === 'delegated_to_ci');
  const required = gates.filter((gate) => gate.status !== 'delegated_to_ci' && gate.status !== 'skipped');
  return {
    verdict: failed.length === 0 ? 'pass' : 'fail',
    gate_count: gates.length,
    failed_gate_count: failed.length,
    skipped_gate_count: skipped.length,
    delegated_gate_count: delegated.length,
    required_gate_count: required.length,
  };
}

function main() {
  let selection;
  try {
    selection = resolveGateSelection(process.argv, GATE_NAMES);
  } catch (error) {
    if (error instanceof GateSelectionError) {
      console.error(`[gate:release:local] ${error.message}`);
      console.error('[gate:release:local] valid gate names:');
      for (const name of GATE_NAMES) console.error(`  ${name}`);
      process.exit(1);
      return;
    }
    throw error;
  }
  const { onlyGates, skipGates } = selection;
  if (selection.includeCiEnforced) {
    console.log(`[gate:release:local] --include-ci-enforced -- running all ${CI_ENFORCED_GATES.size} CI-delegated gates locally too`);
  }

  const targetSha = (process.env.RELEASE_TARGET_SHA || captureStdout('git', ['rev-parse', 'HEAD'])).toLowerCase();
  if (!targetSha) {
    // PR #1446 review, RF-1: retiring the release.target_sha *gate* must not also let an empty
    // SHA silently produce an "unbound" artifact -- fail fast and loud instead of writing evidence
    // to `.tmp/release-gates/` (i.e. the literal string "undefined") that nothing downstream can
    // use anyway. Only reachable outside a git checkout with RELEASE_TARGET_SHA also unset.
    console.error('[gate:release:local] could not resolve a target SHA: RELEASE_TARGET_SHA is unset and `git rev-parse HEAD` failed. Run inside a git checkout, or set RELEASE_TARGET_SHA explicitly.');
    process.exit(1);
    return;
  }
  const evidenceDir = path.join('.tmp', 'release-gates', targetSha);
  ensureDir(evidenceDir);
  const outputFile = path.join(evidenceDir, 'local_readiness.json');
  const gates = [];

  if (onlyGates.length > 0) {
    console.log(`[gate:release:local] --only=${onlyGates.join(',')} -- every other gate will be recorded as skipped`);
  } else if (skipGates.length > 0) {
    console.log(`[gate:release:local] --skip=${skipGates.join(',')}`);
  }

  runGate(gates, selection, 'dependencies.audit.prod', runCommand(npmCmd, ['run', 'audit:dependencies:prod']), 'npm run audit:dependencies:prod');
  runGate(gates, selection, 'dependencies.audit.full', runCommand(npmCmd, ['run', 'audit:dependencies']), 'npm run audit:dependencies');
  runGate(gates, selection, 'docs.lint', runCommand(npmCmd, ['run', 'lint:docs']), 'npm run lint:docs');
  runGate(gates, selection, 'architecture.guardrails', runCommand(npmCmd, ['run', 'check:architecture']), 'npm run check:architecture');
  runGate(gates, selection, 'compliance.contracts', runCommand(npmCmd, ['run', 'check:compliance']), 'npm run check:compliance');
  runGate(gates, selection, 'production.env.fixtures', runCommand(npmCmd, ['run', 'check:production-env']), 'npm run check:production-env');
  runGate(gates, selection, 'runtime.doctor', runCommand(npmCmd, ['run', 'doctor:runtime']), 'npm run doctor:runtime');
  runGate(gates, selection, 'backend.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-api', 'run', 'lint']), 'npm --prefix apps/dgfy-api run lint');
  runGate(gates, selection, 'backend.test_matrix', runCommand(npmCmd, ['run', 'test:backend:matrix']), 'npm run test:backend:matrix');
  runGate(gates, selection, 'frontend.ims.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-ims', 'run', 'lint']), 'npm --prefix apps/dgfy-ims run lint');
  runGate(gates, selection, 'frontend.pos.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-pos', 'run', 'lint']), 'npm --prefix apps/dgfy-pos run lint');
  runGate(gates, selection, 'frontend.storefront.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-storefront', 'run', 'lint']), 'npm --prefix apps/dgfy-storefront run lint');
  runGate(gates, selection, 'frontend.contracts', runCommand(npmCmd, ['run', 'test:frontend:contracts']), 'npm run test:frontend:contracts');
  // frontend.lint fanned out to three gates (ims/pos/storefront) when the split landed (#322);
  // this gate wasn't -- it stayed pointed at ims only, so apps/dgfy-storefront's own
  // contract/integration tests silently dropped out of the pre-main release gate (RF-3, PR #513).
  // POS has no gate of its own here: apps/dgfy-pos has zero tests today (every POS test lives in
  // packages/web-core, exercised via dgfy-ims's own contracts gate above) -- add one alongside
  // this if that ever changes.
  runGate(gates, selection, 'frontend.storefront.contracts', runCommand(npmCmd, ['run', 'test:frontend:contracts:storefront']), 'npm run test:frontend:contracts:storefront');
  const frontendBudgetReportFile = path.join(evidenceDir, 'frontend-budgets', 'frontend_budget_report.json');
  runGate(
    gates,
    selection,
    'frontend.budgets',
    runCommand(npmCmd, ['run', 'check:frontend-budgets', '--', '--report', frontendBudgetReportFile]),
    `npm run check:frontend-budgets -- --report ${frontendBudgetReportFile}`
  );
  runGate(
    gates,
    selection,
    'scroll.contracts',
    runCommand(npmCmd, [
      '--prefix',
      'apps/dgfy-ims',
      'test',
      '--',
      '--run',
      '../../packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js',
      '../../packages/web-core/src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js',
    ]),
    'npm --prefix apps/dgfy-ims test -- --run <scroll-contract-suite>'
  );
  runGate(gates, selection, 'release.notes', runCommand(npmCmd, ['run', 'check:release-notes']), 'npm run check:release-notes');

  const summary = summarizeGates(gates);
  // A partial run (--only/--skip) must never be citable as a full gate pass -- run_mode makes
  // that explicit in the artifact itself rather than relying on a reader noticing selection.
  // Delegation does NOT make run_mode "partial" -- a default (non --only/--skip) run that
  // delegates all 7 CI-enforced gates is still "full": every gate the local script owns ran or
  // was legitimately delegated to its CI enforcer, none were arbitrarily dropped (#1431 Phase 1
  // PR-B, ADR 0074 Decision 7 amendment). ADR 0074 Decision 7 requires run_mode: "full" verbatim
  // before a main promotion -- redefining what "full" covers, not adding a third value, is the
  // deliberate choice here (see the PR-B plan's rejected-alternative note).
  const isPartialRun = onlyGates.length > 0 || skipGates.length > 0;
  const payload = {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    run_mode: isPartialRun ? 'partial' : 'full',
    selection: { only: onlyGates, skip: skipGates },
    ...summary,
    // CI-enforced gates whose command is delegated to promotion-quality-gate.yml by default --
    // #1431 Phase 1 PR-B's Definition of Done ("required gate count is zero [for these]") is
    // machine-checkable from required_gate_count/delegated_gate_count in `summary` above rather
    // than prose. A delegated gate is `ok: true` in `gates[]` -- it never ran, it did not fail.
    ci_enforced_gates: [...CI_ENFORCED_GATES.keys()],
    gates,
    artifact_paths: {
      local_readiness_file: outputFile,
      frontend_budget_report_file: frontendBudgetReportFile,
    },
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`Local readiness artifact: ${outputFile} (run_mode=${payload.run_mode})`);

  if (summary.failed_gate_count > 0) process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = {
  GATE_NAMES,
  CI_ENFORCED_GATES,
  GateSelectionError,
  parseCsvArg,
  resolveGateSelection,
  isSelected,
  shouldDelegate,
  runGate,
  summarizeGates,
};
