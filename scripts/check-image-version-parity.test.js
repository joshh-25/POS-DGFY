const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CANDIDATE_SOURCE_LABEL,
  inspectImageLabel,
  inspectImageDigest,
  inspectImageRevision,
  decideParity,
  decideDirectParity,
  decideRevisionParity,
  checkApp,
  checkAppRevision,
  checkAppDirect,
  runParityCheck,
  runDirectParityCheck,
  parseArgs,
} = require('./check-image-version-parity');

const { RELEASE_REVISION_LABEL } = require('./promote-image-alias');

// #1588 (epic #1548 Wave 4, Phase 279) -- ADR 0081 Decision 8's promotion parity gate. Every case
// here mocks `docker buildx imagetools inspect` output directly (status/stdout/stderr fixtures) via
// an injected inspectFn; none of these tests shell out to `docker`, touch a real registry, or touch
// real git history (checkApp's own tests inject a fake readVersionAt-equivalent by controlling
// candidateSha/inspectFn only -- see the runParityCheck test below for the one place a real repoRoot
// is used, against this repo's own git history, which is a legitimate fixture for "does this
// resolve at all", not a network call).
//
// PR #1590 review (RF-2, RF-3) added: the 'no-label' vs 'inconsistent' state split on
// inspectImageLabel, decideParity's corrected staging-side handling and new prod-side
// no-candidate-identity pass, and the whole --source-sha/decideDirectParity/checkAppDirect/
// runDirectParityCheck direct-mode surface -- see that file's header comment for the full outcome
// tables these tests exercise.

const SHA = (digit) => String(digit).repeat(40);

function inspectFixture({ status = 0, stdout = '', stderr = '' }) {
  return () => ({ status, stdout, stderr });
}

function agreeingLabelJson(value) {
  return JSON.stringify({ Image: { Config: { Labels: { [CANDIDATE_SOURCE_LABEL]: value } } } });
}

test('inspectImageLabel: tag not found -> not-found', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-api',
    tag: '1.3.0-staging',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({ status: 1, stderr: 'ghcr.io/sieitzz/dgfy-api:1.3.0-staging: not found' }),
  });
  assert.equal(result.state, 'not-found');
});

test('inspectImageLabel: an auth failure is never treated as not-found -> error', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-api',
    tag: '1.3.0',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({ status: 1, stderr: 'unexpected status from HEAD request: 401 Unauthorized' }),
  });
  assert.equal(result.state, 'error');
});

test('inspectImageLabel: label present and readable -> ok, with the value', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-api',
    tag: '1.3.0',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({ stdout: agreeingLabelJson(SHA('a')) }),
  });
  assert.deepEqual(result, { ref: 'ghcr.io/sieitzz/dgfy-api:1.3.0', state: 'ok', value: SHA('a') });
});

test('inspectImageLabel: image exists but the label is missing entirely -> no-label (distinct from inconsistent)', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-api',
    tag: '1.3.0',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({ stdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'x' } } } }) }),
  });
  assert.equal(result.state, 'no-label');
});

test('inspectImageLabel: multi-platform image with disagreeing labels -> inconsistent', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-migration-runner',
    tag: '1.3.0',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({
      stdout: JSON.stringify({
        Image: {
          'linux/amd64': { config: { Labels: { [CANDIDATE_SOURCE_LABEL]: SHA('a') } } },
          'linux/arm64': { config: { Labels: { [CANDIDATE_SOURCE_LABEL]: SHA('b') } } },
        },
      }),
    }),
  });
  assert.equal(result.state, 'inconsistent');
});

test('inspectImageLabel: one platform readable, the other missing the label entirely -> inconsistent, not no-label', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-migration-runner',
    tag: '1.3.0',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({
      stdout: JSON.stringify({
        Image: {
          'linux/amd64': { config: { Labels: { [CANDIDATE_SOURCE_LABEL]: SHA('a') } } },
          'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'x' } } },
        },
      }),
    }),
  });
  assert.equal(result.state, 'inconsistent');
});

