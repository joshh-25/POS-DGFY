const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const {
  APP_DIR_BY_KEY,
  PATH_FILTERS,
  parseNameStatusZ,
  resolvePrAppCheckTriggers,
  isAggregatePromotion,
  writeGithubOutput,
} = require('./resolve-pr-app-check-triggers');
const sharedWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/shared-changed-paths.yml'), 'utf8');
const prWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/pr-checks.yml'), 'utf8');

const APP_NAMES = Object.values(APP_DIR_BY_KEY);
const FRONTENDS = ['dgfy-ims', 'dgfy-pos', 'dgfy-storefront', 'dgfy-opis', 'dgfy-admin'];

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function makeFixture({ withoutApps = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-app-triggers-'));
  git(root, 'init', '-b', 'fixture');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'Test Fixture');
  for (const appDir of APP_NAMES) {
    if (withoutApps.includes(appDir)) continue;
    const target = path.join(root, appDir);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: appDir, version: '1.0.0', dependencies: {} }, null, 2));
  }
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  return {
    root,
    base,
    write(relativePath, contents) {
      const target = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    },
    commit() {
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'change');
      return git(root, 'rev-parse', 'HEAD');
    },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

function packageJson(fixture, appDir, patch = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(fixture.root, appDir, 'package.json'), 'utf8'));
  Object.assign(pkg, patch);
  return JSON.stringify(pkg, null, 2);
}

const frontendResolver = async ({ changedFiles }) => Object.fromEntries(FRONTENDS.map((name) => {
  const key = Object.entries(APP_DIR_BY_KEY).find(([, dir]) => dir === `apps/${name}`)[0];
  return [name, { trigger: changedFiles.some((file) => PATH_FILTERS[key].test(file)), reason: 'fixture-filter' }];
}));

async function resolve(fixture, head, extra = {}) {
  return resolvePrAppCheckTriggers({
    repoRoot: fixture.root,
    baseGitRef: fixture.base,
    headGitRef: head,
    baseBranchName: 'develop',
    headBranchName: 'feature/test',
    optimizeVersionOnly: true,
    resolveFrontendBuildTriggers: frontendResolver,
    ...extra,
  });
}

test('classifies all seven version-only manifests independently and keeps the full diff', async (t) => {
  const fixture = makeFixture();
  t.after(fixture.cleanup);
  for (const appDir of APP_NAMES) fixture.write(`${appDir}/package.json`, packageJson(fixture, appDir, { version: '1.0.1' }));
  fixture.write('docs/releases/notes/2026-10-08-01.md', 'release notes');
  const result = await resolve(fixture, fixture.commit());
  assert.deepEqual(Object.values(result.components), Array(7).fill(false));
  assert.equal(result.removedManifests.length, 7);
  assert.equal(result.changedFiles.length, 8);
  assert.ok(result.changedFiles.includes('docs/releases/notes/2026-10-08-01.md'));
  assert.deepEqual(result.metadataApps.sort(), [...FRONTENDS].sort());
});

test('only exact top-level version edits qualify; other manifest data and app files retain checks', async (t) => {
  const fixture = makeFixture();
  t.after(fixture.cleanup);
  const ims = 'apps/dgfy-ims';
  const pos = 'apps/dgfy-pos';
  fixture.write(`${ims}/package.json`, packageJson(fixture, ims, { version: '1.0.1' }));
  fixture.write(`${pos}/package.json`, packageJson(fixture, pos, { version: '1.0.1', description: 'changed too' }));
  fixture.write(`${pos}/src/change.js`, 'export const changed = true;');
  const result = await resolve(fixture, fixture.commit());
  assert.equal(result.components.frontend_ims, false);
  assert.equal(result.components.frontend_pos, true);
  assert.deepEqual(result.removedManifests, [`${ims}/package.json`]);
  assert.ok(result.changedFiles.includes(`${ims}/package.json`));
  assert.ok(result.routingFiles.includes(`${pos}/package.json`));
});

