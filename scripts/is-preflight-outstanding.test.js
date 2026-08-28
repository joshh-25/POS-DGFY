const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { isOutstanding } = require('./is-preflight-outstanding');

const FRONT_MATTER = (ref) => `---
declaration_id: 2026-08-28-fixture
classification: major
surfaces: pos
reason_codes_impacted: ALLOWED
policy_version: 2026.08.28
verification_evidence: manual
rollback_note: revert
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: ${ref}
---

# Fixture
`;

test('an outstanding declaration (NOT-EXECUTED-* ref) is detected', () => {
  assert.equal(isOutstanding(FRONT_MATTER('NOT-EXECUTED-1121-FIXTURE')), true);
});

test('a reconciled declaration (real PROMOTER-* ref) is not outstanding', () => {
  assert.equal(isOutstanding(FRONT_MATTER('PROMOTER-1121-2026-08-28')), false);
});

// pr-reviewer RF-6's exact scenario: front matter is reconciled, but the body still mentions the
// old NOT-EXECUTED-* placeholder in a historical prose note. A whole-file grep for the substring
// would wrongly re-select this file; only the front matter's current value should count.
test('a reconciled declaration whose body historically mentions NOT-EXECUTED- is not outstanding', () => {
  const content = `${FRONT_MATTER('PROMOTER-322-ABSORB-2026-08-24')}
> Reconciled 2026-08-24. Front matter previously carried
> \`preflight_request_ref: NOT-EXECUTED-322-FRONTEND-SPLIT-ABSORB\` -- see below for the real run.
`;
  assert.equal(isOutstanding(content), false);
});

test('a declaration with no front matter at all is not outstanding', () => {
  assert.equal(isOutstanding('# No front matter\n\nNOT-EXECUTED- appears here too.\n'), false);
});

test('a declaration missing preflight_request_ref entirely is not outstanding', () => {
  const content = '---\ndeclaration_id: x\nclassification: minor\n---\n\n# Fixture\n';
  assert.equal(isOutstanding(content), false);
});

// Live regression check against a real file in this repo that matches RF-6's exact shape --
// reconciled front matter, NOT-EXECUTED-* still present in the body's historical note.
test('the real 2026-08-22-frontend-split-develop-absorb-path-fixes.md declaration is not outstanding', () => {
  const filePath = path.join(
    __dirname,
    '..',
    'docs',
    'compliance',
    'impact-declarations',
    '2026-08-22-frontend-split-develop-absorb-path-fixes.md'
  );
  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /NOT-EXECUTED-/); // sanity: the old grep would have matched this file
  assert.equal(isOutstanding(content), false); // but it's actually reconciled
});
