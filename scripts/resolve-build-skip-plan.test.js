const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

function writeFixtureFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}

function commitFixture(root, message) {
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test User', '-c', 'user.email=test@example.com', 'commit', '-m', message], { cwd: root });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function makeReachabilityFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-build-skip-plan-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFixtureFiles(root, {
    'apps/dgfy-storefront/package.json': JSON.stringify({
      name: 'fixture-storefront',
      version: '1.0.0',
      dependencies: { '@sieitzz/web-core': 'file:../../packages/web-core' },
    }),
    'apps/dgfy-storefront/src/main.jsx': "import '../../../packages/web-core/src/reachable.js';\n",
    'packages/web-core/package.json': JSON.stringify({ name: '@sieitzz/web-core', version: '1.0.0' }),
    'packages/web-core/src/reachable.js': 'export default {};\n',
  });
  return { root, baseRevision: commitFixture(root, 'fixture base') };
}

test('decideBuildSkip: tag not published yet -> build normally, no diff call', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: inspectNotFound, diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'not-published');
});

test('decideBuildSkip: idempotent same-revision republish -> skip, diffFn never invoked', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(CURRENT), diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, true);
  assert.equal(result.code, 'idempotent-same-revision');
});

test('decideBuildSkip: different revision, content genuinely equivalent -> skip', async () => {
  let diffCallArgs = null;
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: (args) => { diffCallArgs = args; return []; },
  });
  assert.equal(result.skip, true);
  assert.equal(result.code, 'content-equivalent');
  assert.equal(diffCallArgs.fromRevision, EXISTING);
  assert.equal(diffCallArgs.toRevision, CURRENT);
});

test('decideBuildSkip: different revision, content genuinely differs -> do not skip, not a thrown error', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['apps/dgfy-api/src/index.js'],
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
  assert.match(result.detail, /apps\/dgfy-api\/src\/index\.js/);
});

test('decideBuildSkip: GHCR inspect error (unclassified) -> fail-closed, do not skip', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: inspectUnclassifiedError, diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'unreadable-fail-closed');
});

test('decideBuildSkip: no currentRevision supplied -> fail-closed via decideImmutability\'s own guard', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: '',
    inspectFn: inspectNotFound, diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'unreadable-fail-closed');
});

test('decideBuildSkip: existing revision unreadable/disagreeing (existingRevision: null) -> fail-closed, no diff attempted', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => ({ status: 0, stdout: JSON.stringify({ Image: { Config: { Labels: {} } } }), stderr: '' }),
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'unreadable-fail-closed');
});

test('decideBuildSkip: diff itself unavailable (unresolvable SHA / shallow history) -> fail-closed', async () => {
  const result = await decideBuildSkip({
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
test('decideBuildSkip: Dockerfile-only change (infrastructure/docker/<app>/) is in scope and is never skipped', async () => {
  let diffCallArgs = null;
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: (args) => { diffCallArgs = args; return ['infrastructure/docker/dgfy-api/Dockerfile']; },
  });
  assert.ok(diffCallArgs.paths.includes('infrastructure/docker/dgfy-api'), `expected infrastructure/docker/dgfy-api in ${JSON.stringify(diffCallArgs.paths)}`);
  assert.ok(diffCallArgs.paths.includes('apps/dgfy-api'), `expected apps/dgfy-api in ${JSON.stringify(diffCallArgs.paths)}`);
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
});

test('decideBuildSkip: unreachable web-core change narrows to a skippable result', async () => {
  let reachabilityCalls = 0;
  const result = await decideBuildSkip({
    app: 'dgfy-storefront', image: 'ghcr.io/sieitzz/dgfy-storefront', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['packages/web-core/src/features/pos-only.js'],
    reachabilityFn: async () => {
      reachabilityCalls += 1;
      return { applicable: true, changed: false };
    },
  });
  assert.equal(result.skip, true);
  assert.equal(result.code, 'content-equivalent-narrowed');
  assert.equal(reachabilityCalls, 1);
});

test('decideBuildSkip: reachable web-core change remains content-changed', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-storefront', image: 'ghcr.io/sieitzz/dgfy-storefront', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['packages/web-core/src/reachable.js'],
    reachabilityFn: async () => ({ applicable: true, changed: true }),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
});

test('decideBuildSkip: mixed direct and web-core changes do not consult reachability', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-storefront', image: 'ghcr.io/sieitzz/dgfy-storefront', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['apps/dgfy-storefront/src/main.jsx', 'packages/web-core/src/reachable.js'],
    reachabilityFn: neverCalled('reachabilityFn'),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
});

