const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkPromotionPrefixSync,
  checkStagingLegSkipShape,
  checkStepLevelAdvisory,
  checkAdvisoryFailureReportingShape,
  SANCTIONED_SKIP_STAGING_IF,
  SANCTIONED_CONTINUE_ON_ERROR,
  QUALITY_JOB_NAMES,
  ADVISORY_JOB_NAMES,
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

test('checkStagingLegSkipShape: an `if:` that does not exclude the staging leg is caught', () => {
  const text = buildWorkflowWithJobLines(() => ({ ifLine: "if: needs.gate.outputs.is_promotion == 'true'" }));
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

test('checkStepLevelAdvisory: every step advisory, every advisory job including gate, reports no problems', () => {
  const text = buildAdvisoryWorkflow({});
  assert.deepEqual(checkStepLevelAdvisory(text), []);
});

test('checkStepLevelAdvisory: one step in one job missing continue-on-error is caught, others unaffected', () => {
  const text = buildAdvisoryWorkflow({
    'dgfy-api-quality': () => buildJobWithSteps('dgfy-api-quality', 3, { missingCoeAt: [1] })
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"dgfy-api-quality" has 3 step\(s\) but only 2 step-level/);
});

test('checkStepLevelAdvisory: gate\'s own step missing continue-on-error is caught (not just the six quality jobs)', () => {
  const text = buildAdvisoryWorkflow({
    gate: () => buildJobWithSteps('gate', 1, { missingCoeAt: [0] })
  });
  const problems = checkStepLevelAdvisory(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"gate" has 1 step\(s\) but only 0 step-level/);
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

function buildReporterJob(jobNames, { missingNeeds = [], missingEnvRefs = [], missingCoe = false } = {}) {
  const needsList = ['gate', ...jobNames.filter((n) => !missingNeeds.includes(n))];
  const envLines = jobNames
    .filter((n) => !missingEnvRefs.includes(n))
    .map((n) => `          ${n.toUpperCase().replace(/-/g, '_')}_FAILURES: \${{ needs.${n}.outputs.real_failures }}`);
  const addLines = jobNames.map((n) => `          add_if_present "${n}" "$X"`);
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
    '        run: |',
    ...addLines,
    '          echo done'
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
  assert.equal(problems.filter((p) => /must reference `needs\.dgfy-api-quality\.outputs\.real_failures` exactly once \(found 0\)/.test(p)).length, 1);
});

test('checkAdvisoryFailureReportingShape: reporter step missing continue-on-error is caught', () => {
  const text = `\n${buildQualityJobWithReportingShape('dgfy-api-quality')}\n\n${buildReporterJob(['dgfy-api-quality'], { missingCoe: true })}\n`;
  const problems = checkAdvisoryFailureReportingShape(text);
  assert.equal(problems.filter((p) => /single step must carry exactly one step-level `continue-on-error: true`/.test(p)).length, 1);
});
