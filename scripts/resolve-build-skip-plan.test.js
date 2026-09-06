const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveChannelSuffix,
  buildInputPathsForApp,
  gitDiffChangedFiles,
  decideBuildSkip,
  resolveBuildSkipPlan,
  parseArgs,
} = require('./resolve-build-skip-plan');

// #1610 -- deploy-main.yml build-skip plan. Every decideBuildSkip test injects canned
// inspectFn/diffFn fixtures (mirroring check-tag-immutability.test.js's own convention); none of
// these shell out to `docker` or a real registry. gitDiffChangedFiles gets a couple of cheap
// real-git-history sanity checks (this repo's own history, no network), same convention
// check-image-version-parity.test.js already uses for "resolvability" checks.

const IMAGE = 'ghcr.io/sieitzz/dgfy-api';
const CURRENT = 'current-sha';
const EXISTING = 'existing-sha';

function inspectNotFound() {
  return { status: 1, stdout: '', stderr: 'ghcr.io/sieitzz/dgfy-api:1.0.0: not found' };
}

function inspectUnclassifiedError() {
  return { status: 1, stdout: '', stderr: 'dial tcp: lookup ghcr.io: no such host' };
}

function inspectPublishedAt(revision) {
  return {
    status: 0,
    stdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.revision': revision } } } }),
    stderr: '',
  };
}

function neverCalled(name) {
  return () => { throw new Error(`${name} must not be called for this case`); };
}

test('decideBuildSkip: tag not published yet -> build normally, no diff call', () => {
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: inspectNotFound, diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'not-published');
});

test('decideBuildSkip: idempotent same-revision republish -> skip, diffFn never invoked', () => {
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(CURRENT), diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, true);
  assert.equal(result.code, 'idempotent-same-revision');
});

test('decideBuildSkip: different revision, content genuinely equivalent -> skip', () => {
  let diffCallArgs = null;
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: (args) => { diffCallArgs = args; return []; },
  });
  assert.equal(result.skip, true);
  assert.equal(result.code, 'content-equivalent');
  assert.equal(diffCallArgs.fromRevision, EXISTING);
  assert.equal(diffCallArgs.toRevision, CURRENT);
});

test('decideBuildSkip: different revision, content genuinely differs -> do not skip, not a thrown error', () => {
  assert.doesNotThrow(() => {
    const result = decideBuildSkip({
      app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
      inspectFn: () => inspectPublishedAt(EXISTING),
      diffFn: () => ['apps/dgfy-api/src/index.js'],
    });
    assert.equal(result.skip, false);
    assert.equal(result.code, 'content-changed');
    assert.match(result.detail, /apps\/dgfy-api\/src\/index\.js/);
  });
});

test('decideBuildSkip: GHCR inspect error (unclassified) -> fail-closed, do not skip', () => {
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: inspectUnclassifiedError, diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'unreadable-fail-closed');
});

test('decideBuildSkip: no currentRevision supplied -> fail-closed via decideImmutability\'s own guard', () => {
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: '',
    inspectFn: inspectNotFound, diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'unreadable-fail-closed');
});

test('decideBuildSkip: existing revision unreadable/disagreeing (existingRevision: null) -> fail-closed, no diff attempted', () => {
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => ({ status: 0, stdout: JSON.stringify({ Image: { Config: { Labels: {} } } }), stderr: '' }),
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'unreadable-fail-closed');
});

test('decideBuildSkip: diff itself unavailable (unresolvable SHA / shallow history) -> fail-closed', () => {
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => null,
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'diff-unavailable-fail-closed');
});

// The load-bearing test for §7's scope-widening finding: infrastructure/docker/<app>/ must be part
// of the diffed path set (wider than check-app-version-bump.js's own detectChangedApps scope), and
// a Dockerfile-only change alone must produce { skip: false }.
test('decideBuildSkip: Dockerfile-only change (infrastructure/docker/<app>/) is in scope and is never skipped', () => {
  let diffCallArgs = null;
  const result = decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: (args) => { diffCallArgs = args; return ['infrastructure/docker/dgfy-api/Dockerfile']; },
  });
  assert.ok(diffCallArgs.paths.includes('infrastructure/docker/dgfy-api'), `expected infrastructure/docker/dgfy-api in ${JSON.stringify(diffCallArgs.paths)}`);
  assert.ok(diffCallArgs.paths.includes('apps/dgfy-api'), `expected apps/dgfy-api in ${JSON.stringify(diffCallArgs.paths)}`);
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
});

test('buildInputPathsForApp: includes app dir, infrastructure/docker/<app>, and resolved file: deps', () => {
  const paths = buildInputPathsForApp(
    '/does-not-matter',
    'irrelevant-ref',
    'dgfy-api',
  );
  assert.ok(paths.includes('apps/dgfy-api'));
  assert.ok(paths.includes('infrastructure/docker/dgfy-api'));
});

// dgfy-api / dgfy-migration-runner independence (plan §4): two separate decideBuildSkip calls with
// divergent fixtures must resolve independently -- one skip-eligible, one not, with neither leaking
// into the other.
test('decideBuildSkip: dgfy-api and dgfy-migration-runner resolve independently', () => {
  const apiResult = decideBuildSkip({
    app: 'dgfy-api', image: 'ghcr.io/sieitzz/dgfy-api', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => [],
  });
  const migrationResult = decideBuildSkip({
    app: 'dgfy-migration-runner', image: 'ghcr.io/sieitzz/dgfy-migration-runner', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['apps/dgfy-migration-runner/src/migrate.js'],
  });
  assert.equal(apiResult.skip, true);
  assert.equal(apiResult.code, 'content-equivalent');
  assert.equal(migrationResult.skip, false);
  assert.equal(migrationResult.code, 'content-changed');
});

