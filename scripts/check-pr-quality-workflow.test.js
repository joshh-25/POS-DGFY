const test = require('node:test');
const assert = require('node:assert/strict');

const { checkPromotionPrefixSync } = require('./check-pr-quality-workflow');

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
