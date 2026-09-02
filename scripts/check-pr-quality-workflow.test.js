const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkPromotionPrefixSync,
  checkStagingLegSkipShape,
  checkStepLevelAdvisory,
  checkAdvisoryFailureReportingShape,
  checkReporterHasNoShellBinaryDependency,
  checkReportingJobsRespectStagingLeg,
  checkCiEnforcedGatesAreBlocking,
  BLOCKING_STEP_IDS,
  SANCTIONED_SKIP_STAGING_IF,
  SANCTIONED_CONTINUE_ON_ERROR,
  QUALITY_JOB_NAMES,
  ADVISORY_JOB_NAMES,
  STAGING_LEG_RESPECTING_JOBS,
  REPORTER_JOB_NAME
} = require('./check-pr-quality-workflow');

// #1018 (RF-3, PR #1036 review): regression coverage for checkPromotionPrefixSync's actual job --
// catching drift between check-compliance-impact.js's PROMOTION_HEAD_PREFIX_BY_BASE and
// promotion-quality-gate.yml's `gate` job, not just "do both files mention the substrings
// somewhere." The two valid combinations and two invalid ones (a swapped mapping, a missing
// prefix in the gate job) are the cases RF-3 named explicitly.

const REAL_COMPLIANCE_SCRIPT_SNIPPET = `
const PROMOTION_HEAD_PREFIX_BY_BASE = Object.freeze({
  staging: /^to-staging\\//,
  main: /^release\\//
});
`;

// Mirrors promotion-quality-gate.yml's actual gate-job shell shape closely enough for the
// proximity regex to exercise the same logic the real workflow file does.
const validGateShell = `
case "$BASE_REF" in
  staging)
    case "$HEAD_REF" in to-staging/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
  main)
    case "$HEAD_REF" in release/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
esac
`;

test('checkPromotionPrefixSync: valid combination (staging -> to-staging/, main -> release/) reports no problems', () => {
  const problems = checkPromotionPrefixSync(REAL_COMPLIANCE_SCRIPT_SNIPPET, validGateShell);
  assert.deepEqual(problems, []);
});

test('checkPromotionPrefixSync: valid combination still passes when the two case branches are far apart', () => {
  const spacedOut = `
case "$BASE_REF" in
  staging)
    # a long comment block that pushes the head-ref case further away, still within the window
    case "$HEAD_REF" in to-staging/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
  main)
    case "$HEAD_REF" in release/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
esac
`;
  const problems = checkPromotionPrefixSync(REAL_COMPLIANCE_SCRIPT_SNIPPET, spacedOut);
  assert.deepEqual(problems, []);
});

test('checkPromotionPrefixSync: invalid -- swapped base<->prefix mapping is caught', () => {
  // staging now (wrongly) maps to release/, main to to-staging/ -- the exact swap RF-1's original
  // "just check both substrings exist" guard could not catch, since both substrings are still
  // present somewhere in the file.
  const swappedGateShell = `
case "$BASE_REF" in
  staging)
    case "$HEAD_REF" in release/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
  main)
    case "$HEAD_REF" in to-staging/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
esac
`;
  const problems = checkPromotionPrefixSync(REAL_COMPLIANCE_SCRIPT_SNIPPET, swappedGateShell);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /base "staging" -> head prefix "to-staging\/\*"/);
  assert.match(problems[1], /base "main" -> head prefix "release\/\*"/);
});

test('checkPromotionPrefixSync: invalid -- gate job missing one base entirely is caught', () => {
  const missingMainBranch = `
case "$BASE_REF" in
  staging)
    case "$HEAD_REF" in to-staging/*) echo "is_promotion=true" >> "$GITHUB_OUTPUT"; exit 0 ;; esac
    ;;
esac
`;
  const problems = checkPromotionPrefixSync(REAL_COMPLIANCE_SCRIPT_SNIPPET, missingMainBranch);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /base "main" -> head prefix "release\/\*"/);
});