test('resolveBuildSkipPlan: resolves a plan across multiple apps, keyed by app name, each independently', () => {
  // repoRoot deliberately NOT overridden -- readVersionAt() shells out to `git show <ref>:<path>`
  // against a real repo, and this repo's own working tree is a valid, cheap target for it (no
  // network, no docker). currentRevision=HEAD is always resolvable here.
  const plan = resolveBuildSkipPlan({
    apps: ['dgfy-ims', 'dgfy-pos'],
    currentRevision: 'HEAD',
    inspectFn: inspectNotFound, // every tag "not found" -> push/build, no diff needed either way
    diffFn: neverCalled('diffFn'),
  });
  assert.deepEqual(Object.keys(plan).sort(), ['dgfy-ims', 'dgfy-pos']);
  for (const app of ['dgfy-ims', 'dgfy-pos']) {
    assert.equal(plan[app].skip, false);
    assert.equal(plan[app].code, 'not-published');
  }
});

test('resolveBuildSkipPlan: an app whose version cannot be read fails closed instead of throwing', () => {
  const plan = resolveBuildSkipPlan({
    apps: ['dgfy-ims'],
    currentRevision: 'sha-with-no-such-tree-entry-in-this-fake-repo',
    repoRoot: '/does-not-matter-and-git-show-will-fail-here',
    inspectFn: inspectNotFound,
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(plan['dgfy-ims'].skip, false);
  assert.equal(plan['dgfy-ims'].code, 'version-unreadable-fail-closed');
});

test('gitDiffChangedFiles: an unresolvable revision returns null (fail-closed signal), not a throw', () => {
  const result = gitDiffChangedFiles({
    repoRoot: __dirname + '/..',
    fromRevision: 'this-is-not-a-real-revision-0000000000000000000000000000000000000000',
    toRevision: 'HEAD',
    paths: ['scripts'],
  });
  assert.equal(result, null);
});

test('gitDiffChangedFiles: diffing HEAD against itself returns an empty array, not null', () => {
  const result = gitDiffChangedFiles({
    repoRoot: __dirname + '/..',
    fromRevision: 'HEAD',
    toRevision: 'HEAD',
    paths: ['scripts'],
  });
  assert.deepEqual(result, []);
});

test('parseArgs: --revision is required', () => {
  assert.throws(() => parseArgs([]), /--revision is required/);
});

test('parseArgs: parses --revision, --apps, and --project-root', () => {
  const options = parseArgs(['--revision', 'abc123', '--apps', 'dgfy-api, dgfy-pos', '--project-root', '.']);
  assert.equal(options.revision, 'abc123');
  assert.deepEqual(options.apps, ['dgfy-api', 'dgfy-pos']);
});

test('parseArgs: parses --environment', () => {
  const options = parseArgs(['--revision', 'abc123', '--environment', 'STAGING']);
  assert.equal(options.environment, 'STAGING');
});

test('parseArgs: --environment defaults to undefined when omitted (deploy-main.yml unchanged)', () => {
  const options = parseArgs(['--revision', 'abc123']);
  assert.equal(options.environment, undefined);
});

// #1610 follow-up: deploy.yml (DEV/STAGING) lacked this script's skip logic entirely, so every
// dispatch force-rebuilt the paired dgfy-api/dgfy-migration-runner unit even when only one of them
// changed -- tripping ADR 0081 Decision 7's tag-immutability guard on the untouched one every time.
// deriveChannelSuffix must match deploy-api.yml/deploy-migration-runner.yml/deploy-frontend.yml's
// own inline shell `case` exactly (DEV -> -dev, STAGING -> -staging, PROD -> ''), or this script
// would check a different tag than the one the real build-and-push step publishes.
test('deriveChannelSuffix: DEV/STAGING/PROD match the per-workflow shell case exactly', () => {
  assert.equal(deriveChannelSuffix('DEV'), '-dev');
  assert.equal(deriveChannelSuffix('STAGING'), '-staging');
  assert.equal(deriveChannelSuffix('PROD'), '');
});

test('deriveChannelSuffix: omitted/empty/undefined all default to no suffix (deploy-main.yml unchanged)', () => {
  assert.equal(deriveChannelSuffix(undefined), '');
  assert.equal(deriveChannelSuffix(null), '');
  assert.equal(deriveChannelSuffix(''), '');
});

test('deriveChannelSuffix: an unrecognized environment throws rather than silently defaulting', () => {
  assert.throws(() => deriveChannelSuffix('QA'), /Unknown environment 'QA'/);
});

test('resolveBuildSkipPlan: environment STAGING checks the -staging-suffixed tag, not the bare one', () => {
  const inspectedRefs = [];
  const plan = resolveBuildSkipPlan({
    apps: ['dgfy-ims'],
    currentRevision: 'HEAD',
    environment: 'STAGING',
    inspectFn: (imageRef) => { inspectedRefs.push(imageRef); return inspectNotFound(); },
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(plan['dgfy-ims'].code, 'not-published');
  assert.equal(inspectedRefs.length, 1);
  assert.match(inspectedRefs[0], /-staging$/);
  assert.doesNotMatch(inspectedRefs[0], /-staging-staging$/);
});

test('resolveBuildSkipPlan: environment omitted checks the bare tag (deploy-main.yml/PROD unchanged)', () => {
  const inspectedRefs = [];
  resolveBuildSkipPlan({
    apps: ['dgfy-ims'],
    currentRevision: 'HEAD',
    inspectFn: (imageRef) => { inspectedRefs.push(imageRef); return inspectNotFound(); },
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(inspectedRefs.length, 1);
  assert.doesNotMatch(inspectedRefs[0], /-dev$|-staging$/);
});
