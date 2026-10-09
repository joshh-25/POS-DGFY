const assert = require('node:assert/strict');
const test = require('node:test');

const { validatePromotionCandidate, validatePromotionCandidateV2, getAppRevision, getActiveCandidateSha, resolveCandidateSourceShaByApp } = require('./check-promotion-candidate');

const SHA = (digit) => String(digit).repeat(40);
const DIGEST = (digit) => `sha256:${String(digit).repeat(64)}`;

function candidate(overrides = {}) {
  return {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: SHA('a'),
    current_staging_sha: SHA('c'),
    staging_head_sha: SHA('c'),
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
    staging_head_sha: SHA('c'),
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

test('accepts a staging-soak candidate with no staging head recorded yet', () => {
  const manifest = candidate({ staging_head_sha: null });
  manifest.status = 'staging_soak';
  manifest.release_revision = null;
  assert.equal(validatePromotionCandidate(manifest).staging_head_sha, null);
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

test('rejects a release branch cut from anything except the recorded staging head', () => {
  const manifest = candidate();
  manifest.release_revision.source_staging_sha = SHA('b');
  assert.throws(() => validatePromotionCandidate(manifest), /Release branch must be cut from the recorded staging head/);
});

test('accepts a fast-forward staging promotion with a distinct staging head', () => {
  const manifest = candidate({ staging_head_sha: SHA('d') });
  manifest.release_revision.source_staging_sha = SHA('d');
  assert.equal(validatePromotionCandidate(manifest).staging_head_sha, SHA('d'));
});

test('rejects a released candidate without the actual staging head', () => {
  const manifest = candidate();
  delete manifest.staging_head_sha;
  assert.throws(() => validatePromotionCandidate(manifest), /must record the actual staging head/);
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

// PR #1612 review RF-1: dgfy-api and dgfy-migration-runner are always rebuilt/relabeled as one
// paired unit -- a one-sided apps_touched would make resolveCandidateSourceShaByApp return
// different SHAs for the pair while PROD actually stamps both with the same API-group SHA.
test('rejects an apps_touched that lists dgfy-api but not dgfy-migration-runner', () => {
  const manifest = candidate();
  manifest.revisions[1].apps_touched = ['dgfy-api'];
  assert.throws(() => validatePromotionCandidate(manifest), /must list dgfy-api and dgfy-migration-runner together or not at all/);
});

test('rejects an apps_touched that lists dgfy-migration-runner but not dgfy-api', () => {
  const manifest = candidate();
  manifest.revisions[1].apps_touched = ['dgfy-migration-runner'];
  assert.throws(() => validatePromotionCandidate(manifest), /must list dgfy-api and dgfy-migration-runner together or not at all/);
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

// Issue #2055 (Phase 346) -- sku-release-candidate/v2: per-app release_revision map,
// cosmetic repair_seq, selected DEV artifacts on the initial revision.

function candidateV2(overrides = {}) {
  return {
    schema: 'sku-release-candidate/v2',
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: SHA('a'),
    current_staging_sha: SHA('c'),
    staging_head_sha: SHA('c'),
    revisions: [
      {
        kind: 'initial', sha: SHA('a'), parent_sha: null, branch: 'to-staging/2026-09-04-01', pr: 2001,
        dev_artifacts: [
          { app: 'dgfy-ims', revision: 4, sha: SHA('a'), digest: DIGEST('1') },
          { app: 'dgfy-api', revision: 7, sha: SHA('a'), digest: DIGEST('2') },
          { app: 'dgfy-migration-runner', revision: 7, sha: SHA('a'), digest: DIGEST('3') },
        ],
      },
      { kind: 'staging_repair', repair_seq: 1, sha: SHA('b'), parent_sha: SHA('a'), branch: 'fix/staging/2026-09-04-01-1', pr: 2002, issue: 3002, apps_touched: ['dgfy-ims'] },
      { kind: 'staging_repair', repair_seq: 2, sha: SHA('c'), parent_sha: SHA('b'), branch: 'fix/staging/2026-09-04-01-2', pr: 2003, issue: 3003, apps_touched: ['dgfy-api', 'dgfy-migration-runner'] },
    ],
    release_revision: {
      source_staging_sha: SHA('c'),
      branch: 'release/2026-09-04-01',
      pr: 2004,
      apps: {
        'dgfy-ims': { revision: 5, source_sha: SHA('b'), digest: DIGEST('4'), origin: 'staging_repair' },
        'dgfy-api': { revision: 8, source_sha: SHA('c'), digest: DIGEST('5'), origin: 'staging_repair' },
        'dgfy-migration-runner': { revision: 9, source_sha: SHA('c'), digest: DIGEST('6'), origin: 'staging_repair' },
      },
    },
    ...overrides,
  };
}

function candidateV3(overrides = {}) {
  const manifest = structuredClone(candidateV2());
  manifest.schema = 'sku-release-candidate/v3';
  manifest.revisions[0].apps_touched = ['dgfy-ims', 'dgfy-api', 'dgfy-migration-runner'];
  delete manifest.revisions[0].dev_artifacts;
  for (const entry of Object.values(manifest.release_revision.apps)) entry.origin = 'promotion';
  return { ...manifest, ...overrides };
}

test('v3: accepts frozen develop source without selecting or requiring DEV artifacts', () => {
  const manifest = candidateV3();
  assert.equal(validatePromotionCandidate(manifest).source_develop_sha, SHA('a'));
  assert.deepEqual(manifest.revisions[0].apps_touched, ['dgfy-ims', 'dgfy-api', 'dgfy-migration-runner']);
  assert.equal(getAppRevision(manifest, 'dgfy-ims').origin, 'promotion');
});

test('v4: refresh history invalidates selection during refresh and resolves refreshed app lineage', () => {
  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'),
    status: 'refresh_in_progress', release_revision: null,
    refresh_in_progress: { refresh_seq: 2, reason: 'production is deferred' },
    staging_refresh: [{
      refresh_seq: 1, source_develop_sha: SHA('f'), sha: SHA('d'), parent_sha: SHA('c'), base_staging_sha: SHA('9'),
      branch: 'to-staging/2026-09-04-01-refresh-1', pr: 2027, reason: 'production is deferred',
      apps_touched: ['dgfy-pos'],
      artifacts: [{ app: 'dgfy-pos', revision: 2, source_sha: SHA('d'), digest: DIGEST('8'), origin: 'staging_refresh' }],
    }],
    current_staging_sha: SHA('d'),
  });
  const result = validatePromotionCandidate(manifest);
  assert.equal(result.refresh_count, 1);
  assert.equal(result.active_staging_sha, null);
  assert.deepEqual(result.superseded_staging_shas, [SHA('a'), SHA('b'), SHA('c'), SHA('d')]);
  assert.equal(result.staging_observation_current, false);
  assert.equal(getActiveCandidateSha(manifest), null);
  assert.equal(resolveCandidateSourceShaByApp(manifest)['dgfy-pos'], SHA('d'));
  assert.equal(resolveCandidateSourceShaByApp(manifest)['dgfy-ims'], SHA('b'));
});

test('v4: reports active and superseded staging selections and marks old observation stale', () => {
  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'), status: 'staging_soak', release_revision: null,
    staging_refresh: [{ refresh_seq: 1, source_develop_sha: SHA('f'), sha: SHA('d'), parent_sha: SHA('c'), base_staging_sha: SHA('9'), branch: 'to-staging/2026-09-04-01-refresh-1', pr: 1, reason: 'later develop update', apps_touched: ['dgfy-pos'], artifacts: [{ app: 'dgfy-pos', revision: 2, source_sha: SHA('d'), digest: DIGEST('8'), origin: 'staging_refresh' }] }],
    current_staging_sha: SHA('d'),
    revisions: [{ ...candidateV3().revisions[0], base_staging_sha: SHA('8') }, ...candidateV3().revisions.slice(1)],
    staging_observation: { sha: SHA('c'), run_id: 123, observed_at: '2026-10-09T00:00:00Z', result: 'pass' },
  });
  const result = validatePromotionCandidate(manifest);
  assert.equal(result.active_staging_sha, SHA('d'));
  assert.deepEqual(result.superseded_staging_shas, [SHA('a'), SHA('b'), SHA('c')]);
  assert.equal(result.initial_base_staging_sha, SHA('8'));
  assert.equal(result.staging_observation_current, false);
});

test('v4: observation is optional for legacy manifests and must match a recorded release cut', () => {
  const legacy = candidateV3({ schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e') });
  assert.equal(validatePromotionCandidate(legacy).staging_observation_current, false);

  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'),
    staging_observation: { sha: SHA('c'), run_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/123', observed_at: '2026-10-09T00:00:00Z', result: 'pass' },
  });
  assert.equal(validatePromotionCandidate(manifest).staging_observation_current, true);
  manifest.staging_observation.sha = SHA('b');
  assert.throws(() => validatePromotionCandidate(manifest), /must match release_revision.source_staging_sha/);
});

test('v4: validates optional predecessor candidate and initial physical staging base', () => {
  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'), predecessor_candidate_id: '2026-10-08-02',
    revisions: [{ ...candidateV3().revisions[0], base_staging_sha: SHA('9') }, ...candidateV3().revisions.slice(1)],
  });
  assert.equal(validatePromotionCandidate(manifest).initial_base_staging_sha, SHA('9'));
  manifest.predecessor_candidate_id = manifest.candidate_id;
  assert.throws(() => validatePromotionCandidate(manifest), /must differ from candidate_id/);
});

test('v4: rejects branch-name-only refresh bypass and duplicate refresh SHA', () => {
  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'), status: 'staging_soak', release_revision: null,
    staging_refresh: [{ refresh_seq: 1, source_develop_sha: SHA('f'), sha: SHA('d'), parent_sha: SHA('c'), base_staging_sha: SHA('9'), branch: 'to-staging/2026-09-04-01-refresh-1', pr: 1, reason: 'refresh', apps_touched: ['dgfy-pos'], artifacts: [{ app: 'dgfy-pos', revision: 2, source_sha: SHA('d'), digest: DIGEST('8'), origin: 'staging_refresh' }] }],
    current_staging_sha: SHA('d'),
  });
  assert.equal(validatePromotionCandidate(manifest).refresh_count, 1);
  manifest.staging_refresh[0].branch = 'to-staging/2026-09-04-01';
  assert.throws(() => validatePromotionCandidate(manifest), /must use to-staging\/2026-09-04-01-refresh-1/);
  manifest.staging_refresh[0].branch = 'to-staging/2026-09-04-01-refresh-1';
  manifest.staging_refresh[0].sha = SHA('b');
  assert.throws(() => validatePromotionCandidate(manifest), /duplicate revision SHA/);
});

test('v4: resolves app provenance across repairs interleaved with refreshes', () => {
  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'), status: 'staging_soak', release_revision: null,
    revisions: [
      { kind: 'initial', sha: SHA('a'), parent_sha: null, branch: 'to-staging/2026-09-04-01', pr: 2001, apps_touched: ['dgfy-pos'] },
      { kind: 'staging_repair', repair_seq: 1, sha: SHA('b'), parent_sha: SHA('a'), branch: 'fix/staging/2026-09-04-01-1', pr: 2002, issue: 3002, apps_touched: ['dgfy-ims'] },
      { kind: 'staging_repair', repair_seq: 2, sha: SHA('d'), parent_sha: SHA('c'), branch: 'fix/staging/2026-09-04-01-2', pr: 2004, issue: 3004, apps_touched: ['dgfy-pos'] },
    ],
    staging_refresh: [{ refresh_seq: 1, source_develop_sha: SHA('f'), sha: SHA('c'), parent_sha: SHA('b'), base_staging_sha: SHA('9'), branch: 'to-staging/2026-09-04-01-refresh-1', pr: 2003, reason: 'refresh', apps_touched: ['dgfy-pos'], artifacts: [{ app: 'dgfy-pos', revision: 2, source_sha: SHA('c'), digest: DIGEST('8'), origin: 'staging_refresh' }] }],
    current_staging_sha: SHA('d'),
  });
  assert.equal(validatePromotionCandidate(manifest).current_staging_sha, SHA('d'));
  const sources = resolveCandidateSourceShaByApp(manifest);
  assert.equal(sources['dgfy-ims'], SHA('b'));
  assert.equal(sources['dgfy-pos'], SHA('d'));
});