// decideParity (manifest mode) -- the file header's full outcome table, including the RF-2/RF-3
// corrections from PR #1590's review.

test('decideParity: matching candidate-source-sha on both images -> pass/match', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') };
  assert.deepEqual(decideParity({ prod, staging }), {
    verdict: 'pass',
    code: 'match',
    detail: 'x:1.3.0-staging and x:1.3.0 share candidate-source-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.',
  });
});

// PR #1612 review RF-2 (supersedes the PR #1590 RF-3-era test of the same name): manifest mode
// implies a real to-staging/<id> leg that always publishes a labeled staging image, so a missing
// staging predecessor here is a real gap, not #1007/hotfix evidence -- that case is
// decideDirectParity's job now, exercised separately below.
test('decideParity: RF-2 -- prod exists, no staging predecessor at all -> fail/staging-not-found-in-manifest-mode, not a silent pass', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'not-found', reason: 'tag does not exist' };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'staging-not-found-in-manifest-mode');
  assert.match(verdict.detail, /manifest mode expects one/);
});

// RF-3 regression test (PR #1590 review): an existing STAGING image whose label is missing was
// previously misclassified as 'no-staging-predecessor' (a silent pass) -- the normal promotion path
// always stamps STAGING, so this must now fail as a real label-stamping regression instead.
test('decideParity: RF-3 -- staging image EXISTS but its label is missing entirely -> fail/staging-unreadable, not a silent pass', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'no-label', reason: 'label not present anywhere on x:1.3.0-staging' };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'staging-unreadable');
  assert.match(verdict.detail, /label-stamping regression/);
});

test('decideParity: RF-3 -- staging image EXISTS but its label is inconsistent across platforms -> fail/staging-unreadable', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'inconsistent', reason: 'disagrees across platforms' };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'staging-unreadable');
});

test('decideParity: both exist, labels disagree -> fail/mismatch', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('b') };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'mismatch');
});

test('decideParity: prod not published at all -> skip, not pass or fail', () => {
  const prod = { ref: 'x:1.3.0', state: 'not-found', reason: 'tag does not exist' };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') };
  assert.deepEqual(decideParity({ prod, staging }), {
    verdict: 'skip',
    code: 'prod-not-found',
    detail: 'x:1.3.0 has not been published yet -- nothing to verify.',
  });
});

test('decideParity: prod image exists but its own label is inconsistent -> fail, not a silent pass', () => {
  const prod = { ref: 'x:1.3.0', state: 'inconsistent', reason: 'disagrees across platforms' };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'prod-unreadable');
});

// PR #1612 review RF-2 (supersedes the PR #1590 RF-2-era test of the same name): the "no tracked
// candidate identity" evidence-pass is now decideDirectParity's job exclusively (--source-sha mode,
// exercised separately below) -- manifest mode always expects a real label, so this must fail.
test('decideParity: RF-2 -- prod carries no candidate label at all -> fail/prod-no-label-in-manifest-mode, not a silent pass', () => {
  const prod = { ref: 'x:1.3.0', state: 'no-label', reason: 'label not present anywhere on x:1.3.0' };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'prod-no-label-in-manifest-mode');
  assert.match(verdict.detail, /manifest mode expects one/);
});

test('decideParity: an inspect error on either side refuses to guess -> error, not pass', () => {
  const prodError = decideParity({
    prod: { ref: 'x:1.3.0', state: 'error', reason: 'network blip' },
    staging: { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') },
  });
  assert.equal(prodError.verdict, 'error');

  const stagingError = decideParity({
    prod: { ref: 'x:1.3.0', state: 'ok', value: SHA('a') },
    staging: { ref: 'x:1.3.0-staging', state: 'error', reason: 'network blip' },
  });
  assert.equal(stagingError.verdict, 'error');
});

// decideDirectParity (--source-sha mode, RF-2) -- no staging inspect at all; prod is compared
// directly against the caller-supplied expected SHA.

test('decideDirectParity: prod label matches the expected source SHA -> pass/match', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  assert.deepEqual(decideDirectParity({ prod, expectedSha: SHA('a') }), {
    verdict: 'pass',
    code: 'match',
    detail: 'x:1.3.0 carries candidate-source-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, matching the expected direct-promotion source SHA.',
  });
});