test('nested manifest fields, dependencies, tests, config, and lockfiles retain normal routing', async (t) => {
  const changes = [
    ['apps/dgfy-api/package.json', (f) => packageJson(f, 'apps/dgfy-api', { version: '1.0.1', engines: { node: '>=22' } })],
    ['apps/dgfy-migration-runner/package-lock.json', () => '{"lockfileVersion":3}'],
    ['apps/dgfy-ims/tests/change.test.js', () => 'test("changed", () => {});'],
    ['apps/dgfy-pos/vite.config.js', () => 'export default {};'],
    ['apps/dgfy-storefront/package.json', (f) => packageJson(f, 'apps/dgfy-storefront', { version: '1.0.1', dependencies: { added: '^1.0.0' } })],
  ];
  for (const [relativePath, content] of changes) {
    await t.test(relativePath, async (st) => {
      const fixture = makeFixture();
      st.after(fixture.cleanup);
      if (relativePath.endsWith('package.json') && !relativePath.includes('apps/dgfy-api/package.json')) {
        fixture.write(relativePath, content(fixture));
      } else if (relativePath === 'apps/dgfy-api/package.json') {
        fixture.write(relativePath, content(fixture));
      } else {
        fixture.write(relativePath, content());
      }
      const result = await resolve(fixture, fixture.commit());
      const key = Object.entries(APP_DIR_BY_KEY).find(([, dir]) => relativePath.startsWith(`${dir}/`))[0];
      assert.equal(result.components[key], true);
      assert.deepEqual(result.removedManifests, []);
    });
  }
});

test('shared, Docker, and workflow inputs still trigger apps with a qualifying manifest', async (t) => {
  const fixture = makeFixture();
  t.after(fixture.cleanup);
  fixture.write('apps/dgfy-api/package.json', packageJson(fixture, 'apps/dgfy-api', { version: '1.0.1' }));
  fixture.write('apps/dgfy-ims/package.json', packageJson(fixture, 'apps/dgfy-ims', { version: '1.0.1' }));
  fixture.write('packages/web-core/src/shared.js', 'export const changed = true;');
  fixture.write('infrastructure/docker/dgfy-api/Dockerfile', 'FROM node:22-alpine\n');
  fixture.write('.github/workflows/shared-changed-paths.yml', 'name: changed\n');
  const result = await resolve(fixture, fixture.commit());
  assert.equal(result.components.dgfy_api, true);
  assert.equal(result.components.frontend_ims, true);
  assert.deepEqual(result.removedManifests, ['apps/dgfy-api/package.json', 'apps/dgfy-ims/package.json']);
});

test('malformed, invalid, unchanged, added, deleted, or renamed manifests fail safe', async (t) => {
  const cases = [
    { name: 'malformed', change: (f) => f.write('apps/dgfy-api/package.json', '{broken') },
    { name: 'invalid version', change: (f) => f.write('apps/dgfy-api/package.json', '{"name":"api","version":"wat"}') },
    { name: 'unchanged version with data edit', change: (f) => f.write('apps/dgfy-api/package.json', packageJson(f, 'apps/dgfy-api', { description: 'other' })) },
    { name: 'deleted', change: (f) => fs.rmSync(path.join(f.root, 'apps/dgfy-api/package.json')) },
    { name: 'renamed', change: (f) => git(f.root, 'mv', 'apps/dgfy-api/package.json', 'apps/dgfy-api/package-old.json') },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async (st) => {
      const fixture = makeFixture();
      st.after(fixture.cleanup);
      entry.change(fixture);
      const result = await resolve(fixture, fixture.commit());
      assert.equal(result.components.dgfy_api, true);
      assert.deepEqual(result.removedManifests, []);
    });
  }
  const added = makeFixture();
  t.after(added.cleanup);
  fs.rmSync(path.join(added.root, 'apps/dgfy-api/package.json'));
  git(added.root, 'commit', '-am', 'remove old manifest');
  added.write('apps/dgfy-api/package.json', '{"name":"api","version":"1.0.1"}');
  const addResult = await resolve(added, added.commit());
  assert.equal(addResult.components.dgfy_api, true);

  const newApp = makeFixture({ withoutApps: ['apps/dgfy-api'] });
  t.after(newApp.cleanup);
  newApp.write('apps/dgfy-api/package.json', '{"name":"api","version":"1.0.1"}');
  const newAppResult = await resolve(newApp, newApp.commit());
  assert.equal(newAppResult.components.dgfy_api, true);
  assert.deepEqual(newAppResult.removedManifests, []);
});