test('checkPromotionPrefixSync: PROMOTION_HEAD_PREFIX_BY_BASE missing entirely is reported, not silently skipped', () => {
  const problems = checkPromotionPrefixSync('// no such constant here', validGateShell);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /could not find PROMOTION_HEAD_PREFIX_BY_BASE/);
});

// #1063 (2026-08-26): checkStagingLegSkipShape replaced the old blanket "continue-on-error
// anywhere in this file is forbidden" check with a shape-aware one -- every quality job must skip
// entirely on the develop->staging leg (via its `if:`) and be unconditionally advisory
// (`continue-on-error: true`) on every leg it does run on. Builds a synthetic workflow body with
// one small job block per real job name rather than loading the actual file, so these cases stay
// independent of unrelated edits to the real jobs' steps.

function buildWorkflowWithJobLines(linesFor) {
  const jobs = QUALITY_JOB_NAMES.map((name) => {
    const { ifLine = SANCTIONED_SKIP_STAGING_IF, coeLine = SANCTIONED_CONTINUE_ON_ERROR } = linesFor(name) || {};
    return [
      `  ${name}:`,
      '    needs: gate',
      ...(ifLine ? [`    ${ifLine}`] : []),
      ...(coeLine ? [`    ${coeLine}`] : []),
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo noop'
    ].join('\n');
  });
  return `\n${jobs.join('\n\n')}\n`;
}

test('checkStagingLegSkipShape: sanctioned skip-if + unconditional continue-on-error on every job reports no problems', () => {
  const text = buildWorkflowWithJobLines(() => ({}));
  assert.deepEqual(checkStagingLegSkipShape(text), []);
});

// 2026-08-31 (#1253): SANCTIONED_SKIP_STAGING_IF excludes the staging leg again (the #1124/#1165
// advisory-everywhere relaxation was itself reverted -- see this file's own top-of-file comment) --
// a job carrying that now-retired advisory-everywhere shape (no staging-leg exclusion) is the
// deviant case this test exercises.
test('checkStagingLegSkipShape: an `if:` missing the staging-leg exclusion (the retired advisory-everywhere shape) is caught', () => {
  const text = buildWorkflowWithJobLines(() => ({
    ifLine: "if: needs.gate.outputs.is_promotion == 'true'"
  }));
  const problems = checkStagingLegSkipShape(text);
  assert.equal(problems.length, QUALITY_JOB_NAMES.length);
  problems.forEach((problem) => assert.match(problem, /`if:` must be exactly/));
});

test('checkStagingLegSkipShape: a job missing `if:` entirely is caught', () => {
  const text = buildWorkflowWithJobLines((name) => (name === 'repository-quality' ? { ifLine: null } : {}));
  const problems = checkStagingLegSkipShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"repository-quality"'s `if:` must be exactly/);
  assert.match(problems[0], /found: none/);
});

test('checkStagingLegSkipShape: a conditional continue-on-error (tied to is_staging_leg) is caught -- must be unconditional now', () => {
  const text = buildWorkflowWithJobLines(() => ({
    coeLine: "continue-on-error: ${{ needs.gate.outputs.is_staging_leg == 'true' }}"
  }));
  const problems = checkStagingLegSkipShape(text);
  assert.equal(problems.length, QUALITY_JOB_NAMES.length);
  problems.forEach((problem) => assert.match(problem, /`continue-on-error:` must be exactly/));
});

test('checkStagingLegSkipShape: a job missing continue-on-error entirely is caught', () => {
  const text = buildWorkflowWithJobLines((name) => (name === 'dgfy-api-quality' ? { coeLine: null } : {}));
  const problems = checkStagingLegSkipShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"dgfy-api-quality"'s `continue-on-error:` must be exactly/);
  assert.match(problems[0], /found: none/);
});