test('decideDirectParity: prod label present but does not match the expected source SHA -> fail/mismatch', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const verdict = decideDirectParity({ prod, expectedSha: SHA('b') });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'mismatch');
});

test('decideDirectParity: prod carries no candidate label at all -> pass/no-candidate-identity (the ordinary hotfix result)', () => {
  const prod = { ref: 'x:1.3.0', state: 'no-label', reason: 'label not present anywhere on x:1.3.0' };
  const verdict = decideDirectParity({ prod, expectedSha: SHA('a') });
  assert.equal(verdict.verdict, 'pass');
  assert.equal(verdict.code, 'no-candidate-identity');
});

test('decideDirectParity: prod label inconsistent across platforms -> fail/prod-unreadable', () => {
  const prod = { ref: 'x:1.3.0', state: 'inconsistent', reason: 'disagrees across platforms' };
  const verdict = decideDirectParity({ prod, expectedSha: SHA('a') });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'prod-unreadable');
});

test('decideDirectParity: prod not published -> skip', () => {
  const prod = { ref: 'x:1.3.0', state: 'not-found', reason: 'tag does not exist' };
  const verdict = decideDirectParity({ prod, expectedSha: SHA('a') });
  assert.equal(verdict.verdict, 'skip');
  assert.equal(verdict.code, 'prod-not-found');
});

test('decideDirectParity: inspect error refuses to guess -> error', () => {
  const prod = { ref: 'x:1.3.0', state: 'error', reason: 'network blip' };
  const verdict = decideDirectParity({ prod, expectedSha: SHA('a') });
  assert.equal(verdict.verdict, 'error');
});

// checkApp / checkAppDirect -- wire a fixed SHA through readVersionAt (real git, this repo's own
// history) and the inspect(s) (fixture-injected) -- confirm the app-level orchestration shape, not
// the pure decision functions again.

test('checkApp: an app whose version cannot be read at the candidate SHA -> error, not a crash', () => {
  const result = checkApp({
    repoRoot: __dirname + '/..',
    app: 'dgfy-api',
    candidateSha: SHA('9'), // a SHA that does not exist in this repo's history
    inspectFn: inspectFixture({ status: 1, stderr: 'not found' }),
  });
  assert.equal(result.verdict, 'error');
  assert.equal(result.code, 'version-unreadable');
});

test('checkAppDirect: an app whose version cannot be read at the given source SHA -> error, not a crash', () => {
  const result = checkAppDirect({
    repoRoot: __dirname + '/..',
    app: 'dgfy-api',
    sourceSha: SHA('9'),
    inspectFn: inspectFixture({ status: 1, stderr: 'not found' }),
  });
  assert.equal(result.verdict, 'error');
  assert.equal(result.code, 'version-unreadable');
});

// runParityCheck -- the manifest-driven CLI entrypoint. Uses this repo's real HEAD as the
// candidate SHA (a real, resolvable commit) so readVersionAt succeeds, with every docker inspect
// call still fixture-injected -- no live registry call, no live docker daemon required.