test('decideBuildSkip: backend oracle not applicable preserves content-changed behavior', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-api', image: IMAGE, versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['packages/shared-constants/index.js'],
    reachabilityFn: async () => ({ applicable: false, changed: true }),
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
});

test('decideBuildSkip: narrowing toggle off preserves the old directory-containment result', async () => {
  const result = await decideBuildSkip({
    app: 'dgfy-storefront', image: 'ghcr.io/sieitzz/dgfy-storefront', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['packages/web-core/src/features/pos-only.js'],
    reachabilityFn: neverCalled('reachabilityFn'),
    narrowingEnabledFn: () => false,
  });
  assert.equal(result.skip, false);
  assert.equal(result.code, 'content-changed');
});

test('decideBuildSkip: real fixture narrows a web-core __tests__-only change', async () => {
  const { root, baseRevision } = makeReachabilityFixture();
  try {
    writeFixtureFiles(root, { 'packages/web-core/src/__tests__/unreachable.test.js': 'export default {};\n' });
    const currentRevision = commitFixture(root, 'add web-core test-only file');
    const result = await decideBuildSkip({
      app: 'dgfy-storefront',
      image: 'ghcr.io/sieitzz/dgfy-storefront',
      versionTag: '1.0.0',
      currentRevision,
      repoRoot: root,
      inspectFn: () => inspectPublishedAt(baseRevision),
      diffFn: () => ['packages/web-core/src/__tests__/unreachable.test.js'],
    });
    assert.equal(result.skip, true);
    assert.equal(result.code, 'content-equivalent-narrowed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
test('decideBuildSkip: dgfy-api and dgfy-migration-runner resolve independently', async () => {
  const apiResult = await decideBuildSkip({
    app: 'dgfy-api', image: 'ghcr.io/sieitzz/dgfy-api', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => [],
  });
  const migrationResult = await decideBuildSkip({
    app: 'dgfy-migration-runner', image: 'ghcr.io/sieitzz/dgfy-migration-runner', versionTag: '1.0.0', currentRevision: CURRENT,
    inspectFn: () => inspectPublishedAt(EXISTING),
    diffFn: () => ['apps/dgfy-migration-runner/src/migrate.js'],
  });
  assert.equal(apiResult.skip, true);
  assert.equal(apiResult.code, 'content-equivalent');
  assert.equal(migrationResult.skip, false);
  assert.equal(migrationResult.code, 'content-changed');
});

test('resolveBuildSkipPlan: resolves a plan across multiple apps, keyed by app name, each independently', async () => {
  // repoRoot deliberately NOT overridden -- readVersionAt() shells out to `git show <ref>:<path>`
  // against a real repo, and this repo's own working tree is a valid, cheap target for it (no
  // network, no docker). currentRevision=HEAD is always resolvable here.
  const plan = await resolveBuildSkipPlan({
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

test('resolveBuildSkipPlan: an app whose version cannot be read fails closed instead of throwing', async () => {
  const plan = await resolveBuildSkipPlan({
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
// own inline shell `case` exactly (DEV -> moving dev alias, STAGING -> -staging, PROD -> ''), or this script
// would check a different tag than the one the real build-and-push step publishes.
test('deriveChannelSuffix: DEV/STAGING/PROD match the per-workflow shell case exactly', () => {
  assert.equal(deriveChannelSuffix('DEV'), '');
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

test('resolveBuildSkipPlan: environment STAGING checks the -staging-suffixed tag, not the bare one', async () => {
  const inspectedRefs = [];
  const plan = await resolveBuildSkipPlan({
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

test('resolveBuildSkipPlan: environment omitted checks the bare tag (deploy-main.yml/PROD unchanged)', async () => {
  const inspectedRefs = [];
  await resolveBuildSkipPlan({
    apps: ['dgfy-ims'],
    currentRevision: 'HEAD',
    inspectFn: (imageRef) => { inspectedRefs.push(imageRef); return inspectNotFound(); },
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(inspectedRefs.length, 1);
  assert.doesNotMatch(inspectedRefs[0], /-dev$|-staging$/);
});

// #1977 (Phase 342) -- revision-aware tag derivation: with a candidate release revision the
// checked tag is the matrix tag (frontend X.Y.Z-rN-staging, backend env-neutral X.Y.Z-rN,
// PROD X.Y.Z-rN); without one, the legacy uniform X.Y.Z[-channel] derivation applies.
const { deriveVersionTag } = require('./resolve-build-skip-plan');

test('deriveVersionTag: versionless DEV alias and legacy staging/production derivation', () => {
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'DEV', app: 'dgfy-pos', revision: undefined }), 'dev');
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'STAGING', app: 'dgfy-pos', revision: '' }), '1.13.0-staging');
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'PROD', app: 'dgfy-api', revision: null }), '1.13.0');
});

test('deriveVersionTag: revision-aware matrix tags for a candidate dispatch', () => {
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'STAGING', app: 'dgfy-pos', revision: 'r16' }), '1.13.0-r16-staging');
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'STAGING', app: 'dgfy-api', revision: 'r16' }), '1.13.0-r16');
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'PROD', app: 'dgfy-pos', revision: 'r16' }), '1.13.0-r16');
  assert.equal(deriveVersionTag({ version: '1.13.0', environment: 'PROD', app: 'dgfy-migration-runner', revision: 16 }), '1.13.0-r16');
});

test('parseArgs: --release-revision is optional (omitted for DEV/ad-hoc dispatches)', () => {
  const without = parseArgs(['--revision', 'abc123']);
  assert.equal(without.releaseRevision, '');
  const withRevision = parseArgs(['--revision', 'abc123', '--environment', 'STAGING', '--release-revision', 'r16']);
  assert.equal(withRevision.releaseRevision, 'r16');
  assert.equal(withRevision.environment, 'STAGING');
});

// #2055 (Phase 346) -- per-app revisions and DEV ad-hoc tags in the skip plan.

test('deriveVersionTag: every DEV source resolves to the shared versionless alias', () => {
  assert.equal(deriveVersionTag({ environment: 'DEV', app: 'dgfy-pos', revision: 'r16' }), 'dev');
  assert.equal(deriveVersionTag({ environment: 'DEV', app: 'dgfy-pos', prRef: 'pr482' }), 'dev');
  // prRef outside DEV fails closed -- the resolver rejects it, so the plan can never check
  // the wrong tag for a STAGING/PROD dispatch.
  assert.throws(() => deriveVersionTag({ version: '1.13.0', environment: 'STAGING', app: 'dgfy-pos', prRef: 'pr482' }), /DEV-only/);
});

test('resolveBuildSkipPlan: an explicit per-app entry wins over the shared candidate-wide revision', async () => {
  const inspectedRefs = [];
  const plan = await resolveBuildSkipPlan({
    apps: ['dgfy-api', 'dgfy-pos'],
    currentRevision: 'HEAD',
    environment: 'STAGING',
    revision: 'r16',
    revisionsByApp: { 'dgfy-pos': 'r17' },
    inspectFn: (imageRef) => { inspectedRefs.push(imageRef); return inspectNotFound(); },
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(inspectedRefs.length, 2);
  const apiRef = inspectedRefs.find((ref) => ref.includes('dgfy-api'));
  const posRef = inspectedRefs.find((ref) => ref.includes('dgfy-pos'));
  assert.match(apiRef, /-r16$/);
  assert.match(posRef, /-r17-staging$/);
  assert.equal(plan['dgfy-api'].code, 'not-published');
  assert.equal(plan['dgfy-pos'].code, 'not-published');
});

test('resolveBuildSkipPlan: DEV always builds so the moving tag follows the selected branch SHA', async () => {
  const inspectedRefs = [];
  const plan = await resolveBuildSkipPlan({
    apps: ['dgfy-pos'], currentRevision: 'HEAD', environment: 'DEV',
    inspectFn: (imageRef) => { inspectedRefs.push(imageRef); return inspectNotFound(); },
    diffFn: neverCalled('diffFn'),
  });
  assert.equal(plan['dgfy-pos'].skip, false);
  assert.equal(plan['dgfy-pos'].code, 'dev-moving-tag');
  assert.deepEqual(inspectedRefs, []);
});
test('parseArgs: --release-revisions-json parses to a per-app map; garbage fails closed', () => {
  const options = parseArgs(['--revision', 'abc123', '--release-revisions-json', '{"dgfy-api":"r16","dgfy-pos":"17"}']);
  assert.deepEqual(options.revisionsByApp, { 'dgfy-api': 'r16', 'dgfy-pos': '17' });
  assert.throws(() => parseArgs(['--revision', 'abc123', '--release-revisions-json', 'not-json']), /not valid JSON/);
  assert.throws(() => parseArgs(['--revision', 'abc123', '--release-revisions-json', '["r16"]']), /must be a JSON object/);
  const prRef = parseArgs(['--revision', 'abc123', '--environment', 'DEV', '--dev-pr-ref', 'pr482']);
  assert.equal(prRef.devPrRef, 'pr482');
});
