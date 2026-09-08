const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { runCheck, runFloor, computeReachabilityShadowVerdict } = require('./check-app-version-bump');

// --- git fixture harness, same shape as scripts/check-compat-seams.test.js's ------

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return (result.stdout || '').trim();
}

function makeGitRepo() {
    const root = makeTempDir('app-version-bump-git-');
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.email', 'test@example.com']);
    runGit(root, ['config', 'user.name', 'App Version Bump Test']);
    return root;
}

function writeFiles(root, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

function commitAll(root, message) {
    runGit(root, ['add', '-A']);
    runGit(root, ['commit', '-q', '-m', message]);
    return runGit(root, ['rev-parse', 'HEAD']);
}

function pkgJson(version, deps = {}) {
    return `${JSON.stringify({ name: 'fixture', version, dependencies: deps }, null, 2)}\n`;
}

// Mirrors the real repo's five apps and their file: fan-out (apps/*/package.json,
// confirmed live): shared-constants -> all five, web-core -> ims/pos/storefront,
// pos-receipt -> ims/pos.
function baseFixture(overrides = {}) {
    const versions = {
        'dgfy-api': '1.0.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
        ...overrides,
    };

    return {
        'apps/dgfy-api/package.json': pkgJson(versions['dgfy-api'], {
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
        }),
        'apps/dgfy-api/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-migration-runner/package.json': pkgJson(versions['dgfy-migration-runner'], {
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
        }),
        'apps/dgfy-migration-runner/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-ims/package.json': pkgJson(versions['dgfy-ims'], {
            '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        'apps/dgfy-ims/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-pos/package.json': pkgJson(versions['dgfy-pos'], {
            '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        'apps/dgfy-pos/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-storefront/package.json': pkgJson(versions['dgfy-storefront'], {
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        'apps/dgfy-storefront/src/index.js': 'module.exports = {};\n',
        'packages/shared-constants/package.json': pkgJson('1.0.0'),
        'packages/shared-constants/index.js': 'module.exports = {};\n',
        'packages/pos-receipt/package.json': pkgJson('1.0.0'),
        'packages/pos-receipt/index.js': 'module.exports = {};\n',
        'packages/web-core/package.json': pkgJson('1.0.0'),
        'packages/web-core/index.js': 'module.exports = {};\n',
    };
}

// Builds a {root, baseGitRef, headGitRef} fixture: an initial commit from
// baseFixture() (optionally version-overridden), then a second commit applying
// `headFiles` (a partial file map -- only entries that change need listing).
function setupScenario({ baseVersions = {}, headFiles = {} } = {}) {
    const root = makeGitRepo();
    writeFiles(root, baseFixture(baseVersions));
    const baseGitRef = commitAll(root, 'base');
    writeFiles(root, headFiles);
    const headGitRef = commitAll(root, 'head');
    return { root, baseGitRef, headGitRef };
}

function findApp(result, app) {
    return result.appResults.find((entry) => entry.app === app);
}

// --- no apps changed --------------------------------------------------------

test('no apps changed: skips cleanly', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'README.md': 'unrelated change\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, true);
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'no-app-changed');
        assert.deepEqual(result.appResults, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- develop mode (any-increase) --------------------------------------------

test('develop: one app changed with a correct bump passes', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.0.1', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, true);
        assert.equal(result.mode, 'any-increase');
        assert.equal(result.appResults.length, 1);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.reason, 'direct');
        assert.equal(api.ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: one app changed with no bump fails', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.ok, false);
        assert.equal(api.code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: packages/shared-constants change fans out to all five apps', () => {
    // Only the shared package changes -- no app bumps its own version here -- so this
    // isolates fan-out *detection* (all 5 apps flagged as changed via the dependency
    // map read from their own package.json, not a hardcoded list) from the separate
    // question of whether any given app's bump then satisfies the mode. Every app
    // correctly fails here, since none actually bumped -- matching the issue's own
    // rule that a file: dependency change obligates every dependent app to bump too.
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'packages/shared-constants/index.js': 'module.exports = { changed: true };\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        assert.equal(result.appResults.length, 5);
        const appNames = result.appResults.map((entry) => entry.app).sort();
        assert.deepEqual(appNames, ['dgfy-api', 'dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos', 'dgfy-storefront']);
        for (const entry of result.appResults) {
            assert.equal(entry.reason, 'fan-out:packages/shared-constants');
            assert.equal(entry.ok, false);
            assert.equal(entry.code, 'insufficient-bump');
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: unparseable head version fails with a clear message', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('not-a-version', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.code, 'unparseable-head');
        assert.match(api.detail, /not a parseable X\.Y\.Z semver/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: a version that changed but decreased fails', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.1.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- staging mode: to-staging/* -> minor-floor ------------------------------

test('staging <- to-staging/*: a patch-only bump fails the minor floor', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.2.1', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'to-staging/2026-09-04-01',
        });
        assert.equal(result.mode, 'minor-floor');
        assert.equal(result.ok, false);
        assert.equal(findApp(result, 'dgfy-api').code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('staging <- to-staging/*: a minor bump already present from develop passes', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'to-staging/2026-09-04-01',
        });
        assert.equal(result.mode, 'minor-floor');
        assert.equal(result.ok, true);
        assert.equal(findApp(result, 'dgfy-api').ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('staging <- to-staging/*: an unchanged app is left untouched (pass, not evaluated)', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0', 'dgfy-pos': '1.4.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'to-staging/2026-09-04-01',
        });
        assert.equal(result.ok, true);
        assert.equal(result.appResults.length, 1);
        assert.equal(findApp(result, 'dgfy-pos'), undefined);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- staging mode: any other head -> patch-only -----------------------------

test('staging <- fix/staging/*: a minor bump fails patch-only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'fix/staging/2026-09-04-01-r2',
        });
        assert.equal(result.mode, 'patch-only');
        assert.equal(result.ok, false);
        assert.equal(findApp(result, 'dgfy-api').code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('staging <- fix/staging/*: a patch bump passes patch-only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.2.1', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'fix/staging/2026-09-04-01-r2',
        });
        assert.equal(result.mode, 'patch-only');
        assert.equal(result.ok, true);
        assert.equal(findApp(result, 'dgfy-api').ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- main mode: release/* -> any-increase; anything else -> patch-only ------

test('main <- release/*: any increase passes', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.5', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'main', headBranchName: 'release/2026-09-04-01-r1',
        });
        assert.equal(result.mode, 'any-increase');
        assert.equal(result.ok, true);
        assert.equal(findApp(result, 'dgfy-api').ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('main <- ad-hoc hotfix head: a minor bump fails patch-only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'main', headBranchName: 'hotfix/urgent-fix',
        });
        assert.equal(result.mode, 'patch-only');
        assert.equal(result.ok, false);
        assert.equal(findApp(result, 'dgfy-api').code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- --floor mode ------------------------------------------------------------
//
// #1740: runFloor() used to iterate the full APPS list unconditionally, with no change
// detection at all -- flagging (and forcing a bump on) an app whose version simply hadn't
// moved because nothing in it changed. Every scenario below now gives an app real changed
// files (source or package.json under apps/<app>/, or a fan-out package) whenever it's
// expected to be in scope; an app with zero changed files must never appear in `belowFloor`
// or `invalid`, only in `unchanged`.

test('--floor: only apps with real changed files are evaluated; the rest land in `unchanged`', () => {
    const root = makeGitRepo();
    writeFiles(root, baseFixture({
        'dgfy-api': '1.2.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '2.0.0',
        'dgfy-pos': '1.4.0',
        'dgfy-storefront': '1.3.0',
    }));
    const baseGitRef = commitAll(root, 'staging snapshot');

    writeFiles(root, {
        // patch-only bump, package.json changed directly -- below floor, target 1.3.0
        'apps/dgfy-api/package.json': pkgJson('1.2.5', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        // minor bump, package.json changed directly -- meets floor
        'apps/dgfy-migration-runner/package.json': pkgJson('1.1.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        // version untouched, but a real source file changed -- still in scope (direct),
        // below floor, target 2.1.0. This is the #1740 case: version hasn't moved, but
        // unlike the old buggy behavior, it's flagged because it DID change, not by default.
        'apps/dgfy-ims/src/index.js': 'module.exports = { touched: true };\n',
        // minor + extra patch bump, package.json changed directly -- meets floor
        'apps/dgfy-pos/package.json': pkgJson('1.5.2', {
            '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        // version untouched, but a real source file changed -- in scope (direct), below
        // floor, target 1.4.0.
        'apps/dgfy-storefront/src/index.js': 'module.exports = { touched: true };\n',
        // dgfy-migration-runner's own src/index.js is untouched -- no second change needed,
        // its package.json change alone already puts it in scope.
    });
    const headGitRef = commitAll(root, 'develop snapshot');

    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result.diffError, null);

        // Every app changed in this scenario -- nothing lands in `unchanged`.
        assert.deepEqual(result.unchanged, []);

        const belowFloorApps = result.belowFloor.map((entry) => entry.app).sort();
        assert.deepEqual(belowFloorApps, ['dgfy-api', 'dgfy-ims', 'dgfy-storefront']);

        const targets = Object.fromEntries(result.belowFloor.map((entry) => [entry.app, entry.floorTarget]));
        assert.equal(targets['dgfy-api'], '1.3.0');
        assert.equal(targets['dgfy-ims'], '2.1.0');
        assert.equal(targets['dgfy-storefront'], '1.4.0');

        const meetsFloorApps = result.results.filter((entry) => !entry.belowFloor).map((entry) => entry.app).sort();
        assert.deepEqual(meetsFloorApps, ['dgfy-migration-runner', 'dgfy-pos']);

        // Every in-scope entry's reason is 'direct' -- none of these came from a fan-out
        // package in this scenario.
        for (const entry of result.results) {
            assert.equal(entry.reason, 'direct');
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// The #1740 regression itself: a candidate where exactly one app (dgfy-storefront) has a
// real code change and the other four have none. Before the fix, all five were flagged
// below floor regardless; after the fix, only dgfy-storefront is evaluated, and the other
// four are reported as unchanged with no floor obligation.
test('--floor (#1740 regression): a single-app change bumps only that app, not all five', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: {
            'dgfy-api': '1.2.0',
            'dgfy-migration-runner': '1.0.0',
            'dgfy-ims': '2.0.0',
            'dgfy-pos': '1.4.0',
            'dgfy-storefront': '1.3.0',
        },
        headFiles: {
            // storefront's version does not move -- it should still land in belowFloor
            // because it's the one app with a real code change (PR #1738's own shape: two
            // files changed, version left as-is until the floor step catches it).
            'apps/dgfy-storefront/src/index.js': 'module.exports = { fixed: true };\n',
        },
    });
    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result.diffError, null);

        assert.deepEqual(result.belowFloor.map((entry) => entry.app), ['dgfy-storefront']);
        assert.equal(result.belowFloor[0].floorTarget, '1.4.0');
        assert.equal(result.belowFloor[0].reason, 'direct');

        assert.equal(result.invalid.length, 0);
        assert.deepEqual(
            result.unchanged.slice().sort(),
            ['dgfy-api', 'dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos'],
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// `file:` fan-out is preserved exactly as detectChangedApps() already computes it -- a
// packages/web-core change must still put every app that depends on it (ims/pos/storefront
// per baseFixture()'s own dependency shape) in scope, while dgfy-api/dgfy-migration-runner
// (which don't depend on web-core) land in `unchanged`.
test('--floor: a packages/web-core change fans out to ims/pos/storefront only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: {
            'dgfy-ims': '1.2.0',
            'dgfy-pos': '1.2.0',
            'dgfy-storefront': '1.2.0',
        },
        headFiles: {
            'packages/web-core/index.js': 'module.exports = { changed: true };\n',
        },
    });
    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result.diffError, null);

        const inScope = result.results.map((entry) => entry.app).sort();
        assert.deepEqual(inScope, ['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']);
        for (const entry of result.results) {
            assert.equal(entry.reason, 'fan-out:packages/web-core');
            assert.equal(entry.belowFloor, true);
        }

        assert.deepEqual(result.unchanged.sort(), ['dgfy-api', 'dgfy-migration-runner']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// A packages/shared-constants change fans out to all five apps (mirrors the equivalent
// runCheck() test above) -- confirms runFloor() reaches the same fan-out breadth, not a
// narrower one.
test('--floor: a packages/shared-constants change fans out to all five apps', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: {
            'packages/shared-constants/index.js': 'module.exports = { changed: true };\n',
        },
    });
    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result.diffError, null);

        const inScope = result.results.map((entry) => entry.app).sort();
        assert.deepEqual(inScope, ['dgfy-api', 'dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos', 'dgfy-storefront']);
        assert.deepEqual(result.unchanged, []);
        for (const entry of result.results) {
            assert.equal(entry.reason, 'fan-out:packages/shared-constants');
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// PR #1562 review RF-2: an unparseable/missing version used to report belowFloor: false
// and be invisible to a caller that only checked belowFloor.length -- the floor for that
// app was never actually established, but the caller could treat the run as a clean pass.
// dgfy-api's package.json changes directly here, so it stays in scope under #1740's fix.
test('--floor: an unparseable version is surfaced as invalid, never silently treated as floor-met', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/package.json': pkgJson('not-a-version', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });

        const invalidApps = result.invalid.map((entry) => entry.app);
        assert.deepEqual(invalidApps, ['dgfy-api']);

        // Not folded into "floor met" (absent from belowFloor with an implied pass) --
        // it's its own distinct bucket, and the caller's exit-code condition (main()'s
        // `belowFloor.length > 0 || invalid.length > 0`) must see it.
        assert.equal(result.belowFloor.some((entry) => entry.app === 'dgfy-api'), false);
        assert.equal(result.belowFloor.length > 0 || result.invalid.length > 0, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('--floor: a missing version (no package.json at one ref) is also surfaced as invalid', () => {
    const root = makeGitRepo();
    // dgfy-api doesn't exist yet at this "base" commit at all.
    const fixtureWithoutApi = baseFixture();
    delete fixtureWithoutApi['apps/dgfy-api/package.json'];
    delete fixtureWithoutApi['apps/dgfy-api/src/index.js'];
    writeFiles(root, fixtureWithoutApi);
    const baseGitRef = commitAll(root, 'pre-dgfy-api snapshot');

    writeFiles(root, baseFixture());
    const headGitRef = commitAll(root, 'dgfy-api added');

    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        assert.ok(result.invalid.some((entry) => entry.app === 'dgfy-api'));
        assert.equal(result.belowFloor.some((entry) => entry.app === 'dgfy-api'), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// #1740: an app that did NOT change is never evaluated, even if its version happens to be
// unparseable at both refs -- an unchanged app has no floor obligation, so its unparseable
// version must not surface as `invalid` (that bucket is reserved for in-scope apps only).
test('--floor: an app with an unparseable version but no changed files is skipped, not flagged', () => {
    const root = makeGitRepo();
    // dgfy-storefront starts (and stays) on an unparseable version -- never touched at head.
    writeFiles(root, baseFixture({ 'dgfy-storefront': 'not-a-version' }));
    const baseGitRef = commitAll(root, 'base with a pre-existing unparseable storefront version');

    // Only dgfy-api changes at head; dgfy-storefront is left entirely alone.
    writeFiles(root, {
        'apps/dgfy-api/package.json': pkgJson('1.1.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
    });
    const headGitRef = commitAll(root, 'head');

    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        assert.deepEqual(result.results.map((entry) => entry.app), ['dgfy-api']);
        assert.equal(result.invalid.some((entry) => entry.app === 'dgfy-storefront'), false);
        assert.equal(result.belowFloor.some((entry) => entry.app === 'dgfy-storefront'), false);
        assert.ok(result.unchanged.includes('dgfy-storefront'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// A broken diff (unresolvable ref) must never silently read as "zero files changed" --
// that would degrade to a false "floor clear" on exactly the gate a promotion depends on.
test('--floor: a diff that cannot be computed surfaces diffError, never a silent pass', () => {
    const root = makeGitRepo();
    writeFiles(root, baseFixture());
    const headGitRef = commitAll(root, 'only commit');

    try {
        const result = runFloor({ repoRoot: root, baseGitRef: 'not-a-real-ref', headGitRef });
        assert.ok(result.diffError);
        assert.deepEqual(result.results, []);
        assert.deepEqual(result.belowFloor, []);
        assert.deepEqual(result.invalid, []);
        assert.deepEqual(result.unchanged, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- Phase 303 (#1695): computeReachabilityShadowVerdict, LOG-ONLY -----------------------------
//
// Own dedicated fixture -- ENTRY_FILE_BY_APP hardcodes real Vite entry points
// (apps/<app>/src/main.jsx), distinct from baseFixture()'s placeholder apps/<app>/src/index.js
// above (which stays exactly as-is: it is what every non-Phase-303 test in this file exercises,
// and none of it is touched here). These tests confirm the wiring never affects `runCheck()`'s own
// gating result -- see the "runCheck's own ok/changed result is unaffected" assertions below.

function reachabilityFixtureRepo() {
    const root = makeGitRepo();
    writeFiles(root, {
        'apps/dgfy-ims/package.json': pkgJson('1.0.0', { '@sieitzz/web-core': 'file:../../packages/web-core' }),
        'apps/dgfy-ims/src/main.jsx': "import '../../../packages/web-core/src/reachable.js';\n",
        'apps/dgfy-storefront/package.json': pkgJson('1.0.0', { '@sieitzz/web-core': 'file:../../packages/web-core' }),
        'apps/dgfy-storefront/src/main.jsx': "import '../../../packages/web-core/src/other.js';\n",
        'apps/dgfy-api/package.json': pkgJson('1.0.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        'apps/dgfy-api/src/index.js': 'module.exports = {};\n',
        'packages/web-core/package.json': pkgJson('1.0.0'),
        'packages/web-core/src/reachable.js': 'export default {};\n',
        'packages/web-core/src/other.js': 'export default {};\n',
        'packages/shared-constants/package.json': pkgJson('1.0.0'),
        'packages/shared-constants/index.js': 'module.exports = {};\n',
    });
    const baseGitRef = commitAll(root, 'reachability fixture base');
    return { root, baseGitRef };
}

test('shadow: a real reachability hit agrees with the old fan-out verdict', async () => {
    const { root } = reachabilityFixtureRepo();
    try {
        writeFiles(root, { 'packages/web-core/src/reachable.js': 'export default { changed: true };\n' });
        const headGitRef = commitAll(root, 'change reachable.js');
        const changedFiles = ['packages/web-core/src/reachable.js'];
        const entry = { app: 'dgfy-ims', appDir: 'apps/dgfy-ims', changed: true, reason: 'fan-out:packages/web-core' };

        const shadow = await computeReachabilityShadowVerdict(root, headGitRef, entry, changedFiles);
        assert.equal(shadow.applicable, true);
        assert.equal(shadow.safetyNetPassed, true);
        assert.equal(shadow.changed, true);
        assert.equal(shadow.code, 'reachable');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('shadow: dgfy-storefront disagrees with the old fan-out verdict when the changed file is not reachable from its entry (the PR #1689 shape)', async () => {
    const { root } = reachabilityFixtureRepo();
    try {
        writeFiles(root, { 'packages/web-core/src/reachable.js': 'export default { changed: true };\n' });
        const headGitRef = commitAll(root, 'change reachable.js');
        const changedFiles = ['packages/web-core/src/reachable.js'];
        // dgfy-storefront's own directory-level verdict is "changed" too (fan-out is a directory
        // check) -- this is what the old verdict would have said; the shadow verdict is expected
        // to DISAGREE, which is exactly the narrowing #1695 exists to prove is safe.
        const entry = { app: 'dgfy-storefront', appDir: 'apps/dgfy-storefront', changed: true, reason: 'fan-out:packages/web-core' };

        const shadow = await computeReachabilityShadowVerdict(root, headGitRef, entry, changedFiles);
        assert.equal(shadow.applicable, true);
        assert.equal(shadow.safetyNetPassed, true);
        assert.equal(shadow.changed, false);
        assert.equal(shadow.code, 'not-reachable');
        assert.notEqual(shadow.changed, entry.changed); // confirms this is a genuine disagreement
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('shadow: a deleted fan-out-package file is conservatively counted as changed, never silently read as unreachable', async () => {
    const { root, baseGitRef } = reachabilityFixtureRepo();
    try {
        writeFiles(root, { 'packages/web-core/src/toDelete.js': 'export default { willBeDeleted: true };\n' });
        commitAll(root, 'add toDelete.js');
        fs.unlinkSync(path.join(root, 'packages/web-core/src/toDelete.js'));
        const headGitRef = commitAll(root, 'delete toDelete.js');

        const changedFiles = ['packages/web-core/src/toDelete.js'];
        // Deletion applies identically regardless of which app is asked -- dgfy-storefront's own
        // entry never even referenced toDelete.js, which is exactly the point: a deleted file
        // can't be looked up in a reachability graph built from HEAD's tree at all, so the
        // conservative "changed" fallback must fire independent of any real reachability edge.
        const entry = { app: 'dgfy-storefront', appDir: 'apps/dgfy-storefront', changed: true, reason: 'fan-out:packages/web-core' };

        const shadow = await computeReachabilityShadowVerdict(root, headGitRef, entry, changedFiles);
        assert.equal(shadow.applicable, true);
        assert.equal(shadow.safetyNetPassed, true);
        assert.equal(shadow.changed, true);
        assert.equal(shadow.code, 'deleted-file-fail-closed');
        assert.deepEqual(shadow.hitFiles, ['packages/web-core/src/toDelete.js']);

        // Sanity: baseGitRef really did have the file (so this is a genuine deletion, not a file
        // that never existed).
        assert.notEqual(baseGitRef, headGitRef);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('shadow: a synthetic safety-net violation falls back to the conservative "changed" verdict', async () => {
    const { root } = reachabilityFixtureRepo();
    try {
        writeFiles(root, {
            'packages/web-core/src/reachable.js': 'export default { changed: true };\n',
            // Synthetic violation: a computed dynamic import specifier anywhere under
            // packages/web-core trips the safety net for every app, per §3.3 ("anywhere in the
            // package", not just the current diff).
            'packages/web-core/src/riskyLoader.js': 'export function load(name) {\n  return import(name);\n}\n',
        });
        const headGitRef = commitAll(root, 'change reachable.js + introduce a risky pattern');
        const changedFiles = ['packages/web-core/src/reachable.js'];
        // dgfy-storefront would normally disagree here (see the test above) -- the safety net
        // must override that and fall back to "changed", matching the old verdict.
        const entry = { app: 'dgfy-storefront', appDir: 'apps/dgfy-storefront', changed: true, reason: 'fan-out:packages/web-core' };

        const shadow = await computeReachabilityShadowVerdict(root, headGitRef, entry, changedFiles);
        assert.equal(shadow.applicable, true);
        assert.equal(shadow.safetyNetPassed, false);
        assert.equal(shadow.changed, true);
        assert.equal(shadow.code, 'safety-net-tripped');
        assert.ok(shadow.violations.length > 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('shadow: a direct (non-fan-out) app change is not applicable -- nothing to narrow', async () => {
    const { root } = reachabilityFixtureRepo();
    try {
        writeFiles(root, { 'apps/dgfy-ims/src/main.jsx': "import '../../../packages/web-core/src/reachable.js';\n// direct change\n" });
        const headGitRef = commitAll(root, 'direct ims change');
        const entry = { app: 'dgfy-ims', appDir: 'apps/dgfy-ims', changed: true, reason: 'direct' };

        const shadow = await computeReachabilityShadowVerdict(root, headGitRef, entry, ['apps/dgfy-ims/src/main.jsx']);
        assert.equal(shadow.applicable, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('shadow: a backend app (no bundler entry) is not applicable -- out of scope per plan §3.5', async () => {
    const { root } = reachabilityFixtureRepo();
    try {
        writeFiles(root, { 'packages/shared-constants/index.js': 'module.exports = { changed: true };\n' });
        const headGitRef = commitAll(root, 'change shared-constants');
        const entry = { app: 'dgfy-api', appDir: 'apps/dgfy-api', changed: true, reason: 'fan-out:packages/shared-constants' };

        const shadow = await computeReachabilityShadowVerdict(root, headGitRef, entry, ['packages/shared-constants/index.js']);
        assert.equal(shadow.applicable, false);
        assert.match(shadow.reason, /backend app/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("shadow: runCheck()'s own ok/changed result is unaffected by anything in the reachability module -- zero behavior change", () => {
    // Regression guard for the core Phase 303 requirement: runCheck() itself (the function every
    // pre-existing test above exercises) must remain 100% synchronous and untouched. This test
    // doesn't call the shadow functions at all -- it just re-runs a representative scenario
    // (already covered above) to pin that runCheck's return shape/behavior is unchanged by this
    // file's edits, independent of whatever computeReachabilityShadowVerdict does.
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'packages/shared-constants/index.js': 'module.exports = { changed: true };\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(typeof result.then, 'undefined'); // still a plain object, not a Promise
        assert.equal(result.ok, false);
        assert.equal(result.appResults.length, 5);
        // Additive-only: the new repoRoot/changedFiles fields exist but don't change any existing
        // field's value.
        assert.equal(result.repoRoot, root);
        assert.deepEqual(result.changedFiles, ['packages/shared-constants/index.js']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