test('checkStagingLegSkipShape: hardcoded continue-on-error: false is still flagged (drift from the sanctioned line, even though it is itself blocking-safe)', () => {
  const text = buildWorkflowWithJobLines((name) => (name === 'frontend-pos-quality' ? { coeLine: 'continue-on-error: false' } : {}));
  const problems = checkStagingLegSkipShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"frontend-pos-quality"'s `continue-on-error:` must be exactly/);
});

// #1066 (2026-08-26): checkStepLevelAdvisory had zero test coverage before this -- the reviewer's
// RF-4 finding named this gap explicitly. Builds a job with a configurable number of steps, each
// optionally missing its own step-level continue-on-error, to exercise the count-comparison logic
// directly. ADVISORY_JOB_NAMES (not QUALITY_JOB_NAMES) is the real function's iteration set --
// covers `gate` too, which has a different `if:` shape and is deliberately absent from
// checkStagingLegSkipShape's own job list.

function buildJobWithSteps(name, stepCount, { missingCoeAt = [] } = {}) {
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    const lines = [`      - id: step_${i}`, '        uses: actions/checkout@v4'];
    if (!missingCoeAt.includes(i)) {
      lines.push('        continue-on-error: true');
    }
    steps.push(lines.join('\n'));
  }
  return [`  ${name}:`, '    needs: gate', '    runs-on: ubuntu-latest', '    steps:', ...steps].join('\n');
}

function buildAdvisoryWorkflow(jobBuilders) {
  const jobs = ADVISORY_JOB_NAMES.map((name) => (jobBuilders[name] ? jobBuilders[name]() : buildJobWithSteps(name, 2)));
  return `\n${jobs.join('\n\n')}\n`;
}

// #1431 Phase 1 (2026-09-02): five of ADVISORY_JOB_NAMES now carry a BLOCKING_STEP_IDS entry, so a
// job built from generic `step_N` ids (buildJobWithSteps) only stays a valid all-advisory example
// for a job that has no such entry -- `migration-runner-quality` here (`gate` and
// `salvage-api-evidence` also qualify; see BLOCKING_STEP_IDS/ADVISORY_JOB_NAMES). Every test below
// that isn't specifically exercising BLOCKING_STEP_IDS uses CORRECT_BLOCKING_JOB_BUILDERS as its
// baseline for the five jobs that do have an entry, defined further below.

test('checkStepLevelAdvisory: every step advisory, every advisory job including gate, reports no problems', () => {
  const text = buildAdvisoryWorkflow(CORRECT_BLOCKING_JOB_BUILDERS);
  assert.deepEqual(checkStepLevelAdvisory(text), []);
});