test('v4: a release history record merged to main makes refresh invalid', () => {
  const prior = candidateV3().release_revision;
  const manifest = candidateV3({
    schema: 'sku-release-candidate/v4', promotion_base_sha: SHA('e'), status: 'refresh_in_progress', release_revision: null,
    refresh_in_progress: { refresh_seq: 1, reason: 'deferred production' },
    release_history: [{ release_revision: prior, superseded_at: '2026-10-06T00:00:00Z', reason: 'refresh', main_merge_sha: SHA('f') }],
  });
  assert.throws(() => validatePromotionCandidate(manifest), (error) => error.code === 'REFRESH_AFTER_MAIN_MERGE');
});

test('v4: an archived release selection cannot be restored as active after refresh', () => {
  const active = candidateV3();
  active.schema = 'sku-release-candidate/v4';
  active.promotion_base_sha = SHA('e');
  active.release_history = [{ release_revision: structuredClone(active.release_revision), superseded_at: '2026-10-06T00:00:00Z', reason: 'refresh', main_merge_sha: null }];
  assert.throws(() => validatePromotionCandidate(active), (error) => error.code === 'ARCHIVED_RELEASE_RESELECTED');
});

test('v3: accepts optional SHA-bound quality evidence and leaves it optional', () => {
  const withoutEvidence = candidateV3();
  assert.equal(validatePromotionCandidate(withoutEvidence).candidate_id, '2026-09-04-01');

  const withEvidence = candidateV3({
    quality_check: {
      sha: SHA('c'),
      run_id: 37100411642,
      run_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/37100411642',
      dispatched_at: '2026-10-03T12:00:00Z',
      result: 'had-advisory-failures',
    },
  });
  assert.equal(validatePromotionCandidate(withEvidence).quality_check_current, true);
  withEvidence.staging_head_sha = SHA('d');
  withEvidence.release_revision.source_staging_sha = SHA('d');
  assert.equal(validatePromotionCandidate(withEvidence).quality_check_current, false);
});