// #1977 (Phase 341): a manifest WITH a release_revision takes the revision-aware path --
// frontend staging X.Y.Z-rN-staging vs production X.Y.Z-rN (backend: env-neutral X.Y.Z-rN
// both sides), plus the bare floor alias on the same digest. The fixture below carries the
// full Phase 341 label set on every ref, so staging/prod/alias all agree.
function revisionFixture({ sourceSha, digest = 'sha256:revision-fixture-digest', revision = 'r1', floor = '9.9.9' }) {
  return JSON.stringify({
    digest,
    Image: {
      Config: {
        Labels: {
          [CANDIDATE_SOURCE_LABEL]: sourceSha,
          'org.opencontainers.image.version': `${floor}-${revision}`,
          'org.dgfy-platform.release-floor': floor,
          [RELEASE_REVISION_LABEL]: revision,
        },
      },
    },
  });
}

test('runParityCheck: validates the manifest and reports one entry per app, all pass on a fully matching fixture', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const manifest = {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: headSha,
    current_staging_sha: headSha,
    staging_head_sha: headSha,
    revisions: [
      { kind: 'initial', sha: headSha, parent_sha: null, branch: 'to-staging/2026-09-04-01' },
    ],
    release_revision: { revision: 1, source_staging_sha: headSha, branch: 'release/2026-09-04-01-r1', pr: 9001 },
  };

  const result = runParityCheck({
    manifest,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn: inspectFixture({ stdout: revisionFixture({ sourceSha: headSha, revision: 'r1' }) }),
  });

  assert.equal(result.mode, 'manifest');
  assert.equal(result.candidate_id, '2026-09-04-01');
  assert.equal(result.candidate_source_sha, headSha);
  assert.equal(result.release_revision, 1);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].verdict, 'pass');
  assert.equal(result.results[0].code, 'match');
  assert.equal(result.results[0].revision, 1);
});

// PR #1612 review RF-2's explicitly requested end-to-end fixture: an unlabeled PROD image must not
// pass manifest mode, even though a staging predecessor exists (the exact gap the old prod-side
// 'no-label' PASS branch left open -- see decideParity's own regression test above for the unit-
// level case; this proves it through the real CLI entrypoint, inspectFn included).
test('runParityCheck: an unlabeled PROD image cannot pass, even with a real staging predecessor', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const manifest = {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: headSha,
    current_staging_sha: headSha,
    staging_head_sha: headSha,
    revisions: [
      { kind: 'initial', sha: headSha, parent_sha: null, branch: 'to-staging/2026-09-04-01' },
    ],
    release_revision: { revision: 1, source_staging_sha: headSha, branch: 'release/2026-09-04-01-r1', pr: 9001 },
  };

  // #1977: dgfy-api is a backend app, so its staging and production tags are the SAME
  // environment-neutral revision tag -- the branch below keys on the revision fragment instead:
  // revision-tag refs get no candidate-source label at all (simulating a normal-dispatch run
  // with an empty/incorrect candidate_source_sha input); the bare floor alias is labeled.
  const inspectFn = (ref) => ({
    status: 0,
    stdout: /-r1$/.test(ref)
      ? JSON.stringify({ digest: 'sha256:unlabeled-prod', Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'x' } } } })
      : revisionFixture({ sourceSha: headSha, revision: 'r1' }),
    stderr: '',
  });

  const result = runParityCheck({
    manifest,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn,
  });

  assert.equal(result.ok, false);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].verdict, 'fail');
  assert.equal(result.results[0].code, 'prod-no-label-in-manifest-mode');
});

test('runParityCheck: an invalid manifest throws PromotionCandidateError, same validation as check-promotion-candidate.js', () => {
  assert.throws(
    () => runParityCheck({ manifest: { schema: 'not-the-right-schema' } }),
    /Candidate manifest schema must be sku-release-candidate\/v1/,
  );
});