test('checkStepLevelAdvisory: one step in one job missing continue-on-error is caught, others unaffected', () => {
  const text = buildAdvisoryWorkflow({
    ...CORRECT_BLOCKING_JOB_BUILDERS,
    // step_0/step_1/step_2 are generic ids on a job with no BLOCKING_STEP_IDS entry -- all three
    // are ordinary advisory steps here.
    'migration-runner-quality': () => buildJobWithSteps('migration-runner-quality', 3, { missingCoeAt: [1] })
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"migration-runner-quality"'s "step_1" step has 0 step-level `continue-on-error: true` line\(s\), expected exactly 1/);
});

test('checkStepLevelAdvisory: gate\'s own step missing continue-on-error is caught (not just the six quality jobs)', () => {
  const text = buildAdvisoryWorkflow({
    ...CORRECT_BLOCKING_JOB_BUILDERS,
    gate: () => buildJobWithSteps('gate', 1, { missingCoeAt: [0] })
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"gate"'s "step_0" step has 0 step-level `continue-on-error: true` line\(s\), expected exactly 1/);
});

// #1431 Phase 1 (2026-09-02), PR-A: BLOCKING_STEP_IDS coverage -- both directions named in the PR
// plan. Builds a job whose steps use the real blocking ids from BLOCKING_STEP_IDS (rather than the
// generic step_N ids above) so these steps are actually recognized as blocking by the function
// under test.

function buildJobWithNamedSteps(name, stepIds, { coeAt = [] } = {}) {
  const steps = stepIds.map((id) => {
    const lines = [`      - id: ${id}`, '        uses: actions/checkout@v4'];
    if (coeAt.includes(id)) {
      lines.push('        continue-on-error: true');
    }
    return lines.join('\n');
  });
  return [`  ${name}:`, '    needs: gate', '    runs-on: ubuntu-latest', '    steps:', ...steps].join('\n');
}

// Correctly-shaped builders for the 5 jobs that carry a BLOCKING_STEP_IDS entry -- each blocking id
// present with zero continue-on-error, every other (advisory) step with exactly one. Used as the
// baseline for every test below so a test only has to describe the one deviation it's checking,
// rather than re-deriving a passing shape for the four jobs it isn't testing.
const CORRECT_BLOCKING_JOB_BUILDERS = {
  'dgfy-api-quality': () => buildJobWithNamedSteps(
    'dgfy-api-quality',
    ['checkout', 'enforce_arch_guardrails', 'enforce_controller_boundaries', 'run_api_lint', 'run_test_matrix'],
    { coeAt: ['checkout', 'run_test_matrix'] }
  ),
  // #1431 Phase 2 (2026-09-02), P2-1: run_scroll_contracts (gate 17) joins run_ims_lint as blocking.
  'frontend-ims-quality': () => buildJobWithNamedSteps(
    'frontend-ims-quality',
    ['checkout', 'run_ims_lint', 'run_web_core_lint', 'run_scroll_contracts'],
    { coeAt: ['checkout', 'run_web_core_lint'] }
  ),
  'frontend-pos-quality': () => buildJobWithNamedSteps(
    'frontend-pos-quality',
    ['checkout', 'run_pos_lint'],
    { coeAt: ['checkout'] }
  ),
  'frontend-storefront-quality': () => buildJobWithNamedSteps(
    'frontend-storefront-quality',
    ['checkout', 'run_storefront_lint', 'run_storefront_vitest'],
    { coeAt: ['checkout'] }
  ),
  // #1431 Phase 2 (2026-09-02), P2-1: run_production_env_fixtures (gate 7) joins run_docs_lint as
  // blocking; run_dependency_audit_prod/run_dependency_audit_full/run_compliance_contracts (gates
  // 2/3/6) stay advisory, so they're not listed here.
  'repository-quality': () => buildJobWithNamedSteps(
    'repository-quality',
    ['checkout', 'run_docs_lint', 'run_production_env_fixtures'],
    { coeAt: ['checkout'] }
  )
};

test('checkStepLevelAdvisory: the 8 blocking steps with no continue-on-error, and every other step with exactly one, reports no problems', () => {
  const text = buildAdvisoryWorkflow(CORRECT_BLOCKING_JOB_BUILDERS);
  assert.deepEqual(checkStepLevelAdvisory(text), []);
});

test('checkStepLevelAdvisory: a blocking step that still carries continue-on-error is caught (must regress to red, not stay green)', () => {
  const text = buildAdvisoryWorkflow({
    ...CORRECT_BLOCKING_JOB_BUILDERS,
    'dgfy-api-quality': () => buildJobWithNamedSteps(
      'dgfy-api-quality',
      ['checkout', 'enforce_arch_guardrails', 'enforce_controller_boundaries', 'run_api_lint'],
      { coeAt: ['checkout', 'run_api_lint'] }
    )
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"dgfy-api-quality"'s "run_api_lint" step is listed in BLOCKING_STEP_IDS but still carries 1 step-level `continue-on-error: true`/);
});

test('checkStepLevelAdvisory: an unlisted step silently missing continue-on-error is caught (must not become blocking by accident)', () => {
  const text = buildAdvisoryWorkflow({
    ...CORRECT_BLOCKING_JOB_BUILDERS,
    'frontend-pos-quality': () => buildJobWithNamedSteps(
      'frontend-pos-quality',
      ['checkout', 'run_pos_lint'],
      { coeAt: [] }
    )
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"frontend-pos-quality"'s "checkout" step has 0 step-level `continue-on-error: true` line\(s\), expected exactly 1/);
});

test('checkStepLevelAdvisory: a blocking step id that is missing entirely (renamed/removed) is caught', () => {
  const text = buildAdvisoryWorkflow({
    ...CORRECT_BLOCKING_JOB_BUILDERS,
    'repository-quality': () => buildJobWithNamedSteps(
      'repository-quality',
      ['checkout', 'run_docs_lint_renamed', 'run_production_env_fixtures'],
      { coeAt: ['checkout', 'run_docs_lint_renamed'] }
    )
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"repository-quality" is expected to have a blocking step with id "run_docs_lint" \(BLOCKING_STEP_IDS\) but no step with that id was found/);
});

// #1066 RF-4 (2026-08-26, pr-reviewer should-fix on PR #1068): checkStepLevelAdvisory above only
// ever compared step counts against continue-on-error counts -- it would pass even if a step's id
// was dropped, STEP_OUTCOMES listed the wrong id, or report-advisory-failures lost a needs: entry
// or an env: input for one job, all silent signal loss. checkAdvisoryFailureReportingShape traces
// the full id -> STEP_OUTCOMES -> outputs.real_failures -> report-advisory-failures chain, per
// quality job. Builds a realistic single quality job (with its own record_outcomes step,
// STEP_OUTCOMES block, and outputs.real_failures) plus a matching reporter job, mirroring the real
// file's actual indentation closely enough for the regexes to exercise the same logic.

function buildQualityJobWithReportingShape(name, {
  stepIds = ['checkout', 'setup_node', 'run_lint'],
  stepOutcomesIds = null, // defaults to stepIds; pass a different list to simulate drift
  includeOutputs = true
} = {}) {
  const outcomeIds = stepOutcomesIds === null ? stepIds : stepOutcomesIds;
  const steps = stepIds.map((id) => [`      - id: ${id}`, '        uses: actions/checkout@v4', '        continue-on-error: true'].join('\n'));
  const outcomeLines = outcomeIds.map((id) => `            ${id}|\${{ steps.${id}.outcome }}`);
  const recordOutcomesStep = [
    '      - name: Record real per-step outcomes for advisory-failure reporting',
    '        id: record_outcomes',
    '        if: always()',
    '        continue-on-error: true',
    '        env:',
    '          STEP_OUTCOMES: |',
    ...outcomeLines,
    '        run: |',
    '          echo noop'
  ].join('\n');
  return [
    `  ${name}:`,
    '    needs: gate',
    `    ${SANCTIONED_SKIP_STAGING_IF}`,
    `    ${SANCTIONED_CONTINUE_ON_ERROR}`,
    '    runs-on: ubuntu-latest',
    ...(includeOutputs
      ? ['    outputs:', '      real_failures: ${{ steps.record_outcomes.outputs.real_failures }}']
      : []),
    '    steps:',
    ...steps,
    recordOutcomesStep
  ].join('\n');
}

function envVarNameFor(jobName) {
  return `${jobName.toUpperCase().replace(/-/g, '_')}_FAILURES`;
}

function buildReporterJob(jobNames, {
  missingNeeds = [],
  missingEnvRefs = [],
  missingCoe = false,
  mismatchedAddIfPresentVarFor = [],
  useShellGhForm = false
} = {}) {
  const needsList = ['gate', ...jobNames.filter((n) => !missingNeeds.includes(n))];
  const envLines = jobNames
    .filter((n) => !missingEnvRefs.includes(n))
    .map((n) => `          ${envVarNameFor(n)}: \${{ needs.${n}.outputs.real_failures }}`);
  // #1124/#1165: matches the real reporter's actual (post actions/github-script@v7) shape --
  // addIfPresent('<job>', process.env.<the var that job's real_failures was assigned to above>, ...)
  // -- unless the test deliberately asks for a mismatch (RF-5's own reproduction: a swapped/
  // misspelled variable there) or the retired shell form (useShellGhForm, for
  // checkReporterHasNoShellBinaryDependency's own coverage).
  const addLines = jobNames.map((n) => (
    mismatchedAddIfPresentVarFor.includes(n)
      ? `            addIfPresent('${n}', process.env.WRONG_VAR_NAME, process.env.WRONG_RESULT);`
      : `            addIfPresent('${n}', process.env.${envVarNameFor(n)}, process.env.${n.toUpperCase().replace(/-/g, '_')}_RESULT);`
  ));
  const runBlock = useShellGhForm
    ? [
      '        run: |',
      ...jobNames.map((n) => `          add_if_present "${n}" "$${envVarNameFor(n)}"`),
      '          gh issue comment 1063 --body-file /tmp/advisory-failure-comment.md'
    ]
    : [
      '        uses: actions/github-script@v7',
      '        with:',
      '          script: |',
      ...addLines,
      '            // no-op tail'
    ];
  return [
    `  ${REPORTER_JOB_NAME}:`,
    '    needs:',
    ...needsList.map((n) => `      - ${n}`),
    '    if: always()',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Report real quality-job failures',
    ...(missingCoe ? [] : ['        continue-on-error: true']),
    '        env:',
    ...envLines,
    ...runBlock
  ].join('\n');
}

test('checkAdvisoryFailureReportingShape: a fully wired job + reporter reports no problems', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  assert.deepEqual(checkAdvisoryFailureReportingShape(text), []);
});

test('checkAdvisoryFailureReportingShape: a step missing `id:` is caught', () => {
  const jobText = `\n  dgfy-api-quality:\n    needs: gate\n    ${SANCTIONED_SKIP_STAGING_IF}\n    ${SANCTIONED_CONTINUE_ON_ERROR}\n    runs-on: ubuntu-latest\n    outputs:\n      real_failures: \${{ steps.record_outcomes.outputs.real_failures }}\n    steps:\n      - uses: actions/checkout@v4\n        continue-on-error: true\n      - name: Record real per-step outcomes for advisory-failure reporting\n        id: record_outcomes\n        continue-on-error: true\n        env:\n          STEP_OUTCOMES: |\n            x|\${{ steps.checkout.outcome }}\n        run: |\n          echo noop\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  const problems = checkAdvisoryFailureReportingShape(jobText);
  assert.equal(problems.filter((p) => /has a step with no `id:`/.test(p)).length, 1);
});

test('checkAdvisoryFailureReportingShape: an id missing from STEP_OUTCOMES is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality', { stepOutcomesIds: ['checkout', 'setup_node'] })}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STEP_OUTCOMES is missing `steps\.run_lint\.outcome`/);
});

test('checkAdvisoryFailureReportingShape: a stale/unknown id in STEP_OUTCOMES is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality', { stepOutcomesIds: ['checkout', 'setup_node', 'run_lint', 'run_lint_OLD'] })}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STEP_OUTCOMES references `steps\.run_lint_OLD\.outcome`, but no current step has that id/);
});

test('checkAdvisoryFailureReportingShape: a job missing outputs.real_failures is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality', { includeOutputs: false })}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.filter((p) => /has no `outputs\.real_failures/.test(p)).length, 1);
});

test('checkAdvisoryFailureReportingShape: reporter missing one needs: entry is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'], { missingNeeds: ['dgfy-api-quality'] })}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.filter((p) => /`needs:` is missing "dgfy-api-quality"/.test(p)).length, 1);
});

test('checkAdvisoryFailureReportingShape: reporter missing one env: input is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'], { missingEnvRefs: ['dgfy-api-quality'] })}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.filter((p) => /must reference `needs\.dgfy-api-quality\.outputs\.real_failures` exactly once, assigned to an env var \(found 0\)/.test(p)).length, 1);
});