test('v3: rejects malformed optional quality evidence', () => {
  const manifest = candidateV3({ quality_check: { sha: 'not-a-sha' } });
  assert.throws(() => validatePromotionCandidate(manifest), /quality_check.sha must be a lowercase 40-character Git SHA/);
});

test('v3: rejects unsupported quality evidence outcomes', () => {
  const manifest = candidateV3({ quality_check: {
    sha: SHA('a'), run_id: 1,
    run_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/1',
    dispatched_at: '2026-10-03T12:00:00Z', result: 'failure',
  } });
  assert.throws(() => validatePromotionCandidate(manifest), /quality_check.result must be clean or had-advisory-failures/);
});

test('v3: requires initial apps_touched and rejects DEV-origin artifacts', () => {
  const missing = candidateV3();
  delete missing.revisions[0].apps_touched;
  assert.throws(() => validatePromotionCandidate(missing), /must declare a non-empty apps_touched/);

  const selectedDev = candidateV3();
  selectedDev.revisions[0].dev_artifacts = [];
  assert.throws(() => validatePromotionCandidate(selectedDev), /must not select DEV artifacts/);

  const devOrigin = candidateV3();
  devOrigin.release_revision.apps['dgfy-ims'].origin = 'dev';
  assert.throws(() => validatePromotionCandidate(devOrigin), /must be one of promotion, staging_repair, release_repair/);
});