test('unavailable whole diff throws and cannot be interpreted as an empty successful diff', async () => {
  assert.throws(() => parseNameStatusZ('R100\0old\0'), /incomplete rename/);
  await assert.rejects(resolvePrAppCheckTriggers({
    repoRoot: process.cwd(), baseGitRef: 'missing-base', headGitRef: 'HEAD',
    git: () => { throw new Error('missing ref'); },
    resolveFrontendBuildTriggers: frontendResolver,
  }), /missing ref/);
});

test('promotion exclusion, disabled optimization, and missing branch context preserve normal routing', async (t) => {
  for (const [base, head] of [['staging', 'develop'], ['staging', 'to-staging'], ['staging', 'to-staging/2026-10-08'], ['main', 'staging'], ['main', 'release/2026-10-08']]) {
    assert.equal(isAggregatePromotion(base, head), true, `${head} -> ${base}`);
  }
  assert.equal(isAggregatePromotion('main', 'fix/hotfix'), false);
  const fixture = makeFixture();
  t.after(fixture.cleanup);
  fixture.write('apps/dgfy-api/package.json', packageJson(fixture, 'apps/dgfy-api', { version: '1.0.1' }));
  const head = fixture.commit();
  for (const options of [
    { baseBranchName: 'staging', headBranchName: 'to-staging/2026-10-08' },
    { baseBranchName: 'main', headBranchName: 'release/2026-10-08' },
    { baseBranchName: 'develop', headBranchName: '' },
    { baseBranchName: 'develop', headBranchName: 'feature/test', optimizeVersionOnly: false },
  ]) {
    const result = await resolve(fixture, head, options);
    assert.equal(result.components.dgfy_api, true);
    assert.deepEqual(result.removedManifests, []);
  }
});

test('literal false outputs are written as strings and remain distinguishable from missing output', (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-app-output-')), 'out');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  writeGithubOutput({ components: { frontend_ims: false, dgfy_api: true }, metadataApps: [], diagnostics: {} }, file);
  const output = fs.readFileSync(file, 'utf8');
  assert.match(output, /frontend_ims=false/);
  assert.match(output, /dgfy_api=true/);
  assert.match(output, /metadata_apps=\n/);
});

test('reusable workflow keeps conservative fallback and wires optimization only from ordinary PR checks', () => {
  assert.match(sharedWorkflow, /skip_version_only_app_changes:[\s\S]*?default: false/);
  assert.match(prWorkflow, /skip_version_only_app_changes: true/);
  for (const key of Object.keys(PATH_FILTERS)) {
    assert.match(sharedWorkflow, new RegExp(`${key}: \\$\\{\\{ steps\\.app_triggers\\.outputs\\.${key} != '' && steps\\.app_triggers\\.outputs\\.${key} \\|\\| steps\\.filter\\.outputs\\.${key} \\}\\}`));
  }
  assert.match(sharedWorkflow, /--base "\$\{BASE_SHA\}" --head HEAD/);
  assert.match(sharedWorkflow, /--base-branch "\$\{BASE_REF\}" --head-branch "\$\{HEAD_REF\}"/);
  assert.match(sharedWorkflow, /node scripts\/assert-version-only-build-metadata\.js --apps/);
  assert.doesNotMatch(sharedWorkflow, /id: app_triggers\n\s+continue-on-error:/);
});