test('checkAdvisoryFailureReportingShape: reporter step missing continue-on-error is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'], { missingCoe: true })}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.filter((p) => /single step must carry exactly one step-level `continue-on-error: true`/.test(p)).length, 1);
});

// #1066 RF-5 (2026-08-26, pr-reviewer third round): two read-only mutations against the real
// workflow file returned no findings before this fix -- duplicating a valid steps.<id>.outcome
// line, and swapping an add_if_present call's variable to another job's. Both are now checked.

test('checkAdvisoryFailureReportingShape: a duplicated STEP_OUTCOMES reference to the same step id is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality', { stepOutcomesIds: ['checkout', 'setup_node', 'run_lint', 'run_lint'] })}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STEP_OUTCOMES references `steps\.run_lint\.outcome` 2 times/);
});

test('checkAdvisoryFailureReportingShape: addIfPresent using a different job\'s variable is caught, not silently accepted', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'], { mismatchedAddIfPresentVarFor: ['dgfy-api-quality'] })}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not match the env var needs\.dgfy-api-quality\.outputs\.real_failures is actually assigned to/);
});

// 2026-08-29 (#1124/#1165): checkReporterHasNoShellBinaryDependency is the regression guard for the
// bug this epic actually found -- `gh` is not installed on the self-hosted runners, and the old
// reporter's shell-out to it failed 100% silently for as long as that job existed. Covers the
// sanctioned actions/github-script form (no problem), the retired shell `gh issue`/`add_if_present`
// form (caught), and confirms a `gh` mention elsewhere in the file (e.g. a comment citing
// `gh api .../actions/runners` as evidence, as this very file's header does) is not itself flagged.