function addReleaseRepairs(manifest, repairs) {
  manifest.release_revision.repairs = repairs;
  const latestByApp = {};
  for (const repair of repairs) {
    for (const app of repair.apps_touched || []) latestByApp[app] = repair.sha;
  }
  for (const [app, sha] of Object.entries(latestByApp)) {
    manifest.release_revision.apps[app].source_sha = sha;
    manifest.release_revision.apps[app].origin = 'release_repair';
    manifest.release_revision.apps[app].digest = DIGEST('7');
  }
  return manifest;
}

test('v3: validates release-only repair chain, repeated repairs, and latest per-app identity', () => {
  const manifest = addReleaseRepairs(candidateV3(), [
    { repair_seq: 1, sha: SHA('d'), parent_sha: SHA('c'), branch: 'fix/release/2026-09-04-01-1', pr: 2101, issue: 3101, apps_touched: ['dgfy-ims'] },
    { repair_seq: 2, sha: SHA('e'), parent_sha: SHA('d'), branch: 'fix/release/2026-09-04-01-2', pr: 2102, issue: 3102, apps_touched: ['dgfy-ims'] },
    { repair_seq: 3, sha: SHA('f'), parent_sha: SHA('e'), branch: 'fix/release/2026-09-04-01-3', pr: 2103, issue: 3103, apps_touched: ['dgfy-api', 'dgfy-migration-runner'] },
  ]);

  validatePromotionCandidate(manifest);
  const byApp = resolveCandidateSourceShaByApp(manifest);
  assert.equal(byApp['dgfy-ims'], SHA('e'));
  assert.equal(byApp['dgfy-api'], SHA('f'));
  assert.equal(byApp['dgfy-migration-runner'], SHA('f'));
  assert.equal(byApp['dgfy-pos'], SHA('a'));
  assert.equal(manifest.release_revision.apps['dgfy-ims'].origin, 'release_repair');
});