// #1610 regression: a repair that touches only some apps must not make an untouched app's PROD
// build compare against the candidate's LATEST current_staging_sha -- it must compare against the
// SHA of the last revision that actually touched that specific app (resolveCandidateSourceShaByApp).
// Uses this repo's real HEAD~1/HEAD as two resolvable SHAs (like the other runParityCheck tests) so
// readVersionAt succeeds without a live checkout of a synthetic history.
test('runParityCheck: an app untouched by a repair is compared against ITS OWN prior identity, not the manifest-wide current_staging_sha', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();
  const initialSha = execSync('git rev-parse HEAD~1', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const manifest = {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-05-01',
    status: 'qualified',
    source_develop_sha: initialSha,
    current_staging_sha: headSha,
    staging_head_sha: headSha,
    revisions: [
      { kind: 'initial', sha: initialSha, parent_sha: null, branch: 'to-staging/2026-09-05-01' },
      // Only dgfy-ims was touched by this repair -- dgfy-api was not.
      { kind: 'staging_repair', revision: 1, sha: headSha, parent_sha: initialSha, branch: 'fix/staging/2026-09-05-01-r1', pr: 9002, issue: 9003, apps_touched: ['dgfy-ims'] },
    ],
    release_revision: { revision: 2, source_staging_sha: headSha, branch: 'release/2026-09-05-01-r2', pr: 9004 },
  };

  // checkApp() records candidate_source_sha unconditionally regardless of the inspect outcome, so
  // this fixture only needs to not crash -- the assertions below are on WHICH sha was resolved per
  // app, not on the pass/fail verdict itself.
  const result = runParityCheck({
    manifest,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api', 'dgfy-ims'],
    inspectFn: inspectFixture({ stdout: agreeingLabelJson(initialSha) }),
  });

  const apiEntry = result.results.find((entry) => entry.app === 'dgfy-api');
  const imsEntry = result.results.find((entry) => entry.app === 'dgfy-ims');

  // The bug this regresses: dgfy-api was untouched by the repair, so its resolved candidate source
  // identity must stay the INITIAL sha, not advance to the repair's (== current_staging_sha) value.
  assert.equal(apiEntry.candidate_source_sha, initialSha);
  assert.equal(imsEntry.candidate_source_sha, headSha);
  // Top-level candidate_source_sha stays the manifest's overall latest identity -- context only, not
  // what every app was actually compared against (see each entry's own field instead).
  assert.equal(result.candidate_source_sha, headSha);
});

// runDirectParityCheck (--source-sha mode, RF-2) -- the #1007/hotfix entrypoint that never needs a
// candidate manifest at all. Same real-HEAD-as-fixture pattern as runParityCheck above.

test('runDirectParityCheck: reports one entry per app against a real, resolvable source SHA, no manifest required', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const result = runDirectParityCheck({
    sourceSha: headSha,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn: inspectFixture({ stdout: agreeingLabelJson(headSha) }),
  });

  assert.equal(result.mode, 'direct');
  assert.equal(result.candidate_id, null);
  assert.equal(result.candidate_source_sha, headSha);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].verdict, 'pass');
  assert.equal(result.results[0].code, 'match');
});

test('runDirectParityCheck: an untracked PROD image (no candidate label at all) still passes -- the ordinary hotfix result', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const result = runDirectParityCheck({
    sourceSha: headSha,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn: inspectFixture({ stdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'x' } } } }) }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.results[0].code, 'no-candidate-identity');
});

test('runDirectParityCheck: throws without a sourceSha, rather than silently no-op-ing', () => {
  assert.throws(() => runDirectParityCheck({ sourceSha: '' }), /--source-sha is required/);
});

// parseArgs -- --manifest and --source-sha are mutually exclusive, exactly one is required.

test('parseArgs: requires --manifest or --source-sha', () => {
  assert.throws(() => parseArgs([]), /Missing required option: --manifest .* or --source-sha/);
});

test('parseArgs: --manifest and --source-sha together is rejected', () => {
  assert.throws(
    () => parseArgs(['--manifest', 'candidate.json', '--source-sha', SHA('a')]),
    /mutually exclusive/,
  );
});