test('checkReporterHasNoShellBinaryDependency: the sanctioned actions/github-script reporter reports no problems', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  assert.deepEqual(checkReporterHasNoShellBinaryDependency(text), []);
});

test('checkReporterHasNoShellBinaryDependency: a reporter that shells out to `gh issue` is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'], { useShellGhForm: true })}\n`;
  const problems = checkReporterHasNoShellBinaryDependency(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /shells out to a `gh` subcommand/);
});

test('checkReporterHasNoShellBinaryDependency: a `gh` mention in a comment elsewhere in the file is not flagged', () => {
  const text = `# see gh api repos/.../actions/runners for evidence\n\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'])}\n`;
  assert.deepEqual(checkReporterHasNoShellBinaryDependency(text), []);
});

// 2026-08-31 (#1253, pr-reviewer RF-1/RF-2/RF-4 on PR #1257): report-advisory-failures and
// salvage-api-evidence both lost their is_staging_leg exclusion in the same #1124/#1165 commit that
// made the six quality jobs advisory-everywhere -- the first revert attempt (checkStagingLegSkipShape,
// scoped to QUALITY_JOB_NAMES only) restored the six but missed these two, exactly the gap this check
// exists to close now. Builds each job's block directly rather than via buildReporterJob (whose
// fixture is deliberately `if: always()`, used by other tests above that don't care about the
// staging-leg exclusion).
function buildStagingLegRespectingJobBlock(name, ifLine) {
  return [
    `  ${name}:`,
    '    needs: [gate]',
    `    ${ifLine}`,
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo noop'
  ].join('\n');
}