test('v3: rejects stale parent, non-sequential repair, and incomplete release-repair metadata', () => {
  const validRepair = { repair_seq: 1, sha: SHA('d'), parent_sha: SHA('c'), branch: 'fix/release/2026-09-04-01-1', pr: 2101, issue: 3101, apps_touched: ['dgfy-ims'] };

  const stale = addReleaseRepairs(candidateV3(), [{ ...validRepair, parent_sha: SHA('b') }]);
  assert.throws(() => validatePromotionCandidate(stale), /must point to the previous release SHA/);

  const nonSequential = addReleaseRepairs(candidateV3(), [{ ...validRepair, repair_seq: 2 }]);
  assert.throws(() => validatePromotionCandidate(nonSequential), /Release repair sequences must be sequential; expected 1/);

  for (const field of ['apps_touched', 'pr', 'issue']) {
    const incompleteRepair = { ...validRepair };
    delete incompleteRepair[field];
    const incomplete = addReleaseRepairs(candidateV3(), [incompleteRepair]);
    assert.throws(() => validatePromotionCandidate(incomplete), field === 'apps_touched' ? /must declare a non-empty apps_touched array/ : /must identify its/);
  }
});

test('v3: release_repair source_sha is validated against release repair lineage', () => {
  const manifest = addReleaseRepairs(candidateV3(), [
    { repair_seq: 1, sha: SHA('d'), parent_sha: SHA('c'), branch: 'fix/release/2026-09-04-01-1', pr: 2101, issue: 3101, apps_touched: ['dgfy-ims'] },
  ]);
  validatePromotionCandidate(manifest);
  manifest.release_revision.apps['dgfy-ims'].source_sha = SHA('e');
  assert.throws(() => validatePromotionCandidate(manifest), /source_sha must match its candidate apps_touched lineage/);
});

test('v3: permits independent paired backend revisions, rejects one-sided map entries and source lineage mismatch', () => {
  const manifest = candidateV3();
  assert.equal(manifest.release_revision.apps['dgfy-api'].revision, 8);
  assert.equal(manifest.release_revision.apps['dgfy-migration-runner'].revision, 9);
  assert.equal(validatePromotionCandidate(manifest).release_revision['dgfy-api'].revision, 8);

  const oneSided = candidateV3();
  delete oneSided.release_revision.apps['dgfy-migration-runner'];
  oneSided.revisions[0].apps_touched = ['dgfy-ims'];
  oneSided.revisions[2].apps_touched = ['dgfy-ims'];
  assert.throws(() => validatePromotionCandidate(oneSided), /must include dgfy-api and dgfy-migration-runner.*together/);

  const wrongSource = candidateV3();
  wrongSource.release_revision.apps['dgfy-migration-runner'].source_sha = SHA('b');
  assert.throws(() => validatePromotionCandidate(wrongSource), /source_sha must match its candidate apps_touched lineage/);
});

test('v2: accepts a frozen candidate with per-app revisions, repair_seq branches, and a plain release branch', () => {
  assert.deepEqual(validatePromotionCandidate(candidateV2()), {
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: SHA('a'),
    current_staging_sha: SHA('c'),
    staging_head_sha: SHA('c'),
    repair_count: 2,
    release_revision: {
      'dgfy-ims': { revision: 5, source_sha: SHA('b'), digest: DIGEST('4'), origin: 'staging_repair' },
      'dgfy-api': { revision: 8, source_sha: SHA('c'), digest: DIGEST('5'), origin: 'staging_repair' },
      'dgfy-migration-runner': { revision: 9, source_sha: SHA('c'), digest: DIGEST('6'), origin: 'staging_repair' },
    },
  });
});

test('v2: accepts a staging-soak candidate with no release cut yet', () => {
  const manifest = candidateV2();
  manifest.status = 'staging_soak';
  manifest.release_revision = null;
  const result = validatePromotionCandidate(manifest);
  assert.equal(result.release_revision, null);
  assert.equal(result.repair_count, 2);
});

test('v2: rejects a v1-style candidate-wide revision field on a repair (repair_seq is cosmetic only)', () => {
  const manifest = candidateV2();
  manifest.revisions[1].revision = 1;
  assert.throws(() => validatePromotionCandidateV2(manifest), /must not carry the v1 candidate-wide revision field/);
});