test('parseArgs: parses --manifest, --project-root, and --apps', () => {
  const options = parseArgs(['--manifest', 'candidate.json', '--project-root', '/tmp/x', '--apps', 'dgfy-api,dgfy-pos']);
  assert.equal(options.manifestPath, 'candidate.json');
  assert.equal(options.projectRoot, '/tmp/x');
  assert.deepEqual(options.apps, ['dgfy-api', 'dgfy-pos']);
});

test('parseArgs: parses --source-sha', () => {
  const options = parseArgs(['--source-sha', SHA('a'), '--apps', 'dgfy-api']);
  assert.equal(options.sourceSha, SHA('a'));
  assert.equal(options.manifestPath, '');
  assert.deepEqual(options.apps, ['dgfy-api']);
});

// #1977 (Phase 341) -- revision-aware parity: the release floor stays X.Y.Z while rN
// identifies the exact artifact. Frontend staging X.Y.Z-rN-staging vs production X.Y.Z-rN;
// backend the environment-neutral X.Y.Z-rN on both sides (same digest reused); every bare
// floor alias references its revision tag's digest with agreeing revision labels.

test('inspectImageDigest: digest present -> ok', () => {
  const result = inspectImageDigest({
    image: 'ghcr.io/sieitzz/dgfy-pos',
    tag: '1.13.0-r16',
    inspectFn: inspectFixture({ stdout: revisionFixture({ sourceSha: SHA('a') }) }),
  });
  assert.deepEqual(result, { ref: 'ghcr.io/sieitzz/dgfy-pos:1.13.0-r16', state: 'ok', digest: 'sha256:revision-fixture-digest' });
});

test('inspectImageDigest: tag not found -> not-found; other errors and digest-less output -> error', () => {
  assert.equal(inspectImageDigest({ image: 'x', tag: 't', inspectFn: inspectFixture({ status: 1, stderr: 'manifest unknown' }) }).state, 'not-found');
  assert.equal(inspectImageDigest({ image: 'x', tag: 't', inspectFn: inspectFixture({ status: 1, stderr: '401 Unauthorized' }) }).state, 'error');
  assert.equal(inspectImageDigest({ image: 'x', tag: 't', inspectFn: inspectFixture({ stdout: JSON.stringify({ Image: {} }) }) }).state, 'error');
});

test('inspectImageRevision: agreed label -> ok; missing -> no-label; disagreeing -> inconsistent', () => {
  const ok = inspectImageRevision({ image: 'x', tag: 't', inspectFn: inspectFixture({ stdout: revisionFixture({ sourceSha: SHA('a'), revision: 'r16' }) }) });
  assert.deepEqual(ok, { ref: 'x:t', state: 'ok', value: 'r16' });
  const missing = inspectImageRevision({ image: 'x', tag: 't', inspectFn: inspectFixture({ stdout: agreeingLabelJson(SHA('a')) }) });
  assert.equal(missing.state, 'no-label');
  const disagreeing = inspectImageRevision({
    image: 'x',
    tag: 't',
    inspectFn: inspectFixture({
      stdout: JSON.stringify({
        Image: {
          'linux/amd64': { config: { Labels: { [RELEASE_REVISION_LABEL]: 'r16' } } },
          'linux/arm64': { config: { Labels: { [RELEASE_REVISION_LABEL]: 'r15' } } },
        },
      }),
    }),
  });
  assert.equal(disagreeing.state, 'inconsistent');
});

function revisionVerdictInput(overrides = {}) {
  const base = {
    prod: { ref: 'img:1.13.0-r16', state: 'ok', value: SHA('a') },
    staging: { ref: 'img:1.13.0-r16-staging', state: 'ok', value: SHA('a') },
    prodDigest: { ref: 'img:1.13.0-r16', state: 'ok', digest: 'sha256:aaa' },
    aliasDigest: { ref: 'img:1.13.0', state: 'ok', digest: 'sha256:aaa' },
    prodRevision: { ref: 'img:1.13.0-r16', state: 'ok', value: 'r16' },
    aliasRevision: { ref: 'img:1.13.0', state: 'ok', value: 'r16' },
    expectedRevision: 'r16',
  };
  return { ...base, ...overrides };
}