test('checkReportingJobsRespectStagingLeg: both jobs excluding the staging leg reports no problems', () => {
  const text = STAGING_LEG_RESPECTING_JOBS
    .map((name) => buildStagingLegRespectingJobBlock(name, "if: always() && needs.gate.outputs.is_promotion == 'true' && needs.gate.outputs.is_staging_leg != 'true'"))
    .join('\n\n');
  assert.deepEqual(checkReportingJobsRespectStagingLeg(`\n${text}\n`), []);
});

test('checkReportingJobsRespectStagingLeg: a job missing the staging-leg exclusion (the #1124/#1165 shape) is caught', () => {
  const text = STAGING_LEG_RESPECTING_JOBS
    .map((name) => buildStagingLegRespectingJobBlock(name, "if: always() && needs.gate.outputs.is_promotion == 'true'"))
    .join('\n\n');
  const problems = checkReportingJobsRespectStagingLeg(`\n${text}\n`);
  assert.equal(problems.length, STAGING_LEG_RESPECTING_JOBS.length);
  problems.forEach((problem) => assert.match(problem, /does not exclude the staging leg/));
});

test('checkReportingJobsRespectStagingLeg: only one of the two jobs missing the exclusion is reported individually', () => {
  const [first, second] = STAGING_LEG_RESPECTING_JOBS;
  const text = [
    buildStagingLegRespectingJobBlock(first, "if: always() && needs.gate.outputs.is_promotion == 'true' && needs.gate.outputs.is_staging_leg != 'true'"),
    buildStagingLegRespectingJobBlock(second, "if: always() && needs.gate.outputs.is_promotion == 'true'")
  ].join('\n\n');
  const problems = checkReportingJobsRespectStagingLeg(`\n${text}\n`);
  assert.equal(problems.length, 1);
  assert.match(problems[0], new RegExp(`"${second}"`));
});

