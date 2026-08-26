const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkPromotionPrefixSync,
  checkContinueOnErrorShape,
  SANCTIONED_CONTINUE_ON_ERROR_EXPR,
  QUALITY_JOB_NAMES
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

// #1063 (2026-08-26): checkContinueOnErrorShape replaced the old blanket "continue-on-error
// anywhere in this file is forbidden" check with a shape-aware one -- every quality job must carry
// continue-on-error, and it must be tied to is_staging_leg specifically, not a blanket bypass.
// Builds a synthetic workflow body with one small job block per real job name rather than loading
// the actual file, so these cases stay independent of unrelated edits to the real jobs' steps.

function buildWorkflowWithContinueOnError(continueOnErrorLineFor) {
  const jobs = QUALITY_JOB_NAMES.map((name) => {
    const line = continueOnErrorLineFor(name);
    return [
      `  ${name}:`,
      '    needs: gate',
      "    if: needs.gate.outputs.is_promotion == 'true'",
      ...(line ? [`    ${line}`] : []),
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo noop'
    ].join('\n');
  });
  return `\n${jobs.join('\n\n')}\n`;
}

test('checkContinueOnErrorShape: sanctioned per-job conditional form on every job reports no problems', () => {
  const text = buildWorkflowWithContinueOnError(
    () => `continue-on-error: ${SANCTIONED_CONTINUE_ON_ERROR_EXPR}`
  );
  assert.deepEqual(checkContinueOnErrorShape(text), []);
});

test('checkContinueOnErrorShape: a blanket continue-on-error: true is caught, not treated as sanctioned', () => {
  const text = buildWorkflowWithContinueOnError(() => 'continue-on-error: true');
  const problems = checkContinueOnErrorShape(text);
  assert.equal(problems.length, QUALITY_JOB_NAMES.length);
  problems.forEach((problem) => assert.match(problem, /must be exactly/));
});

test('checkContinueOnErrorShape: a differently-worded condition (not tied to is_staging_leg) is caught', () => {
  const text = buildWorkflowWithContinueOnError(
    () => "continue-on-error: ${{ needs.gate.outputs.is_promotion == 'true' }}"
  );
  const problems = checkContinueOnErrorShape(text);
  assert.equal(problems.length, QUALITY_JOB_NAMES.length);
  problems.forEach((problem) => assert.match(problem, /must be exactly/));
});

test('checkContinueOnErrorShape: a quality job missing continue-on-error entirely is caught', () => {
  const text = buildWorkflowWithContinueOnError((name) =>
    name === 'repository-quality' ? null : `continue-on-error: ${SANCTIONED_CONTINUE_ON_ERROR_EXPR}`
  );
  const problems = checkContinueOnErrorShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"repository-quality" is missing continue-on-error/);
});

test('checkContinueOnErrorShape: sanctioned on the staging leg, unconditionally false hardcoded elsewhere still passes as long as it matches exactly', () => {
  // A job that hardcodes `continue-on-error: false` (rather than the conditional expression) does
  // NOT match the sanctioned expression string and should still be flagged -- false is blocking,
  // which is safe in itself, but silently diverging from the one sanctioned expression is still a
  // drift this check exists to catch (e.g. it would hide a job nobody actually wired for #1063).
  const text = buildWorkflowWithContinueOnError((name) =>
    name === 'dgfy-api-quality' ? 'continue-on-error: false' : `continue-on-error: ${SANCTIONED_CONTINUE_ON_ERROR_EXPR}`
  );
  const problems = checkContinueOnErrorShape(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"dgfy-api-quality"'s continue-on-error must be exactly/);
});