test('decideRevisionParity: full agreement incl. alias digest -> pass/match', () => {
  assert.deepEqual(decideRevisionParity(revisionVerdictInput()), {
    verdict: 'pass',
    code: 'match',
    detail: `img:1.13.0-r16-staging and img:1.13.0-r16 share candidate-source-sha ${SHA('a')}; alias img:1.13.0 references the same digest sha256:aaa (r16).`,
  });
});

test('decideRevisionParity: missing alias -> fail alias-not-found (never a silent pass)', () => {
  const result = decideRevisionParity(revisionVerdictInput({ aliasDigest: { ref: 'img:1.13.0', state: 'not-found', reason: 'no such tag' } }));
  assert.equal(result.verdict, 'fail');
  assert.equal(result.code, 'alias-not-found');
});

test('decideRevisionParity: alias on a different digest -> fail alias-digest-mismatch', () => {
  const result = decideRevisionParity(revisionVerdictInput({ aliasDigest: { ref: 'img:1.13.0', state: 'ok', digest: 'sha256:bbb' } }));
  assert.equal(result.verdict, 'fail');
  assert.equal(result.code, 'alias-digest-mismatch');
});

test('decideRevisionParity: conflicting alias revision label -> fail alias-revision-mismatch', () => {
  const result = decideRevisionParity(revisionVerdictInput({ aliasRevision: { ref: 'img:1.13.0', state: 'ok', value: 'r15' } }));
  assert.equal(result.verdict, 'fail');
  assert.equal(result.code, 'alias-revision-mismatch');
});

test('decideRevisionParity: prod stamped with a different candidate revision -> fail revision-label-mismatch', () => {
  const result = decideRevisionParity(revisionVerdictInput({
    prodRevision: { ref: 'img:1.13.0-r16', state: 'ok', value: 'r15' },
    aliasRevision: { ref: 'img:1.13.0', state: 'ok', value: 'r15' },
  }));
  assert.equal(result.verdict, 'fail');
  assert.equal(result.code, 'revision-label-mismatch');
});

test('decideRevisionParity: frontend staging/prod label mismatch still fails as mismatch', () => {
  const result = decideRevisionParity(revisionVerdictInput({ staging: { ref: 'img:1.13.0-r16-staging', state: 'ok', value: SHA('b') } }));
  assert.equal(result.verdict, 'fail');
  assert.equal(result.code, 'mismatch');
});

test('decideRevisionParity: prod not published yet -> skip (nothing to verify)', () => {
  const result = decideRevisionParity(revisionVerdictInput({ prod: { ref: 'img:1.13.0-r16', state: 'not-found', reason: 'x' } }));
  assert.equal(result.verdict, 'skip');
});

test('runParityCheck: frontend/backend matrix -- staging tags differ by app type, prod tags agree', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const manifest = {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-19-01',
    status: 'qualified',
    source_develop_sha: headSha,
    current_staging_sha: headSha,
    staging_head_sha: headSha,
    revisions: [
      { kind: 'initial', sha: headSha, parent_sha: null, branch: 'to-staging/2026-09-19-01' },
    ],
    release_revision: { revision: 1, source_staging_sha: headSha, branch: 'release/2026-09-19-01-r1', pr: 9100 },
  };

  const seenRefs = [];
  const inspectFn = (ref) => {
    seenRefs.push(ref);
    return { status: 0, stdout: revisionFixture({ sourceSha: headSha, revision: 'r1' }), stderr: '' };
  };

  const result = runParityCheck({ manifest, repoRoot: __dirname + '/..', apps: ['dgfy-api', 'dgfy-pos'], inspectFn });

  assert.equal(result.ok, true);
  assert.equal(result.release_revision, 1);
  // Frontend staging is environment-qualified; backend staging is the env-neutral revision tag.
  assert.ok(seenRefs.some((ref) => ref.endsWith(':1.20.2-r1-staging') || /dgfy-pos:.*-r1-staging$/.test(ref)), `expected a dgfy-pos staging ref, saw: ${seenRefs.join(', ')}`);
  assert.ok(seenRefs.some((ref) => /dgfy-api:.*-r1$/.test(ref) && !ref.endsWith('-staging')), `expected a dgfy-api revision ref, saw: ${seenRefs.join(', ')}`);
  for (const entry of result.results) {
    assert.equal(entry.verdict, 'pass');
    assert.equal(entry.revision, 1);
  }
});