test('checkReportingJobsRespectStagingLeg: a missing job block is caught rather than silently skipped', () => {
  const [first] = STAGING_LEG_RESPECTING_JOBS;
  const text = buildStagingLegRespectingJobBlock(first, "if: always() && needs.gate.outputs.is_promotion == 'true' && needs.gate.outputs.is_staging_leg != 'true'");
  const problems = checkReportingJobsRespectStagingLeg(`\n${text}\n`);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /could not find the ".*:" job block/);
});

// #1431 Phase 1 PR-B: checkCiEnforcedGatesAreBlocking is the cross-file guard that keeps
// gate-release-local.js's CI_ENFORCED_GATES honest against this file's own BLOCKING_STEP_IDS --
// a gate cannot be dropped locally and silently regain continue-on-error in CI without this
// failing. The real CI_ENFORCED_GATES (gate-release-local.js) is verified to pass by
// `npm run check:pr-quality-workflow` itself; these cases exercise the failure paths via an
// injected Map, matching the function's own testability seam.

test('checkCiEnforcedGatesAreBlocking: the real CI_ENFORCED_GATES map (default arg) reports no problems', () => {
  assert.deepEqual(checkCiEnforcedGatesAreBlocking(), []);
});

test('checkCiEnforcedGatesAreBlocking: a step id missing from BLOCKING_STEP_IDS for its job is caught', () => {
  const problems = checkCiEnforcedGatesAreBlocking(new Map([
    ['docs.lint', { job: 'repository-quality', steps: ['run_docs_lint', 'some_new_step_not_yet_blocking'] }]
  ]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"some_new_step_not_yet_blocking"/);
  assert.match(problems[0], /"repository-quality"/);
});

test('checkCiEnforcedGatesAreBlocking: a job with no BLOCKING_STEP_IDS entry at all is caught', () => {
  const problems = checkCiEnforcedGatesAreBlocking(new Map([
    ['docs.lint', { job: 'a-job-that-does-not-exist', steps: ['run_docs_lint'] }]
  ]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"a-job-that-does-not-exist"/);
  assert.match(problems[0], /has no entry in BLOCKING_STEP_IDS/);
});

test('checkCiEnforcedGatesAreBlocking: every entry present and blocking reports no problems', () => {
  const problems = checkCiEnforcedGatesAreBlocking(new Map([
    ['backend.lint', { job: 'dgfy-api-quality', steps: ['run_api_lint'] }],
    ['frontend.pos.lint', { job: 'frontend-pos-quality', steps: ['run_pos_lint'] }]
  ]));
  assert.deepEqual(problems, []);
  assert.deepEqual(BLOCKING_STEP_IDS['dgfy-api-quality'].includes('run_api_lint'), true);
});
