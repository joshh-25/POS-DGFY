const assert = require('node:assert/strict');
const test = require('node:test');

const { validatePromotionCandidate } = require('./check-promotion-candidate');

const SHA = (digit) => String(digit).repeat(40);

function candidate(overrides = {}) {
  return {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: SHA('a'),
    current_staging_sha: SHA('c'),
    revisions: [
      { kind: 'initial', sha: SHA('a'), parent_sha: null, branch: 'to-staging/2026-09-04-01', pr: 2001 },
      { kind: 'staging_repair', revision: 1, sha: SHA('b'), parent_sha: SHA('a'), branch: 'fix/staging/2026-09-04-01-r1', pr: 2002, issue: 3002 },
      { kind: 'staging_repair', revision: 2, sha: SHA('c'), parent_sha: SHA('b'), branch: 'fix/staging/2026-09-04-01-r2', pr: 2003, issue: 3003 },
    ],
    release_revision: {
      revision: 3,
      source_staging_sha: SHA('c'),
      branch: 'release/2026-09-04-01-r3',
      pr: 2004,
    },
    ...overrides,
  };
}

test('accepts a frozen candidate with sequential staging repairs and a fresh release cut', () => {
  assert.deepEqual(validatePromotionCandidate(candidate()), {
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: SHA('a'),
    current_staging_sha: SHA('c'),
    repair_count: 2,
    release_revision: 3,
  });
});

test('accepts a candidate that is still in staging before a release cut', () => {
  const manifest = candidate();
  manifest.status = 'staging_soak';
  manifest.release_revision = null;
  assert.equal(validatePromotionCandidate(manifest).release_revision, null);
});

test('rejects an early lifecycle status after a release cut', () => {
  assert.throws(() => validatePromotionCandidate(candidate({ status: 'created' })), /must be qualified, repairing, promoted, verified, or blocked/);
});

test('rejects a malformed candidate ID', () => {
  assert.throws(() => validatePromotionCandidate(candidate({ candidate_id: 'release-1' })), /candidate_id must use YYYY-MM-DD-NN/);
});

test('rejects a repair that points at a newer or unrelated SHA', () => {
  const manifest = candidate();
  manifest.revisions[1].parent_sha = SHA('d');
  assert.throws(() => validatePromotionCandidate(manifest), /must point to the previous candidate SHA/);
});

test('rejects a release branch cut from anything except current staging', () => {
  const manifest = candidate();
  manifest.release_revision.source_staging_sha = SHA('b');
  assert.throws(() => validatePromotionCandidate(manifest), /Release branch must be cut from the current staging SHA/);
});

test('rejects a non-sequential repair revision and duplicate SHA', () => {
  const manifest = candidate();
  manifest.revisions[2].revision = 4;
  assert.throws(() => validatePromotionCandidate(manifest), /Repair revisions must be sequential/);

  const duplicate = candidate();
  duplicate.revisions[2].sha = SHA('a');
  duplicate.current_staging_sha = SHA('a');
  duplicate.release_revision.source_staging_sha = SHA('a');
  assert.throws(() => validatePromotionCandidate(duplicate), /reuses an earlier candidate SHA/);
});