test('runParityCheck: conflicting alias digest fails the candidate (alias-digest-mismatch)', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const manifest = {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-19-02',
    status: 'qualified',
    source_develop_sha: headSha,
    current_staging_sha: headSha,
    staging_head_sha: headSha,
    revisions: [
      { kind: 'initial', sha: headSha, parent_sha: null, branch: 'to-staging/2026-09-19-02' },
    ],
    release_revision: { revision: 1, source_staging_sha: headSha, branch: 'release/2026-09-19-02-r1', pr: 9101 },
  };

  // Bare floor alias (no -r fragment) points at a STALE digest; everything else agrees.
  const inspectFn = (ref) => ({
    status: 0,
    stdout: /-r1(-staging)?$/.test(ref)
      ? revisionFixture({ sourceSha: headSha, revision: 'r1', digest: 'sha256:new-digest' })
      : revisionFixture({ sourceSha: headSha, revision: 'r1', digest: 'sha256:stale-digest' }),
    stderr: '',
  });

  const result = runParityCheck({ manifest, repoRoot: __dirname + '/..', apps: ['dgfy-api'], inspectFn });

  assert.equal(result.ok, false);
  assert.equal(result.results[0].verdict, 'fail');
  assert.equal(result.results[0].code, 'alias-digest-mismatch');
});

test('runDirectParityCheck: with --revision, the paired bare alias must share the revision digest', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const passing = runDirectParityCheck({
    sourceSha: headSha,
    revision: 3,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn: (ref) => ({
      status: 0,
      stdout: revisionFixture({ sourceSha: headSha, revision: 'r3' }),
      stderr: '',
    }),
  });
  assert.equal(passing.ok, true);
  assert.equal(passing.results[0].verdict, 'pass');

  const missingAlias = runDirectParityCheck({
    sourceSha: headSha,
    revision: 3,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn: (ref) => (/[0-9]-r3$/.test(ref) || /-r3-staging$/.test(ref)
      ? { status: 0, stdout: revisionFixture({ sourceSha: headSha, revision: 'r3' }), stderr: '' }
      : { status: 1, stdout: '', stderr: 'manifest unknown' }),
  });
  assert.equal(missingAlias.ok, false);
  assert.equal(missingAlias.results[0].code, 'alias-not-found');
});

test('checkAppRevision: unreadable floor version -> error, not a crash', () => {
  const result = checkAppRevision({
    repoRoot: __dirname + '/..',
    app: 'dgfy-api',
    revision: 16,
    candidateSha: SHA('9'),
    inspectFn: inspectFixture({ status: 1, stderr: 'not found' }),
  });
  assert.equal(result.verdict, 'error');
  assert.equal(result.code, 'version-unreadable');
});

test('parseArgs: --revision requires --source-sha (manifest mode is authoritative for its own revision)', () => {
  assert.throws(
    () => parseArgs(['--manifest', 'candidate.json', '--revision', 'r16']),
    /only valid with --source-sha/,
  );
  const options = parseArgs(['--source-sha', SHA('a'), '--revision', 'r16']);
  assert.equal(options.revision, 'r16');
});