test('v2: rejects old -rN repair and release branch names', () => {
  const repair = candidateV2();
  repair.revisions[1].branch = 'fix/staging/2026-09-04-01-r1';
  assert.throws(() => validatePromotionCandidate(repair), /must use fix\/staging\/2026-09-04-01-1/);

  const release = candidateV2();
  release.release_revision.branch = 'release/2026-09-04-01-r3';
  assert.throws(() => validatePromotionCandidate(release), /must use release\/2026-09-04-01/);
});

test('v2: rejects a non-sequential repair_seq', () => {
  const manifest = candidateV2();
  manifest.revisions[2].repair_seq = 4;
  assert.throws(() => validatePromotionCandidate(manifest), /Repair sequences must be sequential; expected 2/);
});

test('v2: rejects the v3-only release repair array', () => {
  const manifest = candidateV2();
  manifest.release_revision.repairs = [];
  assert.throws(() => validatePromotionCandidate(manifest), /supported only by sku-release-candidate\/v3/);
});

test('v2: rejects missing/duplicate/unrecognized dev_artifacts', () => {
  const missing = candidateV2();
  delete missing.revisions[0].dev_artifacts;
  assert.throws(() => validatePromotionCandidate(missing), /must select at least one published DEV artifact/);

  const duplicate = candidateV2();
  duplicate.revisions[0].dev_artifacts.push({ app: 'dgfy-ims', revision: 6, sha: SHA('a'), digest: DIGEST('7') });
  assert.throws(() => validatePromotionCandidate(duplicate), /lists dgfy-ims more than once/);

  const badDigest = candidateV2();
  badDigest.revisions[0].dev_artifacts[0].digest = 'sha256:zzz';
  assert.throws(() => validatePromotionCandidate(badDigest), /must be a sha256/);

  const badRevision = candidateV2();
  badRevision.revisions[0].dev_artifacts[0].revision = 0;
  assert.throws(() => validatePromotionCandidate(badRevision), /must be a positive integer/);
});

test('v2: rejects release apps with bad digest, bad origin, or unrecognized app', () => {
  const badDigest = candidateV2();
  badDigest.release_revision.apps['dgfy-ims'].digest = 'not-a-digest';
  assert.throws(() => validatePromotionCandidate(badDigest), /must be a sha256/);

  const badPromotionOrigin = candidateV2();
  badPromotionOrigin.release_revision.apps['dgfy-ims'].origin = 'promotion';
  assert.throws(() => validatePromotionCandidate(badPromotionOrigin), /must be one of dev, staging_repair/);

  const badOrigin = candidateV2();
  badOrigin.release_revision.apps['dgfy-ims'].origin = 'candidate';
  assert.throws(() => validatePromotionCandidate(badOrigin), /must be one of dev, staging_repair/);

  const badApp = candidateV2();
  badApp.release_revision.apps['dgfy-not-a-real-app'] = { revision: 1, source_sha: SHA('a'), digest: DIGEST('1'), origin: 'dev' };
  assert.throws(() => validatePromotionCandidate(badApp), /unrecognized app/);

  const empty = candidateV2();
  empty.release_revision.apps = {};
  assert.throws(() => validatePromotionCandidate(empty), /must name at least one app/);
});

test('v2: an app the candidate never rebuilds is simply absent from the map', () => {
  const manifest = candidateV2();
  assert.equal(getAppRevision(manifest, 'dgfy-pos'), null);
  assert.deepEqual(getAppRevision(manifest, 'dgfy-ims'), { revision: 5, source_sha: SHA('b'), digest: DIGEST('4'), origin: 'staging_repair' });
});

test('getAppRevision: v1 manifests and missing maps return null (legacy integer path applies)', () => {
  assert.equal(getAppRevision(candidate(), 'dgfy-ims'), null);
  const soak = candidateV2();
  soak.release_revision = null;
  assert.equal(getAppRevision(soak, 'dgfy-ims'), null);
});

test('v2: per-app candidate source identity still resolves via apps_touched, unchanged from v1', () => {
  const byApp = resolveCandidateSourceShaByApp(candidateV2());
  assert.equal(byApp['dgfy-ims'], SHA('b'));
  assert.equal(byApp['dgfy-pos'], SHA('a'));
  assert.equal(byApp['dgfy-api'], SHA('c'));
});

test('v1 manifests still validate exactly as before (frozen legacy path)', () => {
  assert.equal(validatePromotionCandidate(candidate()).release_revision, 3);
  assert.throws(() => validatePromotionCandidate(candidate({ schema: 'sku-release-candidate/v9' })), /must be one of sku-release-candidate\/v1, sku-release-candidate\/v2, sku-release-candidate\/v3/);
});
