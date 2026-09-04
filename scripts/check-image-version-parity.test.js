const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CANDIDATE_SOURCE_LABEL,
  inspectImageLabel,
  decideParity,
  checkApp,
  runParityCheck,
  parseArgs,
} = require('./check-image-version-parity');

// #1588 (epic #1548 Wave 4, Phase 279) -- ADR 0081 Decision 8's promotion parity gate. Every case
// here mocks `docker buildx imagetools inspect` output directly (status/stdout/stderr fixtures) via
// an injected inspectFn; none of these tests shell out to `docker`, touch a real registry, or touch
// real git history (checkApp's own tests inject a fake readVersionAt-equivalent by controlling
// candidateSha/inspectFn only -- see the runParityCheck test below for the one place a real repoRoot
// is used, against this repo's own git history, which is a legitimate fixture for "does this
// resolve at all", not a network call).

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

test('inspectImageLabel: image exists but the label is missing entirely -> unreadable', () => {
  const result = inspectImageLabel({
    image: 'ghcr.io/sieitzz/dgfy-api',
    tag: '1.3.0',
    labelKey: CANDIDATE_SOURCE_LABEL,
    inspectFn: inspectFixture({ stdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'x' } } } }) }),
  });
  assert.equal(result.state, 'unreadable');
});

test('inspectImageLabel: multi-platform image with disagreeing labels -> unreadable', () => {
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
  assert.equal(result.state, 'unreadable');
});

// decideParity -- the three spec'd outcomes (#1588's own body) plus the skip/error edges.

test('decideParity: matching candidate-source-sha on both images -> pass/match', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') };
  assert.deepEqual(decideParity({ prod, staging }), {
    verdict: 'pass',
    code: 'match',
    detail: 'x:1.3.0-staging and x:1.3.0 share candidate-source-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.',
  });
});

test('decideParity: prod exists, no staging predecessor at all -> pass/no-staging-predecessor (evidence, not a defect)', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'not-found', reason: 'tag does not exist' };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'pass');
  assert.equal(verdict.code, 'no-staging-predecessor');
  assert.match(verdict.detail, /expected evidence of a #1007 expedited promotion or a main hotfix, not a defect/);
});

test('decideParity: prod exists, staging image exists but its label is unreadable -> pass/no-staging-predecessor (treated same as missing)', () => {
  const prod = { ref: 'x:1.3.0', state: 'ok', value: SHA('a') };
  const staging = { ref: 'x:1.3.0-staging', state: 'unreadable', reason: 'label not present anywhere on x:1.3.0-staging' };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'pass');
  assert.equal(verdict.code, 'no-staging-predecessor');
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

test('decideParity: prod image exists but its own label is unreadable -> fail, not a silent pass', () => {
  const prod = { ref: 'x:1.3.0', state: 'unreadable', reason: 'label not present anywhere on x:1.3.0' };
  const staging = { ref: 'x:1.3.0-staging', state: 'ok', value: SHA('a') };
  const verdict = decideParity({ prod, staging });
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.code, 'prod-unreadable');
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

// checkApp -- wires a fixed candidateSha through readVersionAt (real git, this repo's own history)
// and both inspects (fixture-injected) -- confirms the app-level orchestration shape, not the pure
// decision functions again.

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

// runParityCheck -- the manifest-driven CLI entrypoint. Uses this repo's real HEAD as the
// candidate SHA (a real, resolvable commit) so readVersionAt succeeds, with every docker inspect
// call still fixture-injected -- no live registry call, no live docker daemon required.

test('runParityCheck: validates the manifest and reports one entry per app, all pass on a fully matching fixture', () => {
  const { execSync } = require('node:child_process');
  const headSha = execSync('git rev-parse HEAD', { cwd: __dirname + '/..', encoding: 'utf8' }).trim();

  const manifest = {
    schema: 'sku-release-candidate/v1',
    candidate_id: '2026-09-04-01',
    status: 'qualified',
    source_develop_sha: headSha,
    current_staging_sha: headSha,
    revisions: [
      { kind: 'initial', sha: headSha, parent_sha: null, branch: 'to-staging/2026-09-04-01' },
    ],
    release_revision: { revision: 1, source_staging_sha: headSha, branch: 'release/2026-09-04-01-r1', pr: 9001 },
  };

  const result = runParityCheck({
    manifest,
    repoRoot: __dirname + '/..',
    apps: ['dgfy-api'],
    inspectFn: inspectFixture({ stdout: agreeingLabelJson(headSha) }),
  });

  assert.equal(result.candidate_id, '2026-09-04-01');
  assert.equal(result.candidate_source_sha, headSha);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].verdict, 'pass');
});

test('runParityCheck: an invalid manifest throws PromotionCandidateError, same validation as check-promotion-candidate.js', () => {
  assert.throws(
    () => runParityCheck({ manifest: { schema: 'not-the-right-schema' } }),
    /Candidate manifest schema must be sku-release-candidate\/v1/,
  );
});

test('parseArgs: requires --manifest', () => {
  assert.throws(() => parseArgs([]), /Missing required option: --manifest/);
});

test('parseArgs: parses --manifest, --project-root, and --apps', () => {
  const options = parseArgs(['--manifest', 'candidate.json', '--project-root', '/tmp/x', '--apps', 'dgfy-api,dgfy-pos']);
  assert.equal(options.manifestPath, 'candidate.json');
  assert.equal(options.projectRoot, '/tmp/x');
  assert.deepEqual(options.apps, ['dgfy-api', 'dgfy-pos']);
});
