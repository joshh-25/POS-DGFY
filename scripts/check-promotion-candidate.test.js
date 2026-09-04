const assert = require('node:assert/strict');
const test = require('node:test');

const { validatePromotionCandidate, resolveCandidateSourceShaByApp } = require('./check-promotion-candidate');

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
      { kind: 'staging_repair', revision: 1, sha: SHA('b'), parent_sha: SHA('a'), branch: 'fix/staging/2026-09-04-01-r1', pr: 2002, issue: 3002, apps_touched: ['dgfy-ims'] },
      { kind: 'staging_repair', revision: 2, sha: SHA('c'), parent_sha: SHA('b'), branch: 'fix/staging/2026-09-04-01-r2', pr: 2003, issue: 3003, apps_touched: ['dgfy-api', 'dgfy-migration-runner'] },
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

// #1610 (ADR 0081 Decision 8 amendment) -- apps_touched validation and per-app resolution.

test('rejects a staging_repair revision with no apps_touched at all', () => {
  const manifest = candidate();
  delete manifest.revisions[1].apps_touched;
  assert.throws(() => validatePromotionCandidate(manifest), /must declare a non-empty apps_touched array/);
});

test('rejects a staging_repair revision with an empty apps_touched array', () => {
  const manifest = candidate();
  manifest.revisions[1].apps_touched = [];
  assert.throws(() => validatePromotionCandidate(manifest), /must declare a non-empty apps_touched array/);
});

test('rejects an apps_touched entry that is not a recognized app', () => {
  const manifest = candidate();
  manifest.revisions[1].apps_touched = ['dgfy-not-a-real-app'];
  assert.throws(() => validatePromotionCandidate(manifest), /unrecognized app: dgfy-not-a-real-app/);
});

test('rejects an apps_touched entry listed twice', () => {
  const manifest = candidate();
  manifest.revisions[1].apps_touched = ['dgfy-ims', 'dgfy-ims'];
  assert.throws(() => validatePromotionCandidate(manifest), /lists dgfy-ims more than once/);
});

test('resolveCandidateSourceShaByApp: an app never named in any repair keeps the initial SHA, even after later repairs advance current_staging_sha for other apps', () => {
  // The fixture's r1 touches only dgfy-ims, r2 touches dgfy-api/dgfy-migration-runner -- matching
  // #1610's own real-world case: dgfy-pos and dgfy-storefront are never touched by either repair.
  const byApp = resolveCandidateSourceShaByApp(candidate());
  assert.equal(byApp['dgfy-pos'], SHA('a'));
  assert.equal(byApp['dgfy-storefront'], SHA('a'));
});

test('resolveCandidateSourceShaByApp: an app named in a repair resolves to that repair\'s own SHA, not the candidate-wide current_staging_sha', () => {
  const byApp = resolveCandidateSourceShaByApp(candidate());
  // dgfy-ims was only ever touched by r1 (SHA b) -- r2 never named it, so it must NOT have
  // advanced to r2's SHA (c), even though current_staging_sha itself is now c.
  assert.equal(byApp['dgfy-ims'], SHA('b'));
});

test('resolveCandidateSourceShaByApp: an app touched by the latest repair resolves to that repair\'s SHA', () => {
  const byApp = resolveCandidateSourceShaByApp(candidate());
  assert.equal(byApp['dgfy-api'], SHA('c'));
  assert.equal(byApp['dgfy-migration-runner'], SHA('c'));
});

test('resolveCandidateSourceShaByApp: a candidate with no repairs at all resolves every app to source_develop_sha', () => {
  const manifest = candidate();
  manifest.revisions = [manifest.revisions[0]];
  manifest.current_staging_sha = manifest.source_develop_sha;
  manifest.release_revision.source_staging_sha = manifest.source_develop_sha;
  const byApp = resolveCandidateSourceShaByApp(manifest);
  for (const app of Object.keys(byApp)) {
    assert.equal(byApp[app], SHA('a'));
  }
});

test('resolveCandidateSourceShaByApp: respects an explicit apps subset instead of resolving all five', () => {
  const byApp = resolveCandidateSourceShaByApp(candidate(), ['dgfy-pos']);
  assert.deepEqual(Object.keys(byApp), ['dgfy-pos']);
  assert.equal(byApp['dgfy-pos'], SHA('a'));
});
